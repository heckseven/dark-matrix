import { useEffect, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useDeckStore } from '../store.js';
import type { AudioStyle } from '../store.js';
import { AUDIO_STYLES, createRenderer } from '../../../animations/audio-renderers.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import { MatrixItem } from './MatrixItem.js';
import { Button } from './ui/button.js';
import { VisualizerAudioControls } from './VisualizerAudioControls.js';
import { PLACEHOLDER, frameToB64, mirrorFrame } from './audio-viz-frames.js';
import { AudioVizGrid } from './AudioVizGrid.js';

/**
 * Cast-mode visualizer driver + picker.
 *
 * Mounted for the whole time the user is in cast mode (not just while the picker
 * is open), so the chosen visualizer keeps running on the modules after the
 * picker is closed. Unmounting (leaving cast) closes the WebSocket, which the
 * deck server turns into an `audio-hardware-stop` → the daemon's resting HUD.
 *
 * Style and source live in the shared store (`audioStyle` / `audioSource`,
 * persisted to config as `visualizer_style` / `audio_source`) so the choice is
 * continuous with audio mode. Cast's own on/off gate is `castVizOn`.
 *
 * The picker is an edge-to-edge Radix dialog whose body is the same full-screen
 * grid as audio mode (no centered modal chrome): selecting a style runs it
 * immediately and closes back to the chat view. Radix gives us the focus trap,
 * focus-on-open / focus-restore, Escape, and scroll lock for free.
 */
export function CastVisualizerPanel({ open, onOpenChange, dualModule, hasMic, gainMultiplierRef, bgSlot }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  dualModule: boolean;
  hasMic: boolean;
  /** Shared live preview gain, driven by the levels slider. */
  gainMultiplierRef: RefObject<number>;
  /** DOM node (inside the cast content area) to portal the background into. */
  bgSlot: HTMLElement | null;
}) {
  const style = useDeckStore(s => s.audioStyle);
  const source = useDeckStore(s => s.audioSource);
  const on = useDeckStore(s => s.castVizOn);
  const setAudioStyle = useDeckStore(s => s.setAudioStyle);
  const setCastVizOn = useDeckStore(s => s.setCastVizOn);

  const [livePixels, setLivePixels] = useState<Partial<Record<AudioStyle, string>>>({});
  const wsRef = useRef<WebSocket | null>(null);

  // Full-resolution band data for the cast background visualizer (AudioVizGrid).
  const fullBandsRef = useRef<number[] | null>(null);
  const fftSizeRef = useRef(2048);
  const gainRef = useRef(1.0);
  const bandCountRef = useRef(0);         // bands the background grid wants (width-sized)
  const setbandsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values for the WS-driving callback without re-opening the socket.
  const styleRef = useRef(style); styleRef.current = style;
  const sourceRef = useRef(source); sourceRef.current = source;
  const onRef = useRef(on); onRef.current = on;
  const openRef = useRef(open); openRef.current = open;

  const renderersRef = useRef<Record<AudioStyle, ReturnType<typeof createRenderer>> | null>(null);
  if (!renderersRef.current) {
    renderersRef.current = Object.fromEntries(
      AUDIO_STYLES.map(({ id }) => [id, createRenderer(id as AudioStyle)])
    ) as Record<AudioStyle, ReturnType<typeof createRenderer>>;
  }

  // Drive the modules + preview band stream to match the current state:
  //   on  → `audio-viz` runs the style on the modules and streams bands back
  //   off → modules return to resting HUD; a bands-only subscription keeps the
  //         grid previews live while the picker is open, and nothing runs once
  //         it is closed.
  const apply = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (onRef.current) {
      ws.send(JSON.stringify({
        type: 'audio-viz',
        style: styleRef.current,
        source: sourceRef.current,
        // Ask for width-sized full bands so the background visualizer animates.
        ...(bandCountRef.current > 0 ? { fullBandCount: bandCountRef.current } : {}),
      }));
    } else {
      ws.send(JSON.stringify({ type: 'audio-viz-stop' }));
      ws.send(JSON.stringify(openRef.current
        ? { type: 'hud-audio-bands-subscribe', source: sourceRef.current }
        : { type: 'hud-audio-bands-unsubscribe' }));
    }
  }, []);

  // The background grid requests a band count sized to its width; forward it to
  // the server (debounced) so the full-resolution stream matches the display.
  const handleBandCountChange = useCallback((n: number) => {
    bandCountRef.current = n;
    if (setbandsDebounceRef.current) clearTimeout(setbandsDebounceRef.current);
    setbandsDebounceRef.current = setTimeout(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'audio-viz-setbands', bandCount: n }));
      }
    }, 200);
  }, []);

  // One WebSocket for the whole cast session — persists across picker open/close.
  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;
    ws.onopen = () => apply();
    ws.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string') return;
        const msg = JSON.parse(e.data) as { type: string; bands?: number[]; fftSize?: number; gain?: number; fullBands?: number[] };
        if (msg.type === 'audio-bands' && Array.isArray(msg.bands)) {
          const fftSize = typeof msg.fftSize === 'number' ? msg.fftSize : 2048;
          const gain = typeof msg.gain === 'number' ? msg.gain : 1.0;
          // Feed the background visualizer — it runs regardless of picker state.
          fftSizeRef.current = fftSize;
          gainRef.current = gain;
          if (Array.isArray(msg.fullBands)) fullBandsRef.current = msg.fullBands;
          // Only render the picker grid previews while the picker is visible.
          if (openRef.current) {
            const ctx: RenderCtx = { bands: msg.bands, fftSize, gain: gain * gainMultiplierRef.current };
            const renderers = renderersRef.current!;
            const next: Partial<Record<AudioStyle, string>> = {};
            for (const { id } of AUDIO_STYLES) {
              const fn = renderers[id as AudioStyle];
              if (fn) next[id as AudioStyle] = frameToB64(fn(ctx));
            }
            setLivePixels(next);
          }
        }
      } catch { /* ignore */ }
    };
    return () => {
      const w = wsRef.current;
      wsRef.current = null;
      if (setbandsDebounceRef.current) { clearTimeout(setbandsDebounceRef.current); setbandsDebounceRef.current = null; }
      if (w) { w.onmessage = null; w.onopen = null; }
      if (w && w.readyState === WebSocket.OPEN) w.send(JSON.stringify({ type: 'audio-viz-stop' }));
      w?.close();
    };
  }, [apply]);

  // Re-drive whenever the on/off gate, style, source, or picker visibility changes.
  useEffect(() => { apply(); }, [on, style, source, open, apply]);

  function select(next: AudioStyle) {
    setAudioStyle(next);
    setCastVizOn(true);
    onOpenChange(false);
  }

  return (
    <>
      {/* Background visualizer, portaled into the cast content area behind the
          chat columns. Mirrors the module selection; nothing when off. */}
      {on && bgSlot && createPortal(
        <AudioVizGrid
          style={style}
          fullBandsRef={fullBandsRef}
          fftSizeRef={fftSizeRef}
          gainRef={gainRef}
          gainMultiplierRef={gainMultiplierRef}
          onBandCountChange={handleBandCountChange}
          className="w-full h-full flex items-center justify-center overflow-hidden"
          respectReducedMotion
        />,
        bgSlot,
      )}
      {/* Edge-to-edge Radix dialog whose body is the same full-screen grid as
          audio mode. Selecting a style runs it and closes back to the chat. */}
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'color-mix(in srgb, var(--color-background) 88%, transparent)' }}
          />
          <DialogPrimitive.Content className="fixed inset-0 z-40 flex flex-col outline-none font-mono text-foreground">
            <DialogPrimitive.Title className="sr-only">Cast visualizer</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Selecting a style activates it on the display modules immediately.
            </DialogPrimitive.Description>
            {/* The picker covers the mode toolbar, so the shared mic + levels
                controls live here while it is open. */}
            <div className="flex items-center justify-between px-4 py-2">
              <VisualizerAudioControls hasMic={hasMic} gainMultiplierRef={gainMultiplierRef} />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="sm" tooltip="Close" aria-label="Close cast visualizer picker"><span aria-hidden="true">×</span></Button>
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-8 py-8 flex justify-center">
              <div role="group" aria-label="Cast visualizer style" className="grid grid-cols-7 gap-6 justify-items-center">
                {AUDIO_STYLES.map(({ id, label }) => {
                  const base = livePixels[id as AudioStyle] ?? PLACEHOLDER[id as AudioStyle]!;
                  const pixels = dualModule ? mirrorFrame(base) : base;
                  return (
                    <MatrixItem
                      key={id}
                      name={label}
                      aria-label={`${label} visualizer`}
                      width={dualModule ? 18 : 9}
                      pixels={pixels}
                      isSelected={style === id}
                      onSelect={() => select(id as AudioStyle)}
                    />
                  );
                })}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
