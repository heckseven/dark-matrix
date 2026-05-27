import * as React from 'react';
import { AUDIO_STYLES } from '../../../animations/audio-renderers.js';
import type { AudioStyle } from '../../../animations/audio-renderers.js';
import { createFullRenderer } from '../../../animations/audio-renderers-full.js';
import type { FullCtx } from '../../../animations/audio-renderers-full.js';
import { BAYER_THRESHOLD } from '../../../animations/bayer.js';

const CELL = 20;
const IDLE_MS = 3000;
const SVG_DOT = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><circle cx="${CELL / 2}" cy="${CELL / 2}" r="3" fill="#303030"/></svg>`)}")`;

interface Props {
  style: AudioStyle;
  fullBandsRef: React.RefObject<number[] | null>;
  fftSizeRef: React.RefObject<number>;
  gainRef: React.RefObject<number>;
  gainMultiplierRef: React.RefObject<number>;
  onBandCountChange: (n: number) => void;
  onIdleChange: (idle: boolean) => void;
  onExit: () => void;
}

export function AudioFullscreen({ style, fullBandsRef, fftSizeRef, gainRef, gainMultiplierRef, onBandCountChange, onIdleChange, onExit }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const displayRef   = React.useRef<HTMLDivElement>(null);
  const cellsRef     = React.useRef<HTMLSpanElement[]>([]);
  const cellStates   = React.useRef<boolean[]>([]);
  // cols/rows are the full display dimensions; halfCols is what we request from the server
  const gridRef      = React.useRef({ cols: 0, rows: 0, halfCols: 0 });
  const rafRef       = React.useRef<number>(0);
  const rendererRef  = React.useRef(createFullRenderer(style));
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleChangeRef = React.useRef(onIdleChange);
  onIdleChangeRef.current = onIdleChange;
  const onExitRef = React.useRef(onExit);
  onExitRef.current = onExit;

  const styleName = AUDIO_STYLES.find(s => s.id === style)?.label ?? style;

  // Reset renderer when style changes
  React.useEffect(() => {
    rendererRef.current = createFullRenderer(style);
  }, [style]);

  // Auto-hide cursor + notify parent for header fade
  React.useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = 'html.audio-idle * { cursor: none !important; }';
    document.head.appendChild(styleEl);

    function resetIdle() {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      document.documentElement.classList.remove('audio-idle');
      onIdleChangeRef.current(false);
      idleTimerRef.current = setTimeout(() => {
        document.documentElement.classList.add('audio-idle');
        onIdleChangeRef.current(true);
      }, IDLE_MS);
    }

    resetIdle();
    document.addEventListener('mousemove', resetIdle);
    document.addEventListener('mousedown', resetIdle);
    document.addEventListener('keydown', resetIdle);
    document.addEventListener('touchstart', resetIdle);

    return () => {
      styleEl.remove();
      document.removeEventListener('mousemove', resetIdle);
      document.removeEventListener('mousedown', resetIdle);
      document.removeEventListener('keydown', resetIdle);
      document.removeEventListener('touchstart', resetIdle);
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      document.documentElement.classList.remove('audio-idle');
      onIdleChangeRef.current(false);
    };
  }, []);

  // Escape key → exit
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      if (!el) { onExitRef.current(); return; }
      const tag = (el as HTMLElement).tagName.toLowerCase();
      if (['input', 'textarea', 'select', 'a'].includes(tag)) return;
      if ((el as HTMLElement).isContentEditable) return;
      const role = el.getAttribute('role') ?? '';
      if (['link', 'menuitem', 'option', 'textbox', 'combobox'].includes(role)) return;
      onExitRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
          gain: gainRef.current * gainMultiplierRef.current,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex items-center justify-center overflow-hidden bg-black"
      role="img"
      aria-label={`${styleName} audio visualizer`}
      aria-roledescription="audio visualizer"
    >
      <div
        ref={displayRef}
        style={{
          display: 'grid',
          backgroundImage: SVG_DOT,
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
