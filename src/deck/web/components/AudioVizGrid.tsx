import * as React from 'react';
import { useMemo } from 'react';
import { useDeckStore } from '../store.js';
import type { AudioStyle } from '../../../animations/audio-renderers.js';
import { createFullRenderer } from '../../../animations/audio-renderers-full.js';
import type { FullCtx } from '../../../animations/audio-renderers-full.js';
import { BAYER_THRESHOLD } from '../../../animations/bayer.js';

const CELL = 20;

function makeSvgDot(color: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><circle cx="${CELL / 2}" cy="${CELL / 2}" r="2" fill="${color}"/></svg>`)}")`;
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
 * The mirrored, Bayer-dithered dot-grid renderer shared by the audio-mode
 * fullscreen view and the cast-mode background. Purely presentational: it owns
 * grid sizing, the rAF render loop, and requests a width-sized band count via
 * `onBandCountChange`. All interactive behaviour (cursor hiding, Escape to exit)
 * lives in the wrappers, not here.
 */
export function AudioVizGrid({
  style, fullBandsRef, fftSizeRef, gainRef, gainMultiplierRef, onBandCountChange,
  className, role, 'aria-label': ariaLabel, tabIndex,
  autoFocus, respectReducedMotion,
}: Props) {
  // Track prefers-reduced-motion reactively so an ambient background stops/starts
  // when the user toggles the OS setting mid-session (not just at mount).
  const [reducedMotion, setReducedMotion] = React.useState(() =>
    !!respectReducedMotion && typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const appearance = useDeckStore(s => s.configData?.appearance);
  const svgDot = useMemo(() => makeSvgDot(
    getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#2a2a2a'
  ), [appearance]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const displayRef  = React.useRef<HTMLDivElement>(null);
  const cellsRef    = React.useRef<HTMLSpanElement[]>([]);
  const cellStates  = React.useRef<boolean[]>([]);
  // cols/rows are the full display dimensions; halfCols is what we request from the server
  const gridRef     = React.useRef({ cols: 0, rows: 0, halfCols: 0 });
  const rafRef      = React.useRef<number>(0);
  const rendererRef = React.useRef(createFullRenderer(style));

  // Reset renderer when style changes
  React.useEffect(() => {
    rendererRef.current = createFullRenderer(style);
  }, [style]);

  // Focus container on mount so AT announces the (focused) fullscreen view
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

  // Grid allocation — request only halfCols bands; the right half mirrors the left
  const recomputeGrid = React.useCallback(() => {
    const container = containerRef.current;
    const display   = displayRef.current;
    if (!container || !display) return;
    const { width: w, height: h } = container.getBoundingClientRect();
    const cols = Math.max(2, Math.floor(w / CELL));
    const rows = Math.max(1, Math.floor(h / CELL));
    const halfCols = Math.ceil(cols / 2);
    gridRef.current = { cols, rows, halfCols };

    display.style.gridTemplateColumns = `repeat(${cols}, ${CELL}px)`;
    display.style.width  = `${cols * CELL}px`;
    display.style.height = `${rows * CELL}px`;

    const total = cols * rows;
    const cells = cellsRef.current;
    while (cells.length < total) {
      const span = document.createElement('span');
      span.textContent = '∗';
      span.setAttribute('aria-hidden', 'true');
      span.style.cssText = 'display:flex;align-items:center;justify-content:center;overflow:hidden;';
      span.style.color = 'transparent';
      span.style.background = 'transparent';
      display.appendChild(span);
      cells.push(span);
    }
    while (cells.length > total) {
      const span = cells.pop();
      if (span && span.parentNode === display) display.removeChild(span);
    }
    cellStates.current = new Array(total).fill(false);
    for (const span of cells) {
      span.style.color = 'transparent';
      span.style.background = 'transparent';
    }

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

  // RAF render loop — renders left half from bands, mirrors to right half, Bayer dithering
  React.useEffect(() => {
    if (reducedMotion) return; // ambient/background use: stay static for reduced-motion users

    let running = true;

    function tick() {
      if (!running) return;
      const { cols, rows, halfCols } = gridRef.current;
      const bands = fullBandsRef.current;
      const cells = cellsRef.current;
      const states = cellStates.current;

      if (cols > 0 && rows > 0 && halfCols > 0 && bands && bands.length === halfCols) {
        const ctx: FullCtx = {
          bands,
          cols: halfCols,
          rows,
          fftSize: fftSizeRef.current,
          gain: gainRef.current * (gainMultiplierRef?.current ?? 1),
        };
        // frame is column-major with halfCols columns: frame[lCol * rows + row]
        const frame = rendererRef.current(ctx);

        for (let row = 0; row < rows; row++) {
          for (let lCol = 0; lCol < halfCols; lCol++) {
            const v = frame[lCol * rows + row] ?? 0;
            const lit = v > BAYER_THRESHOLD[row % 4]![lCol % 4]!;

            // left cell
            const lci = row * cols + lCol;
            if (states[lci] !== lit) {
              states[lci] = lit;
              const span = cells[lci];
              if (span) { span.style.color = lit ? '#fff' : 'transparent'; span.style.background = lit ? '#000' : 'transparent'; }
            }

            // mirrored right cell (same Bayer position as left for perfect symmetry)
            const rCol = cols - 1 - lCol;
            if (rCol !== lCol) {
              const rci = row * cols + rCol;
              if (states[rci] !== lit) {
                states[rci] = lit;
                const span = cells[rci];
                if (span) { span.style.color = lit ? '#fff' : 'transparent'; span.style.background = lit ? '#000' : 'transparent'; }
              }
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
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
      <div
        ref={displayRef}
        style={{
          display: 'grid',
          backgroundImage: svgDot,
          backgroundSize: `${CELL}px ${CELL}px`,
          backgroundRepeat: 'repeat',
          fontSize: '14px',
          fontFamily: 'monospace',
          userSelect: 'none',
        }}
      />
    </div>
  );
}
