import { useEffect, useRef, useState, useCallback } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { useDesignerStore, designerStore } from '../store.js';
import type { AudioStyle, AudioSource } from '../store.js';
import { AUDIO_STYLES } from '../../../animations/audio-renderers.js';

const BLANK = btoa(String.fromCharCode(...new Uint8Array(9 * 34)));

function AudioStyleCard({
  label,
  active,
  pixels,
  onSelect,
}: {
  label: string;
  active: boolean;
  pixels: string;
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
      <MatrixPreview pixels={pixels} width={9} />
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

export function AudioPanel() {
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
              pixels={active ? livePixels : BLANK}
              onSelect={() => designerStore.getState().setAudioStyle(id as AudioStyle)}
            />
          );
        })}
      </div>
    </div>
  );
}
