import { useState, useEffect, useRef, useMemo } from 'react';
import { AUDIO_STYLES, LAB_PARAMS, createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle, RenderCtx } from '../../../animations/audio-renderers.js';
import { MatrixPreview } from './MatrixPreview.js';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { Slider } from './ui/slider.js';

const COLS = 9;
const ROWS = 34;

// ── mock audio (fallback when WS not connected) ────────────────────────────

const BASE_BANDS = [210, 165, 125, 90, 62, 42, 26, 13, 6];

function mockAudio(tick: number): RenderCtx {
  const beat = Math.max(0, Math.sin(tick * 0.06)) ** 1.5;
  const slow = 0.2 + 0.8 * Math.max(0, Math.sin(tick * 0.018));
  const bands = BASE_BANDS.map((base, i) => {
    const level = i < 3 ? beat : slow;
    return Math.max(2, base * (0.15 + 0.85 * level) * (0.75 + Math.random() * 0.5));
  });
  return { bands, fftSize: 2048, gain: 1.5 };
}

function frameToB64(frame: Uint8Array): string {
  return btoa(String.fromCharCode(...frame));
}

const EMPTY_PIXELS = frameToB64(new Uint8Array(COLS * ROWS));

// ── cell state ─────────────────────────────────────────────────────────────

type CellState = { id: string; style: AudioStyle; params: Record<string, number> };

let _uid = 0;
function uid(): string { return String(++_uid); }

function defaultParams(style: AudioStyle): Record<string, number> {
  return Object.fromEntries((LAB_PARAMS[style] ?? []).map(p => [p.key, p.default]));
}

// ── single cell ────────────────────────────────────────────────────────────

function LabCell({ cell, audioCtx, onClone, onRemove, onChange }: {
  cell: CellState;
  audioCtx: RenderCtx;
  onClone: () => void;
  onRemove: () => void;
  onChange: (style: AudioStyle, params: Record<string, number>) => void;
}) {
  const audioRef = useRef(audioCtx);
  audioRef.current = audioCtx;

  const renderer = useMemo(
    () => createAudioRenderer(cell.style, cell.params),
    // Recreate renderer on style/param change; JSON.stringify intentional for dev-tool use
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cell.style, JSON.stringify(cell.params)],
  );
  const rendererRef = useRef(renderer);
  rendererRef.current = renderer;

  const [pixels, setPixels] = useState<string>(EMPTY_PIXELS);

  useEffect(() => {
    const id = setInterval(() => {
      const frame = rendererRef.current(audioRef.current);
      setPixels(frameToB64(frame));
    }, 80);
    return () => clearInterval(id);
  }, []);

  const params = LAB_PARAMS[cell.style] ?? [];

  function setStyle(next: AudioStyle) { onChange(next, defaultParams(next)); }
  function setParam(key: string, val: number) { onChange(cell.style, { ...cell.params, [key]: val }); }

  return (
    <div className="flex flex-col gap-2 p-3 border border-border rounded bg-background" style={{ minWidth: 180 }}>
      <div className="flex items-center gap-1">
        <Select value={cell.style} onChange={e => setStyle(e.target.value as AudioStyle)} className="flex-1">
          {AUDIO_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Button variant="ghost" size="sm" tooltip="Clone" onClick={onClone}>⎘</Button>
        <Button variant="destructive" size="sm" tooltip="Remove" onClick={onRemove}>×</Button>
      </div>

      <div className="flex justify-center">
        <MatrixPreview pixels={pixels} width={9} />
      </div>

      {params.map(p => {
        const val = cell.params[p.key] ?? p.default;
        return (
          <div key={p.key} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{p.label}</span>
            <Slider min={p.min} max={p.max} step={p.step} value={val}
              onChange={e => setParam(p.key, Number(e.target.value))} />
          </div>
        );
      })}
    </div>
  );
}

// ── lab root ───────────────────────────────────────────────────────────────

type AudioSource = 'monitor' | 'mic';
const INITIAL_STYLES: AudioStyle[] = ['life-erode-4'];

export function AudioLab() {
  const [cells, setCells] = useState<CellState[]>(() =>
    INITIAL_STYLES.map(s => ({ id: uid(), style: s, params: defaultParams(s) }))
  );
  const [audioCtx, setAudioCtx] = useState<RenderCtx>(() => mockAudio(0));
  const [source, setSource] = useState<AudioSource>('monitor');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const wsLiveRef = useRef(false);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const tickRef = useRef(0);

  // Mock audio tick — only fires when WS isn't providing real bands
  useEffect(() => {
    const id = setInterval(() => {
      if (wsLiveRef.current) return;
      tickRef.current += 1;
      setAudioCtx(mockAudio(tickRef.current));
    }, 80);
    return () => clearInterval(id);
  }, []);

  // WS connection
  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      wsLiveRef.current = true;
      setWsStatus('live');
      ws.send(JSON.stringify({ type: 'hud-audio-bands-subscribe', source: sourceRef.current }));
    });

    ws.addEventListener('message', (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; bands?: number[]; fftSize?: number; gain?: number };
        if (msg.type === 'audio-bands' && msg.bands) {
          setAudioCtx({ bands: msg.bands, fftSize: msg.fftSize ?? 2048, gain: msg.gain ?? 1.0 });
        }
      } catch { /* ignore */ }
    });

    ws.addEventListener('close', () => { wsLiveRef.current = false; setWsStatus('offline'); });
    ws.addEventListener('error', () => { wsLiveRef.current = false; setWsStatus('offline'); });

    return () => {
      wsLiveRef.current = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'hud-audio-bands-unsubscribe' }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, []);

  function changeSource(s: AudioSource) {
    setSource(s);
    sourceRef.current = s;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'hud-audio-bands-subscribe', source: s }));
    }
  }

  function addCell() {
    setCells(cs => [...cs, { id: uid(), style: 'life-erode-4', params: defaultParams('life-erode-4') }]);
  }

  function cloneCell(cellId: string) {
    setCells(cs => {
      const idx = cs.findIndex(c => c.id === cellId);
      if (idx === -1) return cs;
      const src = cs[idx]!;
      return [...cs.slice(0, idx + 1), { ...src, id: uid() }, ...cs.slice(idx + 1)];
    });
  }

  function removeCell(cellId: string) {
    setCells(cs => cs.filter(c => c.id !== cellId));
  }

  function updateCell(cellId: string, style: AudioStyle, params: Record<string, number>) {
    setCells(cs => cs.map(c => c.id === cellId ? { ...c, style, params } : c));
  }

  const statusDot = wsStatus === 'live' ? 'text-green-400' : wsStatus === 'connecting' ? 'text-yellow-400' : 'text-muted-foreground';

  return (
    <div className="min-h-screen bg-background text-foreground p-5 font-mono">
      <div className="flex items-center gap-4 mb-5">
        <span className="text-xs text-muted-foreground">audio lab</span>
        <span className={`text-xs ${statusDot}`}>● {wsStatus}</span>
        <Select value={source} onChange={e => changeSource(e.target.value as AudioSource)}>
          <option value="monitor">monitor</option>
          <option value="mic">mic</option>
        </Select>
        <Button variant="default" size="sm" onClick={addCell}>+ add cell</Button>
        <span className="text-xs text-muted-foreground ml-auto">raw grayscale · hardware thresholds at 128</span>
        <a href="?lab=notifications" className="text-xs text-muted-foreground hover:text-foreground transition-colors">notification lab →</a>
      </div>

      <div className="flex flex-wrap gap-3 items-start">
        {cells.map(cell => (
          <LabCell
            key={cell.id}
            cell={cell}
            audioCtx={audioCtx}
            onClone={() => cloneCell(cell.id)}
            onRemove={() => removeCell(cell.id)}
            onChange={(style, params) => updateCell(cell.id, style, params)}
          />
        ))}
      </div>
    </div>
  );
}
