import * as React from 'react';
import { useMemo } from 'react';
import { useDeckStore } from '../store.js';
import type { AudioStyle } from '../../../animations/audio-renderers.js';
import { createFullRenderer } from '../../../animations/audio-renderers-full.js';
import type { FullCtx } from '../../../animations/audio-renderers-full.js';
import { BAYER_THRESHOLD } from '../../../animations/bayer.js';

const CELL = 20;

// The renderers advance their motion once per render call (frame-count based, not
// wall-clock), so the render rate sets the animation speed. Throttle to a fixed
// rate for a steady pace independent of the display's refresh rate.
const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

// When the visualization has been blank for a while (audio paused/silent), drop
// to a low poll rate to save power — snaps back to TARGET_FPS the moment any
// cell lights up. Detected from the rendered output, so it's scale-independent.
const IDLE_FPS = 5;
const IDLE_INTERVAL_MS = 1000 / IDLE_FPS;
const IDLE_AFTER_FRAMES = TARGET_FPS * 2; // ~2s of blank output

function makeSvgDot(color: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><circle cx="${CELL / 2}" cy="${CELL / 2}" r="2" fill="${color}"/></svg>`)}")`;
}

// Pre-rasterize the lit cell once per device-pixel ratio, then blit it per lit
// cell with drawImage. Rendering the glyph a single time keeps it crisp on
// HiDPI and avoids per-frame canvas text (no AA mismatch with surrounding DOM).
function makeLitTileFromTheme(dpr: number): HTMLCanvasElement {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--color-background').trim() || '#000000';
  const fg = cs.getPropertyValue('--color-primary').trim()    || '#0DC45C';
  return makeLitTile(dpr, bg, fg);
}

function makeLitTile(dpr: number, bg: string, fg: string): HTMLCanvasElement {
  const t = document.createElement('canvas');
  t.width = Math.round(CELL * dpr);
  t.height = Math.round(CELL * dpr);
  const tx = t.getContext('2d')!;
  tx.scale(dpr, dpr);
  tx.fillStyle = bg;
  tx.fillRect(0, 0, CELL, CELL);
  tx.fillStyle = fg;
  tx.font = '14px monospace';
  tx.textAlign = 'center';
  tx.textBaseline = 'middle';
  tx.fillText('∗', CELL / 2, CELL / 2 + 1);
  return t;
}

interface Props {
  style: AudioStyle;
  fullBandsRef: React.RefObject<number[] | null>;
  fftSizeRef: React.RefObject<number>;
  gainRef: React.RefObject<number>;
  /** Optional extra gain (e.g. a sensitivity slider). Defaults to ×1 when omitted. */
  gainMultiplierRef?: React.RefObject<number>;
  /** Called with the number of bands the grid wants (half its column count — the
   *  right half mirrors the left). Wire this to `audio-viz-setbands`. */
  onBandCountChange: (n: number) => void;
  className?: string;
  role?: string;
  'aria-label'?: string;
  tabIndex?: number;
  /** Focus the container on mount (audio-mode fullscreen announces itself to AT). */
  autoFocus?: boolean;
  /** When true, honor `prefers-reduced-motion` by not animating (for ambient/
   *  background use). Off by default so a user-opened fullscreen still animates. */
  respectReducedMotion?: boolean;
}

/**
 * The mirrored, Bayer-dithered dot-grid visualizer shared by the audio-mode
 * fullscreen view and the cast-mode background. Renders to a single <canvas>
 * (DPR-scaled for crisp HiDPI output) rather than thousands of DOM nodes, so the
 * per-frame cost is one composited paint. All interactive behaviour (cursor
 * hiding, Escape to exit) lives in the wrappers, not here.
 */
export function AudioVizGrid({
  style, fullBandsRef, fftSizeRef, gainRef, gainMultiplierRef, onBandCountChange,
  className, role, 'aria-label': ariaLabel, tabIndex,
  autoFocus, respectReducedMotion,
}: Props) {
  const appearance = useDeckStore(s => s.configData?.appearance);
  const svgDot = useMemo(() => makeSvgDot(
    getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#2a2a2a'
  ), [appearance]);

  const [reducedMotion, setReducedMotion] = React.useState(() =>
    !!respectReducedMotion && typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const wrapperRef   = React.useRef<HTMLDivElement>(null);
  const canvasRef    = React.useRef<HTMLCanvasElement>(null);
  const ctxRef       = React.useRef<CanvasRenderingContext2D | null>(null);
  const tileRef      = React.useRef<HTMLCanvasElement | null>(null);
  // cols/rows are the full display dimensions; halfCols is what we request from the server
  const gridRef      = React.useRef({ cols: 0, rows: 0, halfCols: 0 });
  const rafRef       = React.useRef<number>(0);
  const rendererRef  = React.useRef(createFullRenderer(style));

  React.useEffect(() => { rendererRef.current = createFullRenderer(style); }, [style]);

  React.useEffect(() => {
    if (autoFocus) containerRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once on mount
  }, []);

  // Subscribe to prefers-reduced-motion changes for ambient (background) use
  React.useEffect(() => {
    if (!respectReducedMotion || typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [respectReducedMotion]);

  // Size the canvas (DPR-scaled backing store) + rebuild the lit-cell tile.
  const recomputeGrid = React.useCallback(() => {
    const container = containerRef.current;
    const wrapper   = wrapperRef.current;
    const canvas    = canvasRef.current;
    if (!container || !wrapper || !canvas) return;
    const { width: w, height: h } = container.getBoundingClientRect();
    const cols = Math.max(2, Math.floor(w / CELL));
    const rows = Math.max(1, Math.floor(h / CELL));
    const halfCols = Math.ceil(cols / 2);
    gridRef.current = { cols, rows, halfCols };

    const cssW = cols * CELL;
    const cssH = rows * CELL;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));

    wrapper.style.width  = `${cssW}px`;
    wrapper.style.height = `${cssH}px`;
    canvas.style.width  = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const g = canvas.getContext('2d');
    if (g) { g.setTransform(dpr, 0, 0, dpr, 0, 0); ctxRef.current = g; }
    tileRef.current = makeLitTileFromTheme(dpr);

    onBandCountChange(halfCols);
  }, [onBandCountChange]);

  // ResizeObserver
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    recomputeGrid();
    const ro = new ResizeObserver(() => recomputeGrid());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recomputeGrid]);

  // Rebuild lit-cell tile when the theme changes (DPR stays stable across theme switches)
  React.useEffect(() => {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    tileRef.current = makeLitTileFromTheme(dpr);
  }, [appearance]);

  // RAF render loop — renders left half from bands, mirrors to right half, Bayer dithering
  React.useEffect(() => {
    if (reducedMotion) {
      ctxRef.current?.clearRect(0, 0, gridRef.current.cols * CELL, gridRef.current.rows * CELL);
      return; // ambient/background use: stay static for reduced-motion users
    }

    let running = true;
    let last = 0;
    let emptyStreak = 0;

    function tick(now: number) {
      if (!running) return;
      rafRef.current = requestAnimationFrame(tick);
      if (document.hidden) return; // no work while the page isn't visible
      const interval = emptyStreak >= IDLE_AFTER_FRAMES ? IDLE_INTERVAL_MS : FRAME_INTERVAL_MS;
      if (now - last < interval) return;
      last = now - ((now - last) % interval);

      const { cols, rows, halfCols } = gridRef.current;
      const bands = fullBandsRef.current;
      const g = ctxRef.current;
      const tile = tileRef.current;

      if (g && tile && cols > 0 && rows > 0 && halfCols > 0 && bands && bands.length === halfCols) {
        const rctx: FullCtx = {
          bands,
          cols: halfCols,
          rows,
          fftSize: fftSizeRef.current,
          gain: gainRef.current * (gainMultiplierRef?.current ?? 1),
        };
        // frame is column-major with halfCols columns: frame[lCol * rows + row]
        const frame = rendererRef.current(rctx);

        g.clearRect(0, 0, cols * CELL, rows * CELL);
        let lit = 0;
        for (let row = 0; row < rows; row++) {
          for (let lCol = 0; lCol < halfCols; lCol++) {
            const v = frame[lCol * rows + row] ?? 0;
            if (v > BAYER_THRESHOLD[row % 4]![lCol % 4]!) {
              lit++;
              g.drawImage(tile, lCol * CELL, row * CELL, CELL, CELL);
              const rCol = cols - 1 - lCol; // mirrored right cell
              if (rCol !== lCol) g.drawImage(tile, rCol * CELL, row * CELL, CELL, CELL);
            }
          }
        }
        emptyStreak = lit === 0 ? emptyStreak + 1 : 0;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- prop refs are stable objects read per-frame; restart only when reducedMotion flips
  }, [reducedMotion]);

  return (
    <div
      ref={containerRef}
      className={className}
      role={role}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
    >
      <div ref={wrapperRef} style={{ position: 'relative', userSelect: 'none' }}>
        {/* Faint dot grid — shows through transparent (unlit) canvas cells */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: svgDot,
            backgroundSize: `${CELL}px ${CELL}px`,
            backgroundRepeat: 'repeat',
          }}
        />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}
