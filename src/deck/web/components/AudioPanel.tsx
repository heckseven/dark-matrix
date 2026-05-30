import { useEffect, useRef, useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { useDeckStore, deckStore } from '../store.js';
import { MatrixItem } from './MatrixItem.js';
import type { AudioStyle, AudioSource } from '../store.js';
import { AUDIO_STYLES, createRenderer } from '../../../animations/audio-renderers.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import { AudioFullscreen } from './AudioFullscreen.js';
import { PLACEHOLDER, frameToB64, mirrorFrame } from './audio-viz-frames.js';

export function AudioPanel({
  dualModule = false,
  fullscreenStyle = null,
  onFullscreenChange = () => {},
  onFullscreenIdleChange = () => {},
  gainMultiplierRef,
}: {
  dualModule?: boolean;
  fullscreenStyle?: AudioStyle | null;
  onFullscreenChange?: (style: AudioStyle | null) => void;
  onFullscreenIdleChange?: (idle: boolean) => void;
  gainMultiplierRef?: RefObject<number>;
}) {
  const audioStyle = useDeckStore(s => s.audioStyle);
  const audioSource = useDeckStore(s => s.audioSource);
  const [livePixels, setLivePixels] = useState<Partial<Record<AudioStyle, string>>>({});
  const defaultGainRef = useRef(1.0);
  const activeGainRef = gainMultiplierRef ?? defaultGainRef;
  const wsRef = useRef<WebSocket | null>(null);
  const fullBandsRef = useRef<number[] | null>(null);
  const fftSizeRef = useRef<number>(2048);
  const gainRef = useRef<number>(1.0);
  const bandCountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const prevStyleRef = useRef<AudioStyle | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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

  const sendSetBands = useCallback((n: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'audio-viz-setbands', bandCount: n }));
  }, []);

  const handleBandCountChange = useCallback((n: number) => {
    if (bandCountDebounceRef.current) clearTimeout(bandCountDebounceRef.current);
    bandCountDebounceRef.current = setTimeout(() => sendSetBands(n), 200);
  }, [sendSetBands]);

  // Inert grid + restore focus when fullscreen opens/closes
  useEffect(() => {
    const prev = prevStyleRef.current;
    prevStyleRef.current = fullscreenStyle;
    const grid = gridRef.current;
    if (fullscreenStyle !== null) {
      if (grid) grid.setAttribute('inert', '');
    } else {
      if (grid) grid.removeAttribute('inert');
      if (prev !== null) {
        fullBandsRef.current = null;
        sendSetBands(0);
        const trigger = triggerRef.current;
        triggerRef.current = null;
        if (trigger) setTimeout(() => trigger.focus(), 0);
      }
    }
  }, [fullscreenStyle, sendSetBands]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      const { audioStyle: style, audioSource: source } = deckStore.getState();
      ws.send(JSON.stringify({ type: 'audio-viz', style, source }));
    };

    ws.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string') return;
        const msg = JSON.parse(e.data) as { type: string; bands?: number[]; fftSize?: number; gain?: number; fullBands?: number[] };
        if (msg.type === 'audio-bands' && msg.bands) {
          fftSizeRef.current = msg.fftSize ?? 2048;
          gainRef.current = msg.gain ?? 1.0;
          if (msg.fullBands) fullBandsRef.current = msg.fullBands;
          const ctx: RenderCtx = { bands: msg.bands, fftSize: msg.fftSize ?? 2048, gain: (msg.gain ?? 1.0) * activeGainRef.current };
          const renderers = renderersRef.current!;
          const next: Partial<Record<AudioStyle, string>> = {};
          for (const { id } of AUDIO_STYLES) {
            const fn = renderers[id as AudioStyle];
            if (fn) next[id as AudioStyle] = frameToB64(fn(ctx));
          }
          setLivePixels(next);
        }
      } catch { /* ignore */ }
    };

    return () => {
      const w = wsRef.current;
      wsRef.current = null;
      if (bandCountDebounceRef.current) { clearTimeout(bandCountDebounceRef.current); bandCountDebounceRef.current = null; }
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
    <div className="flex-1 relative flex flex-col items-center justify-center gap-10 px-8 py-8 overflow-y-auto overflow-x-hidden">
      <div ref={gridRef} role="group" aria-label="Audio visualizer style" className="grid grid-cols-7 gap-6 justify-items-center">
        {AUDIO_STYLES.map(({ id, label }) => {
          const active = audioStyle === id;
          const base = livePixels[id as AudioStyle] ?? PLACEHOLDER[id as AudioStyle]!;
          const pixels = dualModule ? mirrorFrame(base) : base;
          return (
            <MatrixItem
              key={id}
              name={label}
              aria-label={`${label} visualizer`}
              width={dualModule ? 18 : 9}
              pixels={pixels}
              isSelected={active}
              onSelect={() => {
                if (document.activeElement instanceof HTMLElement) triggerRef.current = document.activeElement;
                deckStore.getState().setAudioStyle(id as AudioStyle);
                onFullscreenChange(id as AudioStyle);
              }}
            />
          );
        })}
      </div>
      {fullscreenStyle !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${AUDIO_STYLES.find(s => s.id === fullscreenStyle)?.label ?? fullscreenStyle} visualizer fullscreen`}
          className="absolute inset-0 z-10 flex"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'color-mix(in srgb, var(--color-background) 88%, transparent)' }}
        >
          <AudioFullscreen
            style={fullscreenStyle}
            fullBandsRef={fullBandsRef}
            fftSizeRef={fftSizeRef}
            gainRef={gainRef}
            gainMultiplierRef={activeGainRef}
            onBandCountChange={handleBandCountChange}
            onIdleChange={onFullscreenIdleChange}
            onExit={() => onFullscreenChange(null)}
          />
        </div>
      )}
    </div>
  );
}
