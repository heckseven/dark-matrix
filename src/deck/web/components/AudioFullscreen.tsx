import * as React from 'react';
import { AUDIO_STYLES } from '../../../animations/audio-renderers.js';
import type { AudioStyle } from '../../../animations/audio-renderers.js';
import { createFullRenderer } from '../../../animations/audio-renderers-full.js';
import type { FullCtx } from '../../../animations/audio-renderers-full.js';
import { Button } from './ui/button.js';

const CELL = 20;
const IDLE_MS = 3000;
const SVG_DOT = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><circle cx="${CELL / 2}" cy="${CELL / 2}" r="3" fill="#303030"/></svg>`)}")`;

interface Props {
  style: AudioStyle;
  fullBandsRef: React.RefObject<number[] | null>;
  fftSizeRef: React.RefObject<number>;
  gainRef: React.RefObject<number>;
  onBandCountChange: (n: number) => void;
  onExit: () => void;
}

export function AudioFullscreen({ style, fullBandsRef, fftSizeRef, gainRef, onBandCountChange, onExit }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const displayRef   = React.useRef<HTMLDivElement>(null);
  const cellsRef     = React.useRef<HTMLSpanElement[]>([]);
  const cellStates   = React.useRef<boolean[]>([]);
  const gridRef      = React.useRef({ cols: 0, rows: 0 });
  const rafRef       = React.useRef<number>(0);
  const rendererRef  = React.useRef(createFullRenderer(style));
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [idle, setIdle] = React.useState(false);

  const styleName = AUDIO_STYLES.find(s => s.id === style)?.label ?? style;

  // Reset renderer when style changes
  React.useEffect(() => {
    rendererRef.current = createFullRenderer(style);
  }, [style]);

  // Auto-hide toolbar + cursor
  React.useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = 'html.audio-idle * { cursor: none !important; } html.audio-idle *:focus, html.audio-idle *:focus-visible { cursor: default !important; }';
    document.head.appendChild(styleEl);

    function resetIdle() {
      setIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setIdle(true), IDLE_MS);
    }

    resetIdle();
    document.addEventListener('mousemove', resetIdle);
    document.addEventListener('mousedown', resetIdle);
    document.addEventListener('keydown', resetIdle);

    return () => {
      styleEl.remove();
      document.removeEventListener('mousemove', resetIdle);
      document.removeEventListener('mousedown', resetIdle);
      document.removeEventListener('keydown', resetIdle);
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      document.documentElement.classList.remove('audio-idle');
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle('audio-idle', idle);
  }, [idle]);

  // Escape key → exit
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      if (!el) { onExit(); return; }
      const tag = (el as HTMLElement).tagName.toLowerCase();
      if (['input', 'textarea', 'select', 'a'].includes(tag)) return;
      if ((el as HTMLElement).isContentEditable) return;
      const role = el.getAttribute('role') ?? '';
      if (['link', 'menuitem', 'option', 'textbox', 'combobox'].includes(role)) return;
      onExit();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onExit]);

  // Grid allocation
  const recomputeGrid = React.useCallback(() => {
    const container = containerRef.current;
    const display   = displayRef.current;
    if (!container || !display) return;
    const { width: w, height: h } = container.getBoundingClientRect();
    const cols = Math.max(1, Math.floor(w / CELL));
    const rows = Math.max(1, Math.floor(h / CELL));
    gridRef.current = { cols, rows };

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

    onBandCountChange(cols);
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

  // RAF render loop
  React.useEffect(() => {
    let running = true;

    function tick() {
      if (!running) return;
      const { cols, rows } = gridRef.current;
      const bands = fullBandsRef.current;
      const cells = cellsRef.current;
      const states = cellStates.current;

      if (cols > 0 && rows > 0 && bands && bands.length === cols) {
        const ctx: FullCtx = {
          bands,
          cols,
          rows,
          fftSize: fftSizeRef.current,
          gain: gainRef.current,
        };
        const frame = rendererRef.current(ctx);
        // frame is column-major: frame[col * rows + row]
        // cells are row-major in the CSS grid: cells[row * cols + col]
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const ci = row * cols + col;
            const v = frame[col * rows + row] ?? 0;
            const lit = v > 127;
            if (states[ci] !== lit) {
              states[ci] = lit;
              const span = cells[ci];
              if (span) {
                span.style.color = lit ? '#fff' : 'transparent';
                span.style.background = lit ? '#000' : 'transparent';
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
    // Fixed overlay covers the entire viewport, including the app header
    <div
      className="bg-black"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column' }}
    >
      {/* ── LED grid ────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        <div
          ref={displayRef}
          role="img"
          aria-label={`${styleName} audio visualizer`}
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

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div
        className="absolute top-0 inset-x-0 flex items-center gap-3 px-4 py-2 bg-black/70"
        style={{
          opacity: idle ? 0 : 1,
          transition: idle ? 'opacity 300ms' : 'opacity 0ms',
          pointerEvents: idle ? 'none' : undefined,
        }}
        {...(idle ? { inert: true } : {})}
      >
        <span className="font-mono text-foreground text-sm tracking-wide flex-1">{styleName}</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Switch visualizer"
          onClick={onExit}
        >
          switch
        </Button>
      </div>
    </div>
  );
}
