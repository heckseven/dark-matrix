import { useEffect, useRef, useState, useCallback } from 'react';
import { useDeckStore } from '../store.js';
import type { AudioStyle, AudioSource } from '../store.js';
import { AUDIO_STYLES, createRenderer } from '../../../animations/audio-renderers.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import { MatrixItem } from './MatrixItem.js';
import { Button } from './ui/button.js';
import { Toggle } from './ui/toggle.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from './ui/dialog.js';
import { PLACEHOLDER, BLANK_FRAME, frameToB64, mirrorFrame } from './audio-viz-frames.js';
import { AudioVizGrid } from './AudioVizGrid.js';

type CastSelection = AudioStyle | 'off';

/**
 * Cast-mode visualizer driver + picker.
 *
 * Mounted for the whole time the user is in cast mode (not just while the picker
 * dialog is open), so the chosen visualizer keeps running on the modules after
 * the dialog is closed. Unmounting (leaving cast) closes the WebSocket, which the
 * deck server turns into an `audio-hardware-stop` → the daemon's resting HUD.
 *
 * The selection lives in user config (`cast_visualizer` / `cast_audio_source`) so
 * it is restored the next time the user enters cast.
 */
export function CastVisualizerPanel({ open, onOpenChange, dualModule, hasMic, headerHeight }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  dualModule: boolean;
  hasMic: boolean;
  headerHeight: number;
}) {
  const selection: CastSelection = useDeckStore(s => (s.configData?.cast_visualizer ?? 'off'));
  const source: AudioSource = useDeckStore(s => s.configData?.cast_audio_source ?? 'monitor');
  const patchConfig = useDeckStore(s => s.patchConfig);
  const saveConfig = useDeckStore(s => s.saveConfig);

  const [livePixels, setLivePixels] = useState<Partial<Record<AudioStyle, string>>>({});
  const wsRef = useRef<WebSocket | null>(null);

  // Full-resolution band data for the cast background visualizer (AudioVizGrid).
  // Populated from every audio-bands message so the background keeps animating
  // whether or not the picker dialog is open.
  const fullBandsRef = useRef<number[] | null>(null);
  const fftSizeRef = useRef(2048);
  const gainRef = useRef(1.0);
  const bandCountRef = useRef(0);         // bands the background grid wants (width-sized)
  const setbandsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values for the WS-driving callback without re-opening the socket.
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const sourceRef = useRef(source); sourceRef.current = source;
  const openRef = useRef(open); openRef.current = open;

  const renderersRef = useRef<Record<AudioStyle, ReturnType<typeof createRenderer>> | null>(null);
  if (!renderersRef.current) {
    renderersRef.current = Object.fromEntries(
      AUDIO_STYLES.map(({ id }) => [id, createRenderer(id as AudioStyle)])
    ) as Record<AudioStyle, ReturnType<typeof createRenderer>>;
  }

  // Drive the modules + preview band stream to match the current selection:
  //   style → `audio-viz` runs the EQ on the modules and streams bands back
  //   off   → modules return to resting HUD; a bands-only subscription keeps the
  //           grid previews live while the picker is open, and nothing runs once
  //           it is closed.
  const apply = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const sel = selectionRef.current;
    const src = sourceRef.current;
    if (sel === 'off') {
      ws.send(JSON.stringify({ type: 'audio-viz-stop' }));
      ws.send(JSON.stringify(openRef.current
        ? { type: 'hud-audio-bands-subscribe', source: src }
        : { type: 'hud-audio-bands-unsubscribe' }));
    } else {
      ws.send(JSON.stringify({
        type: 'audio-viz',
        style: sel,
        source: src,
        // Ask for width-sized full bands so the background visualizer animates.
        ...(bandCountRef.current > 0 ? { fullBandCount: bandCountRef.current } : {}),
      }));
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

  // One WebSocket for the whole cast session — persists across dialog open/close.
  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;
    // apply() embeds the latest fullBandCount in its audio-viz message, so the
    // server gets the background grid's requested band count even if the grid
    // measured itself before the socket finished opening.
    ws.onopen = () => apply();
    ws.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string') return;
        const msg = JSON.parse(e.data) as { type: string; bands?: number[]; fftSize?: number; gain?: number; fullBands?: number[] };
        if (msg.type === 'audio-bands' && Array.isArray(msg.bands)) {
          const fftSize = typeof msg.fftSize === 'number' ? msg.fftSize : 2048;
          const gain = typeof msg.gain === 'number' ? msg.gain : 1.0;
          // Feed the background visualizer — it runs regardless of dialog state.
          fftSizeRef.current = fftSize;
          gainRef.current = gain;
          if (Array.isArray(msg.fullBands)) fullBandsRef.current = msg.fullBands;
          // Only render the picker grid previews while the dialog is visible.
          if (openRef.current) {
            const ctx: RenderCtx = { bands: msg.bands, fftSize, gain };
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
      // Drop handlers first so late band messages can't setState on an unmounted
      // component during the close handshake.
      if (w) { w.onmessage = null; w.onopen = null; }
      // Leaving cast: stop the visualizer so the daemon falls back to resting HUD.
      // (If the socket is already closing, the server's own close handler is the
      // authoritative backstop that issues audio-hardware-stop.)
      if (w && w.readyState === WebSocket.OPEN) w.send(JSON.stringify({ type: 'audio-viz-stop' }));
      w?.close();
    };
  }, [apply]);

  // Re-drive whenever the saved selection, source, or picker visibility changes.
  useEffect(() => { apply(); }, [selection, source, open, apply]);

  function select(next: CastSelection) {
    patchConfig({ cast_visualizer: next });
    void saveConfig();
  }

  function setSource(next: AudioSource) {
    patchConfig({ cast_audio_source: next });
    void saveConfig();
  }

  return (
    <>
      {/* Full-bleed background visualizer behind the chat columns. Mirrors the
          module selection; nothing renders when the selection is Off. */}
      {selection !== 'off' && (
        <div
          className="fixed inset-x-0 bottom-0 z-0 overflow-hidden pointer-events-none"
          style={{ top: headerHeight }}
          aria-hidden="true"
        >
          <AudioVizGrid
            style={selection}
            fullBandsRef={fullBandsRef}
            fftSizeRef={fftSizeRef}
            gainRef={gainRef}
            onBandCountChange={handleBandCountChange}
            className="w-full h-full flex items-center justify-center overflow-hidden"
            respectReducedMotion
          />
        </div>
      )}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-80px)] h-[calc(100vh-80px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Cast visualizer</DialogTitle>
        <DialogDescription className="sr-only">
          Selecting a style activates it on the display modules immediately. Select Off to return to the resting display.
        </DialogDescription>
        <div className="flex items-center justify-end gap-2 px-4 py-2">
          {hasMic && (
            <Toggle
              pressed={source === 'mic'}
              onPressedChange={on => setSource(on ? 'mic' : 'monitor')}
              title={source === 'mic' ? 'Disable mic' : 'Enable mic'}
              aria-label={source === 'mic' ? 'Disable mic' : 'Enable mic'}
            >
              <span aria-hidden="true">mic</span>
            </Toggle>
          )}
          <DialogClose asChild>
            <Button variant="ghost" size="sm" tooltip="Close" aria-label="Close cast visualizer">×</Button>
          </DialogClose>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-8 py-8 flex justify-center">
          <div role="group" aria-label="Cast visualizer style" className="grid grid-cols-7 gap-6 justify-items-center">
            {/* Off — first tile; returns the modules to their resting HUD state. */}
            <MatrixItem
              name="off"
              aria-label="Off — stop visualizer, return modules to resting display"
              width={dualModule ? 18 : 9}
              pixels={dualModule ? mirrorFrame(BLANK_FRAME) : BLANK_FRAME}
              isSelected={selection === 'off'}
              onSelect={() => select('off')}
            />
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
                  isSelected={selection === id}
                  onSelect={() => select(id as AudioStyle)}
                />
              );
            })}
          </div>
        </div>
      </DialogContent>
      </Dialog>
    </>
  );
}
