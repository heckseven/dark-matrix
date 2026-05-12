import { useEffect, useRef, useState, useCallback } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { useDesignerStore, designerStore } from '../store.js';
import type { AudioStyle, AudioSource } from '../store.js';
import { AUDIO_STYLES } from '../../../animations/audio-renderers.js';

const COLS = 9;
const ROWS = 34;
const BLANK = btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));

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
const VU_BAR  = ROWS - 24;           // bar fills bottom 24 rows
const VU_PEAK = ROWS - 1 - 28;       // peak dot near top

const PLACEHOLDER: Record<AudioStyle, string> = {
  'eq-bars':         makeFrame((c, r) => r >= ROWS - EQ_H[c]! ? 255 : 0),
  'spectrum-mirror': makeFrame((c, r) => Math.abs(r - CTR) <= SPEC_H[c]! ? 255 : 0),
  'vu-meter':        makeFrame((_c, r) => r >= VU_BAR || r === VU_PEAK ? 255 : 0),
  'vu-sparks':       makeFrame((c, r) => r >= VU_BAR ? ((c * 7 + r * 11) % 9 < 7 ? 255 : 0) : r === VU_PEAK ? 255 : 0),
  'dark-matter':     makeFrame((c, r) => { const t = ROWS - EQ_H[c]!; return r === t - 2 ? 255 : r >= t ? ((c * 13 + r * 7) % 11 < 9 ? 255 : 0) : 0; }),
  'bounce':          makeFrame((c, r) => r === ROWS - 1 - [0, 4, 10, 16, 20, 16, 10, 4, 0][c]! ? 255 : 0),
  'waterfall':       makeFrame((_c, r) => Math.round((r / (ROWS - 1)) * 255)),
  'sparks':          makeFrame((c, r) => ((c * 7 + r * 11) % 13 < Math.round((1 - r / (ROWS - 1)) * 6)) ? 255 : 0),
  'flame-bars':      makeFrame((c, r) => r >= ROWS - (EQ_H[c]! + (c % 3 === 0 ? 4 : c % 3 === 1 ? -3 : 2)) ? 255 : 0),
};

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

function resolvePixels(id: AudioStyle, livePixels: string, active: boolean, dualModule: boolean): string {
  const base = active && livePixels !== BLANK ? livePixels : PLACEHOLDER[id];
  return dualModule ? mirrorFrame(base) : base;
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
  const [livePixels, setLivePixels] = useState(BLANK);
  const wsRef = useRef<WebSocket | null>(null);

  const sendViz = useCallback((style: AudioStyle, source: AudioSource) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setLivePixels(BLANK);
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
        const msg = JSON.parse(e.data as string) as { type: string; frame?: string };
        if (msg.type === 'audio-frame' && msg.frame) setLivePixels(msg.frame);
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
    sendViz(audioStyle, audioSource);
  }, [audioStyle, audioSource, sendViz]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 px-8 py-8 overflow-y-auto">
      <SourceToggle
        value={audioSource}
        onChange={(src) => designerStore.getState().setAudioSource(src)}
      />

      <div className="grid grid-cols-3 gap-8">
        {AUDIO_STYLES.map(({ id, label }) => {
          const active = audioStyle === id;
          return (
            <AudioStyleCard
              key={id}
              label={label}
              active={active}
              pixels={resolvePixels(id, livePixels, active, dualModule)}
              dualModule={dualModule}
              onSelect={() => designerStore.getState().setAudioStyle(id as AudioStyle)}
            />
          );
        })}
      </div>
    </div>
  );
}
