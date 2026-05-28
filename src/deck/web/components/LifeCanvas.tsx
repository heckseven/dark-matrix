import { useEffect, useRef } from 'react';
import { useDeckStore, deckStore, stepZoom, ROWS } from '../store.js';
import { LIFE_ALGORITHMS } from '../../../animations/gol.js';
import type { BiomePreset } from '../types/life-types.js';

const MIN_L = 48;
const BASE_CELL = 20;
const GAP = 1;
const BASE_CORNER = 4;
const BASE_MODULE_GAP = 8;
const CURSOR_COLOR = '#4ade80';

// ── rendering helpers (mirrors PixelCanvas exactly) ──────────────────────────

function computeMetrics(zoom: number) {
  const cell = BASE_CELL * zoom;
  return {
    cell,
    gap: GAP,
    corner: BASE_CORNER * zoom,
    moduleGap: BASE_MODULE_GAP * zoom,
    canvasH: ROWS * (cell + GAP) - GAP,
    font: `${Math.round(14 * zoom)}px monospace`,
  };
}

function colX(c: number, cols: number, m: ReturnType<typeof computeMetrics>): number {
  return c * (m.cell + m.gap) + (cols === 18 && c >= 9 ? m.moduleGap : 0);
}

function canvasW(cols: number, m: ReturnType<typeof computeMetrics>): number {
  return cols * (m.cell + m.gap) - m.gap + (cols === 18 ? m.moduleGap : 0);
}

function cellColor(v: number, hovered = false): string {
  const l = Math.round(MIN_L + (v / 255) * (255 - MIN_L));
  const out = hovered ? Math.min(255, l + 60) : l;
  return `rgb(${out},${out},${out})`;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  col: number, row: number, v: number,
  cols: number, hovered: boolean, isCursor: boolean,
  m: ReturnType<typeof computeMetrics>,
) {
  const x = colX(col, cols, m);
  const y = row * (m.cell + m.gap);
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

// ── grid encode/decode ───────────────────────────────────────────────────────

export function decodeGrid(snapshot: string): Uint8Array<ArrayBuffer> {
  const bin = atob(snapshot);
  const arr = new Uint8Array(bin.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function encodeGrid(arr: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
  return btoa(bin);
}

export function makeRandomGrid(cols: number, density = 0.35): Uint8Array<ArrayBuffer> {
  const g = new Uint8Array(cols * ROWS) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < g.length; i++) g[i] = Math.random() < density ? 255 : 0;
  return g;
}

function invertGrid(grid: Uint8Array): Uint8Array<ArrayBuffer> {
  const g = new Uint8Array(grid.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < grid.length; i++) g[i] = (grid[i]! > 0) ? 0 : 255;
  return g;
}

function gridsEqual(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function applySpawn(
  grid: Uint8Array,
  rate: number,
  mode: 'scatter' | 'cluster' | 'edge',
  cols: number,
): Uint8Array<ArrayBuffer> {
  const total = cols * ROWS;
  const g = new Uint8Array(grid) as Uint8Array<ArrayBuffer>;
  if (mode === 'cluster') {
    const clusters = Math.max(1, Math.ceil(rate / 5));
    for (let i = 0; i < clusters; i++) {
      const col = Math.floor(Math.random() * cols);
      const row = Math.floor(Math.random() * ROWS);
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          g[((col + dc + cols) % cols) * ROWS + ((row + dr + ROWS) % ROWS)] = 255;
        }
      }
    }
  } else if (mode === 'edge') {
    for (let i = 0; i < rate; i++) {
      if (Math.random() < 0.5) {
        const col = Math.floor(Math.random() * cols);
        for (let row = 0; row < ROWS; row++) { if (Math.random() < 0.5) g[col * ROWS + row] = 255; }
      } else {
        const row = Math.floor(Math.random() * ROWS);
        for (let col = 0; col < cols; col++) { if (Math.random() < 0.5) g[col * ROWS + row] = 255; }
      }
    }
  } else {
    for (let i = 0; i < rate; i++) g[Math.floor(Math.random() * total)] = 255;
  }
  return g;
}

export function stepGrid(grid: Uint8Array, cols: number, birth: readonly number[], survival: readonly number[]): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(cols * ROWS) as Uint8Array<ArrayBuffer>;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < ROWS; row++) {
      let n = 0;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (dc === 0 && dr === 0) continue;
          if ((grid[((col + dc + cols) % cols) * ROWS + ((row + dr + ROWS) % ROWS)] ?? 0) > 0) n++;
        }
      }
      const alive = (grid[col * ROWS + row] ?? 0) > 0;
      next[col * ROWS + row] = (alive ? survival.includes(n) : birth.includes(n)) ? 255 : 0;
    }
  }
  return next;
}

// ── component ────────────────────────────────────────────────────────────────

const HISTORY_MAX = 64;

export function LifeCanvas({ biome, playing, generation, cols = 9, stepForwardCount = 0, stepBackCount = 0, onGridChange, onTick, onStep, onCursorMove }: {
  biome: BiomePreset | null;
  playing: boolean;
  generation: number;
  cols?: 9 | 18;
  stepForwardCount?: number;
  stepBackCount?: number;
  onGridChange: (snapshot: string) => void;
  onTick?: (snapshot: string) => void;
  onStep?: (count: number) => void;
  onCursorMove?: (pos: { col: number; row: number } | null) => void;
}) {
  const zoom = useDeckStore(s => s.zoom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const focusMarksRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Array<Uint8Array<ArrayBuffer>>>([]);
  const biomeRef = useRef(biome);
  biomeRef.current = biome;
  const prevStepFwdRef = useRef(stepForwardCount);
  const prevStepBackRef = useRef(stepBackCount);
  const stepCountRef = useRef(0);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;

  const state = useRef({
    grid: new Uint8Array(cols * ROWS) as Uint8Array<ArrayBuffer>,
    prevGrid: null as Uint8Array<ArrayBuffer> | null,
    prev2Grid: null as Uint8Array<ArrayBuffer> | null,
    stasisCount: 0,
    phase: 'normal' as 'normal' | 'inverted',
    hovered: null as { col: number; row: number } | null,
    cursor: { col: 0, row: 0 },
    painting: false,
    paintValue: 0 as 0 | 255,
    lastHit: null as { col: number; row: number } | null,
    rafPending: false,
    keyboardFocused: false,
    zoom: 1,
    playing: false,
    cols: 9 as 9 | 18,
  });

  state.current.zoom = zoom;
  state.current.playing = playing;
  state.current.cols = cols;

  // ── rendering ─────────────────────────────────────────────────────────────

  function getM() { return computeMetrics(state.current.zoom); }
  function getCtx() { return canvasRef.current?.getContext('2d') ?? null; }

  function repaintCell(col: number, row: number) {
    const c = getCtx();
    if (!c) return;
    const { grid, hovered, cursor, keyboardFocused, cols: w } = state.current;
    drawCell(c, col, row, grid[col * ROWS + row] ?? 0,
      w, hovered?.col === col && hovered?.row === row,
      keyboardFocused && cursor.col === col && cursor.row === row,
      getM());
  }

  function paintAll() {
    const c = getCtx();
    if (!c) return;
    const { grid, hovered, cursor, keyboardFocused, cols: w } = state.current;
    const m = getM();
    for (let col = 0; col < w; col++) {
      for (let row = 0; row < ROWS; row++) {
        drawCell(c, col, row, grid[col * ROWS + row] ?? 0,
          w, hovered?.col === col && hovered?.row === row,
          keyboardFocused && cursor.col === col && cursor.row === row,
          m);
      }
    }
    state.current.rafPending = false;
  }

  function schedulePaint() {
    if (state.current.rafPending) return;
    state.current.rafPending = true;
    requestAnimationFrame(paintAll);
  }

  // ── hit test ──────────────────────────────────────────────────────────────

  function hitTest(clientX: number, clientY: number): { col: number; row: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bbox = canvas.getBoundingClientRect();
    let x = clientX - bbox.left;
    const y = clientY - bbox.top;
    const { cols: w } = state.current;
    const m = getM();
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

  function setHovered(next: { col: number; row: number } | null) {
    const prev = state.current.hovered;
    if (prev?.col === next?.col && prev?.row === next?.row) return;
    state.current.hovered = next;
    if (prev) repaintCell(prev.col, prev.row);
    if (next) repaintCell(next.col, next.row);
    onCursorMoveRef.current?.(next);
  }

  function setFocusMarks(on: boolean) {
    if (focusMarksRef.current) focusMarksRef.current.style.display = on ? 'block' : 'none';
  }

  // ── canvas resize ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const m = computeMetrics(zoom);
    const w = canvasW(cols, m);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(m.canvasH * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${m.canvasH}px`;
    const c = canvas.getContext('2d');
    if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    schedulePaint();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, cols]);

  // ── grid reset on generation/biome/cols change ────────────────────────────

  useEffect(() => {
    historyRef.current = [];
    prevStepFwdRef.current = stepForwardCount;
    prevStepBackRef.current = stepBackCount;
    stepCountRef.current = 0;
    state.current.prevGrid = null;
    state.current.prev2Grid = null;
    state.current.stasisCount = 0;
    state.current.phase = 'normal';
    onStepRef.current?.(0);
    const expectedBytes = cols * ROWS;
    const snapshot = biome?.gridSnapshot;
    if (snapshot) {
      const decoded = decodeGrid(snapshot);
      // Only use the snapshot if it matches the current col width
      state.current.grid = decoded.length === expectedBytes ? decoded : makeRandomGrid(cols);
    } else {
      state.current.grid = makeRandomGrid(cols);
    }
    schedulePaint();
    onTickRef.current?.(encodeGrid(state.current.grid));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, biome?.name, cols]);

  // ── single step forward ───────────────────────────────────────────────────

  useEffect(() => {
    if (stepForwardCount === prevStepFwdRef.current) return;
    prevStepFwdRef.current = stepForwardCount;
    if (state.current.playing || !biomeRef.current) return;
    const { birth, survival } = LIFE_ALGORITHMS[biomeRef.current.algorithm];
    if (historyRef.current.length >= HISTORY_MAX) historyRef.current.shift();
    historyRef.current.push(new Uint8Array(state.current.grid) as Uint8Array<ArrayBuffer>);
    const next = stepGrid(state.current.grid, state.current.cols, birth, survival);
    state.current.grid = next;
    schedulePaint();
    onTickRef.current?.(encodeGrid(next));
    const count = ++stepCountRef.current;
    onStepRef.current?.(count);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepForwardCount]);

  // ── single step back ─────────────────────────────────────────────────────

  useEffect(() => {
    if (stepBackCount === prevStepBackRef.current) return;
    prevStepBackRef.current = stepBackCount;
    if (state.current.playing) return;
    const prev = historyRef.current.pop();
    if (!prev) return;
    state.current.grid = prev;
    schedulePaint();
    onTickRef.current?.(encodeGrid(prev));
    const count = Math.max(0, --stepCountRef.current);
    stepCountRef.current = count;
    onStepRef.current?.(count);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepBackCount]);

  // ── simulation tick ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!playing || !biome) return;
    state.current.prevGrid = null;
    state.current.prev2Grid = null;
    state.current.stasisCount = 0;
    state.current.phase = 'normal';
    const { birth, survival } = LIFE_ALGORITHMS[biome.algorithm];
    const id = setInterval(() => {
      const b = biomeRef.current;
      const cols = state.current.cols;
      const total = cols * ROWS;
      let grid = state.current.grid;

      const sr           = b?.spawnRate        ?? 0;
      const mode         = b?.spawnMode        ?? 'scatter';
      const adaptive     = b?.adaptiveSpawn    ?? false;
      const threshold    = b?.adaptiveThreshold ?? 0.1;
      const stasisAction = b?.stasisAction     ?? 'off';
      const stasisTicks  = b?.stasisTicks      ?? 5;
      const invertMode   = b?.invertMode       ?? 'off';
      const invertAt     = b?.invertAt         ?? 0.85;
      const restoreAt    = b?.restoreAt        ?? 0.30;

      // Population of the visual (canonical) state
      const pop = grid.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);

      // Phase transitions: switch between normal and inverted simulation
      if (invertMode === 'threshold') {
        const ratio = pop / total;
        if (state.current.phase === 'normal' && ratio >= invertAt) {
          state.current.phase     = 'inverted';
          state.current.prevGrid  = null;
          state.current.prev2Grid = null;
          state.current.stasisCount = 0;
        } else if (state.current.phase === 'inverted' && ratio <= restoreAt) {
          state.current.phase     = 'normal';
          state.current.prevGrid  = null;
          state.current.prev2Grid = null;
          state.current.stasisCount = 0;
        }
      }

      // Stasis detection on the visual state
      if (stasisAction === 'inject' || stasisAction === 'restart') {
        const prev  = state.current.prevGrid;
        const prev2 = state.current.prev2Grid;
        const stasis =
          pop === 0 ||
          (prev  !== null && gridsEqual(grid, prev)) ||
          (prev2 !== null && gridsEqual(grid, prev2));
        if (stasis) {
          state.current.stasisCount++;
          if (state.current.stasisCount >= stasisTicks) {
            if (stasisAction === 'restart') {
              const snap = b?.gridSnapshot;
              const expectedBytes = cols * ROWS;
              if (snap) {
                const decoded = decodeGrid(snap);
                grid = (decoded.length === expectedBytes ? decoded : makeRandomGrid(cols)) as Uint8Array<ArrayBuffer>;
              } else {
                grid = makeRandomGrid(cols) as Uint8Array<ArrayBuffer>;
              }
              state.current.prevGrid  = null;
              state.current.prev2Grid = null;
              state.current.phase = 'normal';
            } else {
              grid = applySpawn(grid, Math.max(9, sr * 3), mode, cols);
            }
            state.current.stasisCount = 0;
          }
        } else {
          state.current.stasisCount = 0;
        }
      }

      // Regular spawn with optional adaptive boost on low population
      let rate = sr;
      if (adaptive && sr > 0 && pop / total < threshold) rate = Math.max(rate, 5);
      if (rate > 0) grid = applySpawn(grid, rate, mode, cols);

      state.current.prev2Grid = state.current.prevGrid;
      state.current.prevGrid  = new Uint8Array(grid) as Uint8Array<ArrayBuffer>;

      // Step — complement before/after when in inverted phase.
      // state.current.grid stores the visual state, so invert(step(invert(visual)))
      // gives a visual result where dark-as-alive rules apply.
      const next = state.current.phase === 'inverted'
        ? invertGrid(stepGrid(invertGrid(grid), cols, birth, survival))
        : stepGrid(grid, cols, birth, survival);

      state.current.grid = next;
      schedulePaint();
      onTickRef.current?.(encodeGrid(next));
      const count = ++stepCountRef.current;
      onStepRef.current?.(count);
    }, biome.tickMs);
    return () => clearInterval(id);
  // biome behavior fields (spawnRate, spawnMode, stasisAction, invertMode, …) are read via
  // biomeRef.current inside the interval; only algorithm/tickMs require restarting the interval.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, biome?.algorithm, biome?.tickMs, cols]);

  // ── DOM structure ─────────────────────────────────────────────────────────

  const cornerStyle = { position: 'absolute' as const, width: 16, height: 16, pointerEvents: 'none' as const };
  const bdr = '1px solid white';

  return (
    <div className="p-2">
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div ref={focusMarksRef} style={{ display: 'none', position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <span style={{ ...cornerStyle, top: 0,    left: 0,    borderTop: bdr, borderLeft: bdr }} />
          <span style={{ ...cornerStyle, top: 0,    right: 0,   borderTop: bdr, borderRight: bdr }} />
          <span style={{ ...cornerStyle, bottom: 0, left: 0,    borderBottom: bdr, borderLeft: bdr }} />
          <span style={{ ...cornerStyle, bottom: 0, right: 0,   borderBottom: bdr, borderRight: bdr }} />
        </div>
        <canvas
          ref={canvasRef}
          role="application"
          aria-label="Life simulation canvas — click or drag to toggle cells when paused"
          tabIndex={0}
          className="block outline-none"
          style={{ cursor: playing ? 'default' : 'crosshair' }}
          onMouseDown={e => {
            if (state.current.playing) return;
            e.preventDefault();
            if (state.current.keyboardFocused) {
              state.current.keyboardFocused = false;
              setFocusMarks(false);
              repaintCell(state.current.cursor.col, state.current.cursor.row);
            }
            const hit = hitTest(e.clientX, e.clientY);
            if (!hit) return;
            const current = (state.current.grid[hit.col * ROWS + hit.row] ?? 0) > 0;
            state.current.paintValue = (e.button === 2 || current) ? 0 : 255;
            state.current.painting = true;
            state.current.lastHit = hit;
            const g = new Uint8Array(state.current.grid) as Uint8Array<ArrayBuffer>;
            g[hit.col * ROWS + hit.row] = state.current.paintValue;
            state.current.grid = g;
            repaintCell(hit.col, hit.row);
            canvasRef.current?.focus();
          }}
          onMouseMove={e => {
            setHovered(hitTest(e.clientX, e.clientY));
            if (state.current.playing || !state.current.painting) return;
            const hit = hitTest(e.clientX, e.clientY);
            if (!hit) return;
            const last = state.current.lastHit;
            if (last?.col === hit.col && last?.row === hit.row) return;
            state.current.lastHit = hit;
            const g = new Uint8Array(state.current.grid) as Uint8Array<ArrayBuffer>;
            g[hit.col * ROWS + hit.row] = state.current.paintValue;
            state.current.grid = g;
            repaintCell(hit.col, hit.row);
          }}
          onMouseUp={() => {
            if (!state.current.painting) return;
            state.current.painting = false;
            state.current.lastHit = null;
            onGridChange(encodeGrid(state.current.grid));
          }}
          onMouseLeave={() => {
            if (state.current.painting) {
              state.current.painting = false;
              state.current.lastHit = null;
              onGridChange(encodeGrid(state.current.grid));
            }
            setHovered(null);
          }}
          onContextMenu={e => e.preventDefault()}
          onFocus={() => {
            if (!state.current.keyboardFocused) {
              state.current.keyboardFocused = true;
              setFocusMarks(true);
              repaintCell(state.current.cursor.col, state.current.cursor.row);
            }
          }}
          onBlur={() => {
            if (state.current.keyboardFocused) {
              state.current.keyboardFocused = false;
              setFocusMarks(false);
              repaintCell(state.current.cursor.col, state.current.cursor.row);
            }
          }}
          onKeyDown={e => {
            if (state.current.playing) return;
            const { cursor: { col, row }, cols: w } = state.current;
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              if (col > 0) { repaintCell(col, row); state.current.cursor = { col: col - 1, row }; repaintCell(col - 1, row); }
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              if (col < w - 1) { repaintCell(col, row); state.current.cursor = { col: col + 1, row }; repaintCell(col + 1, row); }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (row > 0) { repaintCell(col, row); state.current.cursor = { col, row: row - 1 }; repaintCell(col, row - 1); }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (row < ROWS - 1) { repaintCell(col, row); state.current.cursor = { col, row: row + 1 }; repaintCell(col, row + 1); }
            } else if (e.key === ' ') {
              e.preventDefault();
              const idx = col * ROWS + row;
              const current = (state.current.grid[idx] ?? 0) > 0;
              const g = new Uint8Array(state.current.grid) as Uint8Array<ArrayBuffer>;
              g[idx] = current ? 0 : 255;
              state.current.grid = g;
              repaintCell(col, row);
              onGridChange(encodeGrid(g));
            } else if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              deckStore.getState().setZoom(stepZoom(deckStore.getState().zoom, 1));
            } else if (e.key === '-') {
              e.preventDefault();
              deckStore.getState().setZoom(stepZoom(deckStore.getState().zoom, -1));
            }
          }}
        />
      </div>
    </div>
  );
}
