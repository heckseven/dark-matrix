import { useEffect, useRef, useState, useCallback } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { useDesignerStore, designerStore } from '../store.js';
import type { AudioStyle, AudioSource } from '../store.js';
import { AUDIO_STYLES, createRenderer } from '../../../animations/audio-renderers.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';

const COLS = 9;
const ROWS = 34;

function makeFrame(fill: (c: number, r: number) => number): string {
  const data = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      data[c * ROWS + r] = fill(c, r);
  return btoa(String.fromCharCode(...data));
}

const EQ_H    = [10, 16, 22, 28, 30, 28, 22, 16, 10] as const;
const SPEC_H  = [ 4,  7, 10, 13, 14, 13, 10,  7,  4] as const;
const CTR     = Math.floor(ROWS / 2);
const VU_BAR  = ROWS - 24;
const VU_PEAK = ROWS - 1 - 28;

const PLACEHOLDER: Record<AudioStyle, string> = {
  'eq-bars':         makeFrame((c, r) => r >= ROWS - EQ_H[c]! ? 255 : 0),
  'spectrum-fall':   makeFrame((c, r) => Math.abs(r - CTR) <= SPEC_H[c]! ? 255 - Math.round((r / (ROWS - 1)) * 255) : 0),
  'vu-meter':        makeFrame((_c, r) => r >= VU_BAR || r === VU_PEAK ? 255 : 0),
  'vu-sparks':       makeFrame((c, r) => r >= VU_BAR ? ((c * 7 + r * 11) % 9 < 7 ? 255 : 0) : r === VU_PEAK ? 255 : 0),
  'dark-matter':     makeFrame((c, r) => { const t = ROWS - EQ_H[c]!; return r === t - 2 ? 255 : r >= t ? ((c * 13 + r * 7) % 11 < 9 ? 255 : 0) : 0; }),
  'neo':             makeFrame((c, r) => { const head = [6, 20, 11, 3, 16, 26, 8, 14, 22][c]!; const d = r - head; return d >= 0 && d < 9 ? Math.round(255 * Math.pow(0.65, d)) : 0; }),
  'cipher':          makeFrame((c, r) => (c * 17 + r * 31) % 7 < 4 ? 255 : 0),
  'wake':            makeFrame((_c, r) => Math.max(Math.round(255 * Math.pow(0.86, Math.abs(r - 7) * 1.1)), Math.round(255 * Math.pow(0.86, Math.abs(r - 23) * 1.1)))),
  'ripple':          makeFrame((c, r) => { const cx = 4, cy = 17; const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2); return Math.round(Math.max(0, Math.max(1 - Math.abs(d - 5) / 1.5, 1 - Math.abs(d - 11) / 1.5)) * 255); }),
  'life':            makeFrame((c, r) => (c * 17 + r * 31 + c * r * 7) % 11 < 3 ? 255 : 0),
  'life-strict':     makeFrame((c, r) => (c * 13 + r * 29 + c * r * 11) % 15 < 3 ? 255 : 0),
  'life-pulse':      makeFrame((c, r) => (c * 11 + r * 23 + c * r * 13) % 17 < 3 ? 255 : 0),
  'life-wave':       makeFrame((c, r) => (c * 7 + r * 19) % 17 < 2 ? 255 : 0),
  'bounce':          makeFrame((c, r) => r === ROWS - 1 - [0, 4, 10, 16, 20, 16, 10, 4, 0][c]! ? 255 : 0),
  'waterfall':       makeFrame((_c, r) => Math.round((r / (ROWS - 1)) * 255)),
  'sparks':          makeFrame((c, r) => ((c * 7 + r * 11) % 13 < Math.round((1 - r / (ROWS - 1)) * 6)) ? 255 : 0),
  'flame-bars':      makeFrame((c, r) => r >= ROWS - (EQ_H[c]! + (c % 3 === 0 ? 4 : c % 3 === 1 ? -3 : 2)) ? 255 : 0),
};

const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;

function frameToB64(frame: Uint8Array): string {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
      out[col * ROWS + row] = (frame[col * ROWS + row] ?? 0) > threshold ? 255 : 0;
    }
  }
  return btoa(String.fromCharCode(...out));
}

function mirrorFrame(b64: string): string {
  const src = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  const dst = new Uint8Array(COLS * 2 * ROWS);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = src[c * ROWS + r] ?? 0;
      dst[c * ROWS + r] = v;
      dst[(COLS * 2 - 1 - c) * ROWS + r] = v;
    }
  }
  return btoa(String.fromCharCode(...dst));
}

function AudioStyleCard({
  label,
  active,
  pixels,
  dualModule,
  onSelect,
}: {
  label: string;
  active: boolean;
  pixels: string;
  dualModule: boolean;
  onSelect: () => void;
}) {
  const c = { position: 'absolute' as const, width: 16, height: 16, pointerEvents: 'none' as const };
  const b = `1px solid ${active ? 'white' : 'rgba(255,255,255,0.35)'}`;

  return (
    <button
      aria-label={`${label} visualizer${active ? ' (active)' : ''}`}
      aria-pressed={active}
      className="group relative flex flex-col gap-3 items-center rounded-sm p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onSelect}
    >
      <div aria-hidden="true" className={`absolute inset-0 pointer-events-none transition-opacity ${active ? '' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
        <span style={{ ...c, top: 0,    left: 0,    borderTop: b, borderLeft: b }} />
        <span style={{ ...c, top: 0,    right: 0,   borderTop: b, borderRight: b }} />
        <span style={{ ...c, bottom: 0, left: 0,    borderBottom: b, borderLeft: b }} />
        <span style={{ ...c, bottom: 0, right: 0,   borderBottom: b, borderRight: b }} />
      </div>
      <MatrixPreview pixels={pixels} width={dualModule ? 18 : 9} />
      <span className="font-mono text-xs text-foreground">{label}</span>
    </button>
  );
}

function SourceToggle({ value, onChange }: { value: AudioSource; onChange: (s: AudioSource) => void }) {
  return (
    <div className="flex items-center gap-0 font-mono text-xs border border-foreground/30">
      {(['monitor', 'mic'] as const).map((src) => (
        <button
          key={src}
          aria-pressed={value === src}
          className={`px-4 py-1 transition-colors ${value === src ? 'bg-foreground text-background' : 'text-foreground/60 hover:text-foreground'}`}
          onClick={() => onChange(src)}
        >
          {src}
        </button>
      ))}
    </div>
  );
}

export function AudioPanel({ dualModule = false }: { dualModule?: boolean }) {
  const audioStyle = useDesignerStore(s => s.audioStyle);
  const audioSource = useDesignerStore(s => s.audioSource);
  const [livePixels, setLivePixels] = useState<Partial<Record<AudioStyle, string>>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const renderersRef = useRef<Record<AudioStyle, ReturnType<typeof createRenderer>> | null>(null);
  if (!renderersRef.current) {
    renderersRef.current = Object.fromEntries(
      AUDIO_STYLES.map(({ id }) => [id, createRenderer(id as AudioStyle)])
    ) as Record<AudioStyle, ReturnType<typeof createRenderer>>;
  }

  const sendViz = useCallback((source: AudioSource, style: AudioStyle) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'audio-viz', style, source }));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      const { audioStyle: style, audioSource: source } = designerStore.getState();
      ws.send(JSON.stringify({ type: 'audio-viz', style, source }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; bands?: number[]; fftSize?: number; gain?: number };
        if (msg.type === 'audio-bands' && msg.bands) {
          const ctx: RenderCtx = { bands: msg.bands, fftSize: msg.fftSize ?? 2048, gain: msg.gain ?? 1.0 };
          const renderers = renderersRef.current!;
          const next: Partial<Record<AudioStyle, string>> = {};
          for (const { id } of AUDIO_STYLES) {
            next[id as AudioStyle] = frameToB64(renderers[id as AudioStyle]!(ctx));
          }
          setLivePixels(next);
        }
      } catch { /* ignore */ }
    };

    return () => {
      const w = wsRef.current;
      wsRef.current = null;
      if (w && w.readyState === WebSocket.OPEN) {
        w.send(JSON.stringify({ type: 'audio-viz-stop' }));
      }
      w?.close();
    };
  }, []);

  useEffect(() => {
    sendViz(audioSource, audioStyle);
  }, [audioStyle, audioSource, sendViz]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 px-8 py-8 overflow-y-auto">
      <SourceToggle
        value={audioSource}
        onChange={(src) => designerStore.getState().setAudioSource(src)}
      />

      <div className="grid grid-cols-7 gap-6">
        {AUDIO_STYLES.map(({ id, label }) => {
          const active = audioStyle === id;
          const base = livePixels[id as AudioStyle] ?? PLACEHOLDER[id as AudioStyle]!;
          const pixels = dualModule ? mirrorFrame(base) : base;
          return (
            <AudioStyleCard
              key={id}
              label={label}
              active={active}
              pixels={pixels}
              dualModule={dualModule}
              onSelect={() => designerStore.getState().setAudioStyle(id as AudioStyle)}
            />
          );
        })}
      </div>
    </div>
  );
}
