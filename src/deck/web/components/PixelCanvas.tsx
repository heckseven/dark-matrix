import { useEffect, useRef } from 'react';
import { useDeckStore, deckStore, stepZoom } from '../store.js';
import { cn } from '@/lib/utils.js';

const MIN_L = 48;
const BASE_CELL = 20;
const GAP = 1;
const ROWS = 34;
const BASE_MODULE_GAP = 8;
const BASE_CORNER = 4;
const CURSOR_COLOR = '#4ade80';

export function canvasComponentH(zoom: number): number {
  return ROWS * (BASE_CELL * zoom + GAP) - GAP + 16;
}

interface Metrics {
  cell: number;
  gap: number;
  moduleGap: number;
  corner: number;
  canvasH: number;
  font: string;
}

function computeMetrics(zoom: number): Metrics {
  const cell = BASE_CELL * zoom;
  return {
    cell,
    gap: GAP,
    moduleGap: BASE_MODULE_GAP * zoom,
    corner: BASE_CORNER * zoom,
    canvasH: ROWS * (cell + GAP) - GAP,
    font: `${Math.round(14 * zoom)}px monospace`,
  };
}

function colX(c: number, width: number, m: Metrics): number {
  return c * (m.cell + m.gap) + (width === 18 && c >= 9 ? m.moduleGap : 0);
}

function canvasW(width: number, m: Metrics): number {
  return width * (m.cell + m.gap) - m.gap + (width === 18 ? m.moduleGap : 0);
}

function cellColor(v: number, hovered = false): string {
  const l = Math.round(MIN_L + (v / 255) * (255 - MIN_L));
  const out = hovered ? Math.min(255, l + 60) : l;
  return `rgb(${out},${out},${out})`;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  c: number, r: number, v: number,
  width: number, hovered: boolean, isCursor: boolean,
  m: Metrics,
) {
  const x = colX(c, width, m);
  const y = r * (m.cell + m.gap);

  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, m.cell, m.cell);
  if (hovered) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, m.cell, m.cell);
  }

  ctx.fillStyle = cellColor(v, hovered);
  ctx.font = m.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(v === 0 ? '•' : '∗', x + m.cell / 2, y + m.cell / 2 + 1);

  if (isCursor) {
    ctx.strokeStyle = CURSOR_COLOR;
    ctx.lineWidth = 1;
    const x1 = x + 1.5, y1 = y + 1.5, x2 = x + m.cell - 1.5, y2 = y + m.cell - 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + m.corner); ctx.lineTo(x1, y1); ctx.lineTo(x1 + m.corner, y1);
    ctx.moveTo(x2 - m.corner, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + m.corner);
    ctx.moveTo(x1, y2 - m.corner); ctx.lineTo(x1, y2); ctx.lineTo(x1 + m.corner, y2);
    ctx.moveTo(x2 - m.corner, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - m.corner);
    ctx.stroke();
  }
}

function bresenham(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return pts;
}

export function PixelCanvas({ className, onCursorMove }: { className?: string; onCursorMove?: (col: number, row: number) => void }) {
  const width = useDeckStore(s => s.width);
  const zoom = useDeckStore(s => s.zoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);
  const focusMarksRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    pixels: new Uint8Array(18 * ROWS),
    width: 9 as 9 | 18,
    hovered: null as { col: number; row: number } | null,
    cursor: { col: 0, row: 0 },
    painting: false,
    paintValue: 0,  // color applied during drag/keyboard-draw; 0 = erase
    lastHit: null as { col: number; row: number } | null,
    rafPending: false,
    keyboardFocused: false,
    hasMoved: false,
    mouseDownHit: null as { col: number; row: number } | null,
    spaceHeld: false,
    doubleClickPending: false,
    preClickUndoLen: 0,
    zoom: 1,
  });

  state.current.width = width;
  state.current.zoom = zoom;

  function announce(msg: string) {
    if (liveRef.current) liveRef.current.textContent = msg;
  }

  function getMetrics(): Metrics {
    return computeMetrics(state.current.zoom);
  }

  function ctx(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function repaintCell(c: CanvasRenderingContext2D, col: number, row: number) {
    const { pixels, width: w, hovered, cursor, keyboardFocused } = state.current;
    const v = pixels[col * ROWS + row] ?? 0;
    drawCell(c, col, row, v, w,
      hovered?.col === col && hovered?.row === row,
      keyboardFocused && cursor.col === col && cursor.row === row,
      getMetrics());
  }

  function paintAll() {
    const c = ctx();
    if (!c) return;
    const { frames, activeFrameIdx, width: w } = deckStore.getState();
    const frame = frames[activeFrameIdx];
    if (!frame) return;
    try {
      state.current.pixels = Uint8Array.from(atob(frame.pixels), ch => ch.charCodeAt(0));
    } catch { return; }
    const { pixels, hovered, cursor, keyboardFocused } = state.current;
    const m = computeMetrics(state.current.zoom);
    for (let col = 0; col < w; col++) {
      for (let row = 0; row < ROWS; row++) {
        drawCell(c, col, row, pixels[col * ROWS + row] ?? 0, w as 9 | 18,
          hovered?.col === col && hovered?.row === row,
          keyboardFocused && cursor.col === col && cursor.row === row,
          m);
      }
    }
    state.current.rafPending = false;
  }

  // paintAll/schedulePaint only close over stable refs (state, canvasRef, deckStore)
  // so the stale-closure lint warning below is a false positive.
  function schedulePaint() {
    if (state.current.rafPending) return;
    state.current.rafPending = true;
    requestAnimationFrame(paintAll);
  }

  function moveCursor(col: number, row: number) {
    const c = ctx();
    if (!c) return;
    const prev = state.current.cursor;
    state.current.cursor = { col, row };
    repaintCell(c, prev.col, prev.row);
    repaintCell(c, col, row);
    announce(`Col ${col + 1}, row ${row + 1}`);
    onCursorMove?.(col, row);
  }

  function moveAndPaint(col: number, row: number) {
    moveCursor(col, row);
    if (state.current.spaceHeld) {
      const { activeFrameIdx, setPixel } = deckStore.getState();
      setPixel(activeFrameIdx, col, row, state.current.paintValue);
    }
  }

  function setHovered(next: { col: number; row: number } | null) {
    const c = ctx();
    if (!c) return;
    const prev = state.current.hovered;
    if (prev?.col === next?.col && prev?.row === next?.row) return;
    state.current.hovered = next;
    if (prev) repaintCell(c, prev.col, prev.row);
    if (next) { repaintCell(c, next.col, next.row); onCursorMove?.(next.col, next.row); }
  }

  function hitTest(clientX: number, clientY: number): { col: number; row: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bbox = canvas.getBoundingClientRect();
    let x = clientX - bbox.left;
    const y = clientY - bbox.top;
    const w = state.current.width;
    const m = getMetrics();
    if (w === 18) {
      const gapStart = 9 * (m.cell + m.gap) - m.gap;
      if (x >= gapStart && x < gapStart + m.gap + m.moduleGap) return null;
      if (x >= gapStart + m.gap + m.moduleGap) x -= m.moduleGap;
    }
    const col = Math.floor(x / (m.cell + m.gap));
    const row = Math.floor(y / (m.cell + m.gap));
    if (col < 0 || col >= w || row < 0 || row >= ROWS) return null;
    if (x % (m.cell + m.gap) >= m.cell || y % (m.cell + m.gap) >= m.cell) return null;
    return { col, row };
  }

  function setFocusMarks(on: boolean) {
    const el = focusMarksRef.current;
    if (!el) return;
    el.style.display = on ? 'block' : 'none';
  }

  function doPaint(clientX: number, clientY: number) {
    const hit = hitTest(clientX, clientY);
    if (!hit) return;
    const { activeFrameIdx, setPixel } = deckStore.getState();
    const color = state.current.paintValue;
    const last = state.current.lastHit;
    const pts = last ? bresenham(last.col, last.row, hit.col, hit.row) : [[hit.col, hit.row] as [number, number]];
    for (const [col, row] of pts) setPixel(activeFrameIdx, col, row, color);
    state.current.lastHit = hit;
    state.current.cursor = hit;
  }

  function resetPaintState() {
    state.current.painting = false;
    state.current.hasMoved = false;
    state.current.lastHit = null;
    state.current.mouseDownHit = null;
    state.current.doubleClickPending = false;
    deckStore.getState().commitStroke();
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const m = computeMetrics(zoom);
    const w = canvasW(width, m);
    canvas.width = w * dpr;
    canvas.height = m.canvasH * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${m.canvasH}px`;
    const c = canvas.getContext('2d');
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.current.cursor = { col: 0, row: 0 };
    state.current.hovered = null;
    state.current.doubleClickPending = false;
    state.current.preClickUndoLen = 0;
    paintAll();
    return deckStore.subscribe(schedulePaint);
  }, [width, zoom]);

  const corner = { position: 'absolute', width: 16, height: 16, pointerEvents: 'none' } as const;
  const b = '1px solid white';

  return (
    <div className={cn('p-2', className)}>
      <span ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div ref={focusMarksRef} style={{ display: 'none', position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <span style={{ ...corner, top: 0, left: 0,     borderTop: b, borderLeft: b }} />
          <span style={{ ...corner, top: 0, right: 0,    borderTop: b, borderRight: b }} />
          <span style={{ ...corner, bottom: 0, left: 0,  borderBottom: b, borderLeft: b }} />
          <span style={{ ...corner, bottom: 0, right: 0, borderBottom: b, borderRight: b }} />
        </div>
        <canvas
          ref={canvasRef}
          role="application"
          aria-label="Pixel editor — arrow keys move cursor, Space to paint or erase, F to flood fill"
          tabIndex={0}
          className="block cursor-crosshair outline-none"
        onMouseDown={e => {
          e.preventDefault();
          if (e.detail === 2) {
            state.current.doubleClickPending = true;
            const hit = hitTest(e.clientX, e.clientY);
            const s = deckStore.getState();
            if (s.undoStack.length > state.current.preClickUndoLen) s.undo();
            if (hit) {
              const { activeFrameIdx, activeColor, floodFill } = deckStore.getState();
              floodFill(activeFrameIdx, hit.col, hit.row, activeColor);
              state.current.cursor = hit;
              announce(`Flood fill at col ${hit.col + 1}, row ${hit.row + 1}`);
            }
            return;
          }
          state.current.doubleClickPending = false;
          state.current.preClickUndoLen = deckStore.getState().undoStack.length;
          if (state.current.keyboardFocused) {
            state.current.keyboardFocused = false;
            setFocusMarks(false);
            const c = ctx();
            if (c) repaintCell(c, state.current.cursor.col, state.current.cursor.row);
          }
          const downHit = hitTest(e.clientX, e.clientY);
          const startLit = e.button !== 2 && downHit != null
            ? (state.current.pixels[downHit.col * ROWS + downHit.row] ?? 0) > 0
            : false;
          state.current.paintValue = e.button === 2 || startLit
            ? 0
            : deckStore.getState().activeColor;
          state.current.painting = true;
          state.current.hasMoved = false;
          state.current.lastHit = null;
          state.current.mouseDownHit = downHit;
          deckStore.getState().beginStroke();
          canvasRef.current?.focus();
        }}
        onMouseMove={e => {
          setHovered(hitTest(e.clientX, e.clientY));
          if (state.current.painting) {
            state.current.hasMoved = true;
            doPaint(e.clientX, e.clientY);
          }
        }}
        onMouseUp={() => {
          if (state.current.doubleClickPending) return;
          if (!state.current.hasMoved && state.current.mouseDownHit) {
            const { col, row } = state.current.mouseDownHit;
            const { activeFrameIdx, activeColor } = deckStore.getState();
            const currentVal = state.current.pixels[col * ROWS + row] ?? 0;
            deckStore.getState().setPixel(activeFrameIdx, col, row, currentVal > 0 ? 0 : activeColor);
            state.current.cursor = { col, row };
          }
          resetPaintState();
        }}
        onMouseLeave={() => { resetPaintState(); setHovered(null); }}
        onContextMenu={e => e.preventDefault()}
        onKeyDown={e => {
          if (!state.current.keyboardFocused && !e.ctrlKey && !e.metaKey) {
            state.current.keyboardFocused = true;
            setFocusMarks(true);
          }
          const ctrl = e.ctrlKey || e.metaKey;
          const { col, row } = state.current.cursor;
          const w = state.current.width;
          const { activeFrameIdx, activeColor, frames } = deckStore.getState();
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (col > 0) moveAndPaint(col - 1, row);
            else if (!state.current.spaceHeld) deckStore.getState().setActiveFrame(activeFrameIdx - 1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (col < w - 1) moveAndPaint(col + 1, row);
            else if (!state.current.spaceHeld) deckStore.getState().setActiveFrame(activeFrameIdx + 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (row > 0) moveAndPaint(col, row - 1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (row < ROWS - 1) moveAndPaint(col, row + 1);
          } else if (e.key === ' ' && !e.repeat) {
            e.preventDefault();
            const currentVal = state.current.pixels[col * ROWS + row] ?? 0;
            state.current.paintValue = currentVal > 0 ? 0 : activeColor;
            state.current.spaceHeld = true;
            deckStore.getState().beginStroke();
            deckStore.getState().setPixel(activeFrameIdx, col, row, state.current.paintValue);
            announce(state.current.paintValue === 0 ? 'Erased' : 'Painted');
          } else if (e.key === ' ') {
            e.preventDefault();
          } else if ((e.key === 'f' || e.key === 'F') && !ctrl) {
            e.preventDefault();
            deckStore.getState().floodFill(activeFrameIdx, col, row, activeColor);
            announce(`Flood fill at col ${col + 1}, row ${row + 1}`);
          } else if ((e.key === '+' || e.key === '=') && !ctrl) {
            e.preventDefault();
            deckStore.getState().setZoom(stepZoom(deckStore.getState().zoom, 1));
          } else if (e.key === '-' && !ctrl) {
            e.preventDefault();
            deckStore.getState().setZoom(stepZoom(deckStore.getState().zoom, -1));
          } else if (e.key === 'n' && !ctrl) {
            deckStore.getState().addFrame(frames.length - 1);
          } else if (e.key === 'z' && ctrl && !e.shiftKey) {
            e.preventDefault();
            state.current.spaceHeld = false;
            deckStore.getState().undo();
          } else if ((e.key === 'y' && ctrl) || (e.key === 'Z' && ctrl && e.shiftKey)) {
            e.preventDefault();
            state.current.spaceHeld = false;
            deckStore.getState().redo();
          }
        }}
        onKeyUp={e => {
          if (e.key === ' ') {
            state.current.spaceHeld = false;
            deckStore.getState().commitStroke();
          }
        }}
        onBlur={() => {
          state.current.spaceHeld = false;
          deckStore.getState().commitStroke();
          if (state.current.keyboardFocused) {
            state.current.keyboardFocused = false;
            setFocusMarks(false);
            const c = ctx();
            if (c) repaintCell(c, state.current.cursor.col, state.current.cursor.row);
          }
        }}
      />
      </div>
    </div>
  );
}
