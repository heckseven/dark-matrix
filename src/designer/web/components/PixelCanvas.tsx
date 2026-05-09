import { useEffect, useRef } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import { cn } from '@/lib/utils.js';

const MIN_L = 48;
const CELL = 20;
const GAP = 1;
const ROWS = 34;
const MODULE_GAP = 8;
const CORNER = 4;
const CURSOR_COLOR = '#4ade80';
const FONT = '14px monospace';

function colX(c: number, width: number): number {
  return c * (CELL + GAP) + (width === 18 && c >= 9 ? MODULE_GAP : 0);
}

function canvasW(width: number): number {
  return width * (CELL + GAP) - GAP + (width === 18 ? MODULE_GAP : 0);
}

const canvasH = ROWS * (CELL + GAP) - GAP;

function cellColor(v: number, hovered = false): string {
  const l = Math.round(MIN_L + (v / 255) * (255 - MIN_L));
  const out = hovered ? Math.min(255, l + 60) : l;
  return `rgb(${out},${out},${out})`;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  c: number, r: number, v: number,
  width: number, hovered: boolean, isCursor: boolean,
) {
  const x = colX(c, width);
  const y = r * (CELL + GAP);

  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, CELL, CELL);
  if (hovered) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, CELL, CELL);
  }

  ctx.fillStyle = cellColor(v, hovered);
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(v === 0 ? '•' : '∗', x + CELL / 2, y + CELL / 2 + 1);

  if (isCursor) {
    ctx.strokeStyle = CURSOR_COLOR;
    ctx.lineWidth = 1;
    const x1 = x + 1.5, y1 = y + 1.5, x2 = x + CELL - 1.5, y2 = y + CELL - 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + CORNER); ctx.lineTo(x1, y1); ctx.lineTo(x1 + CORNER, y1);
    ctx.moveTo(x2 - CORNER, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + CORNER);
    ctx.moveTo(x1, y2 - CORNER); ctx.lineTo(x1, y2); ctx.lineTo(x1 + CORNER, y2);
    ctx.moveTo(x2 - CORNER, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - CORNER);
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

export function PixelCanvas({ className }: { className?: string }) {
  const width = useDesignerStore(s => s.width);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    pixels: new Uint8Array(18 * ROWS),
    width: 9 as 9 | 18,
    hovered: null as { col: number; row: number } | null,
    cursor: { col: 0, row: 0 },
    painting: false,
    erasing: false,
    lastHit: null as { col: number; row: number } | null,
    rafPending: false,
    keyboardFocused: false,
    hasMoved: false,
    mouseDownHit: null as { col: number; row: number } | null,
    spaceHeld: false,
    dragErasing: false,
  });

  state.current.width = width;

  function ctx(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function repaintCell(c: CanvasRenderingContext2D, col: number, row: number) {
    const { pixels, width: w, hovered, cursor, keyboardFocused } = state.current;
    const v = pixels[col * ROWS + row] ?? 0;
    drawCell(c, col, row, v, w, hovered?.col === col && hovered?.row === row, keyboardFocused && cursor.col === col && cursor.row === row);
  }

  function paintAll() {
    const c = ctx();
    if (!c) return;
    const { frames, activeFrameIdx, width: w } = designerStore.getState();
    const frame = frames[activeFrameIdx];
    if (!frame) return;
    const bin = atob(frame.pixels);
    const pixels = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pixels[i] = bin.charCodeAt(i);
    state.current.pixels = pixels;
    const { hovered, cursor, keyboardFocused } = state.current;
    for (let col = 0; col < w; col++) {
      for (let row = 0; row < ROWS; row++) {
        drawCell(c, col, row, pixels[col * ROWS + row] ?? 0, w as 9 | 18,
          hovered?.col === col && hovered?.row === row,
          keyboardFocused && cursor.col === col && cursor.row === row);
      }
    }
    state.current.rafPending = false;
  }

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
  }

  function setHovered(next: { col: number; row: number } | null) {
    const c = ctx();
    if (!c) return;
    const prev = state.current.hovered;
    if (prev?.col === next?.col && prev?.row === next?.row) return;
    state.current.hovered = next;
    if (prev) repaintCell(c, prev.col, prev.row);
    if (next) repaintCell(c, next.col, next.row);
  }

  function hitTest(clientX: number, clientY: number): { col: number; row: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bbox = canvas.getBoundingClientRect();
    let x = clientX - bbox.left;
    const y = clientY - bbox.top;
    const w = state.current.width;
    if (w === 18) {
      const gapStart = 9 * (CELL + GAP) - GAP;
      if (x >= gapStart && x < gapStart + GAP + MODULE_GAP) return null;
      if (x >= gapStart + GAP + MODULE_GAP) x -= MODULE_GAP;
    }
    const col = Math.floor(x / (CELL + GAP));
    const row = Math.floor(y / (CELL + GAP));
    if (col < 0 || col >= w || row < 0 || row >= ROWS) return null;
    if (x % (CELL + GAP) >= CELL || y % (CELL + GAP) >= CELL) return null;
    return { col, row };
  }

  function doPaint(clientX: number, clientY: number) {
    const hit = hitTest(clientX, clientY);
    if (!hit) return;
    const { activeFrameIdx, activeColor } = designerStore.getState();
    const color = (state.current.erasing || state.current.dragErasing) ? 0 : activeColor;
    const last = state.current.lastHit;
    const pts = last ? bresenham(last.col, last.row, hit.col, hit.row) : [[hit.col, hit.row] as [number, number]];
    for (const [col, row] of pts) {
      designerStore.getState().setPixel(activeFrameIdx, col, row, color);
    }
    state.current.lastHit = hit;
  }

  // Resize canvas and (re)subscribe on width change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const w = canvasW(width);
    canvas.width = w * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${canvasH}px`;
    const c = canvas.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.current.cursor = { col: 0, row: 0 };
    state.current.hovered = null;
    paintAll();
    return designerStore.subscribe(schedulePaint);
  }, [width]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('p-2', className)}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="block outline-none cursor-crosshair"
        onMouseDown={e => {
          e.preventDefault();
          if (state.current.keyboardFocused) {
            state.current.keyboardFocused = false;
            const c = ctx();
            if (c) repaintCell(c, state.current.cursor.col, state.current.cursor.row);
          }
          state.current.erasing = e.button === 2;
          state.current.painting = true;
          state.current.hasMoved = false;
          state.current.lastHit = null;
          const downHit = hitTest(e.clientX, e.clientY);
          state.current.mouseDownHit = downHit;
          state.current.dragErasing = !state.current.erasing && downHit != null
            ? (state.current.pixels[downHit.col * ROWS + downHit.row] ?? 0) > 0
            : false;
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
          if (!state.current.hasMoved && state.current.mouseDownHit) {
            const { col, row } = state.current.mouseDownHit;
            const { activeFrameIdx, activeColor } = designerStore.getState();
            const currentVal = state.current.pixels[col * ROWS + row] ?? 0;
            designerStore.getState().setPixel(activeFrameIdx, col, row, currentVal > 0 ? 0 : activeColor);
          }
          state.current.painting = false;
          state.current.erasing = false;
          state.current.dragErasing = false;
          state.current.lastHit = null;
          state.current.mouseDownHit = null;
        }}
        onMouseLeave={() => { state.current.painting = false; state.current.erasing = false; state.current.dragErasing = false; state.current.lastHit = null; state.current.mouseDownHit = null; setHovered(null); }}
        onContextMenu={e => e.preventDefault()}
        onKeyDown={e => {
          state.current.keyboardFocused = true;
          const ctrl = e.ctrlKey || e.metaKey;
          const { col, row } = state.current.cursor;
          const w = state.current.width;
          const { activeFrameIdx, activeColor } = designerStore.getState();
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (col > 0) {
              moveCursor(col - 1, row);
              if (state.current.spaceHeld) designerStore.getState().setPixel(activeFrameIdx, col - 1, row, state.current.dragErasing ? 0 : activeColor);
            } else if (!state.current.spaceHeld) {
              designerStore.getState().setActiveFrame(activeFrameIdx - 1);
            }
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (col < w - 1) {
              moveCursor(col + 1, row);
              if (state.current.spaceHeld) designerStore.getState().setPixel(activeFrameIdx, col + 1, row, state.current.dragErasing ? 0 : activeColor);
            } else if (!state.current.spaceHeld) {
              designerStore.getState().setActiveFrame(activeFrameIdx + 1);
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (row > 0) {
              moveCursor(col, row - 1);
              if (state.current.spaceHeld) designerStore.getState().setPixel(activeFrameIdx, col, row - 1, state.current.dragErasing ? 0 : activeColor);
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (row < ROWS - 1) {
              moveCursor(col, row + 1);
              if (state.current.spaceHeld) designerStore.getState().setPixel(activeFrameIdx, col, row + 1, state.current.dragErasing ? 0 : activeColor);
            }
          } else if (e.key === ' ' && !e.repeat) {
            e.preventDefault();
            const currentVal = state.current.pixels[col * ROWS + row] ?? 0;
            state.current.spaceHeld = true;
            state.current.dragErasing = currentVal > 0;
            designerStore.getState().setPixel(activeFrameIdx, col, row, currentVal > 0 ? 0 : activeColor);
          } else if (e.key === ' ') {
            e.preventDefault();
          } else if (e.key === 'n' && !ctrl) {
            designerStore.getState().addFrame(activeFrameIdx);
          } else if (e.key === 'z' && ctrl && !e.shiftKey) {
            e.preventDefault();
            designerStore.getState().undo();
          } else if ((e.key === 'y' && ctrl) || (e.key === 'Z' && ctrl && e.shiftKey)) {
            e.preventDefault();
            designerStore.getState().redo();
          }
        }}
        onKeyUp={e => {
          if (e.key === ' ') { state.current.spaceHeld = false; state.current.dragErasing = false; }
        }}
        onBlur={() => {
          state.current.spaceHeld = false;
          state.current.dragErasing = false;
          if (state.current.keyboardFocused) {
            state.current.keyboardFocused = false;
            const c = ctx();
            if (c) repaintCell(c, state.current.cursor.col, state.current.cursor.row);
          }
        }}
      />
    </div>
  );
}
