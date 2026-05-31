import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenTreeStyle = 'tree-6';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function setPixelSafe(f: Frame, col: number, row: number, value: number): void {
  const c = Math.round(col);
  const r = Math.round(row);
  if (c < 0 || c >= FRAME_COLS || r < 0 || r >= FRAME_ROWS) return;
  f[c * FRAME_ROWS + r] = clamp(Math.round(value), 0, 255);
}

/** Bresenham line draw onto frame */
function drawLine(
  f: Frame,
  x0: number, y0: number,
  x1: number, y1: number,
  value: number,
): void {
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - cx);
  const dy = Math.abs(ey - cy);
  const sx = cx < ex ? 1 : -1;
  const sy = cy < ey ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    setPixelSafe(f, cx, cy, value);
    if (cx === ex && cy === ey) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

// ---------------------------------------------------------------------------
// tree-1: L-system grammar
// ---------------------------------------------------------------------------

function createTree1Renderer(): ZenRendererApi {
  let stopped = false;

  // L-system: axiom "F", rule F -> "FF+[+F-F-F]-[-F+F+F]"
  const axiom = 'F';
  function applyRules(s: string): string {
    let out = '';
    for (const ch of s) {
      if (ch === 'F') out += 'FF+[+F-F-F]-[-F+F+F]';
      else out += ch;
    }
    return out;
  }

  // Pre-build L-system strings for iterations 0-3
  const lSystems: string[] = [axiom];
  for (let i = 1; i <= 3; i++) {
    lSystems.push(applyRules(lSystems[i - 1]!));
  }

  // Render a single L-system iteration to a frame using turtle graphics
  function renderLSystem(str: string): Frame {
    const f = createFrame();
    let x = 4.0; // bottom-center column
    let y = FRAME_ROWS - 1.0;
    let angle = -Math.PI / 2; // pointing up
    const stack: Array<{ x: number; y: number; angle: number }> = [];
    const stepSize = 2;
    const turnAngle = 25 * (Math.PI / 180);

    for (const ch of str) {
      if (ch === 'F') {
        const nx = x + Math.cos(angle) * stepSize;
        const ny = y + Math.sin(angle) * stepSize;
        drawLine(f, x, y, nx, ny, 220);
        x = nx;
        y = ny;
      } else if (ch === '+') {
        angle += turnAngle;
      } else if (ch === '-') {
        angle -= turnAngle;
      } else if (ch === '[') {
        stack.push({ x, y, angle });
      } else if (ch === ']') {
        const state = stack.pop();
        if (state !== undefined) {
          x = state.x;
          y = state.y;
          angle = state.angle;
        }
      }
    }
    return f;
  }

  // Phase timing: 8s per iteration, 4s pause before reset
  const ITER_DURATION = 8000;
  const PAUSE_DURATION = 4000;
  const CYCLE_DURATION = ITER_DURATION * 4 + PAUSE_DURATION;

  const startTime = Date.now();

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const elapsed = (Date.now() - startTime) % CYCLE_DURATION;

      let iter: number;
      let alpha: number;

      if (elapsed < ITER_DURATION * 4) {
        iter = Math.floor(elapsed / ITER_DURATION);
        alpha = (elapsed % ITER_DURATION) / ITER_DURATION;
      } else {
        // Pause phase: show iteration 3
        iter = 3;
        alpha = 0;
      }

      iter = clamp(iter, 0, 3);

      const f = renderLSystem(lSystems[iter]!);

      // Cross-fade to next iteration during last 25% of phase
      if (alpha > 0.75 && iter < 3) {
        const nextF = renderLSystem(lSystems[iter + 1]!);
        const blend = (alpha - 0.75) / 0.25;
        for (let i = 0; i < f.length; i++) {
          f[i] = Math.round((f[i]! * (1 - blend)) + (nextF[i]! * blend));
        }
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// tree-2: Probabilistic fractal branching
// ---------------------------------------------------------------------------

interface BranchTip {
  col: number;
  row: number;
  angle: number;
  brightness: number;
}

function createTree2Renderer(): ZenRendererApi {
  let stopped = false;
  let buffer = createFrame();
  let tips: BranchTip[] = [];
  let pixelCount = 0;
  let fadeOut = false;
  let fadeAlpha = 1.0;
  let lastTime = Date.now();

  function reset(): void {
    buffer = createFrame();
    tips = [{ col: 4, row: FRAME_ROWS - 1, angle: 0, brightness: 255 }];
    pixelCount = 1;
    fadeOut = false;
    fadeAlpha = 1.0;
    buffer[4 * FRAME_ROWS + (FRAME_ROWS - 1)] = 255;
  }

  reset();

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const now = Date.now();
      const dt = now - lastTime;
      lastTime = now;

      if (fadeOut) {
        fadeAlpha -= dt * 0.0008;
        if (fadeAlpha <= 0) {
          reset();
        } else {
          for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.round((buffer[i]!) * fadeAlpha);
          }
        }
        const f = createFrame();
        f.set(buffer);
        return f;
      }

      // Probability each tip grows this frame
      const growProb = dt * 0.0015;
      const nextTips: BranchTip[] = [];

      for (const tip of tips) {
        if (Math.random() >= growProb) {
          nextTips.push(tip);
          continue;
        }

        // Grow: spawn 2-3 children
        const numChildren = Math.random() < 0.35 ? 3 : 2;
        const spread = 0.4;
        const childOffsets = [
          (Math.random() - 0.5) * spread,
          0.35 + Math.random() * 0.3,
          -0.35 - Math.random() * 0.3,
        ];

        for (let ci = 0; ci < numChildren; ci++) {
          const a = tip.angle + childOffsets[ci]!;
          const upAngle = -Math.PI / 2 + a;
          const stepLen = 2 + Math.random();
          const nc = tip.col + Math.cos(upAngle) * stepLen;
          const nr = tip.row + Math.sin(upAngle) * stepLen;

          if (nr >= 0 && nr < FRAME_ROWS && nc >= 0 && nc < FRAME_COLS) {
            const brightness = Math.round(tip.brightness * (0.75 + Math.random() * 0.15));
            drawLine(buffer, tip.col, tip.row, nc, nr, brightness);
            pixelCount += Math.ceil(stepLen);
            nextTips.push({ col: nc, row: nr, angle: a, brightness });
          }
        }
      }

      tips = nextTips;

      if (pixelCount > FRAME_COLS * FRAME_ROWS * 0.5 || tips.length === 0) {
        fadeOut = true;
      }

      const f = createFrame();
      f.set(buffer);
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// tree-3: Canopy-first
// ---------------------------------------------------------------------------

interface TreePoint { col: number; row: number }
interface TreeSegment { x0: number; y0: number; x1: number; y1: number; brightness: number }

function createTree3Renderer(): ZenRendererApi {
  let stopped = false;
  const startTime = Date.now();

  // Scatter canopy points in top third
  const NUM_CANOPY = 12;
  const canopyPoints: TreePoint[] = [];
  for (let i = 0; i < NUM_CANOPY; i++) {
    canopyPoints.push({
      col: Math.floor(Math.random() * FRAME_COLS),
      row: Math.floor(Math.random() * Math.floor(FRAME_ROWS / 3)),
    });
  }

  // Branch junction points
  const mid1: TreePoint = { col: 2, row: Math.floor(FRAME_ROWS / 2) };
  const mid2: TreePoint = { col: 6, row: Math.floor(FRAME_ROWS / 2) };
  const mid3: TreePoint = { col: 4, row: Math.floor(FRAME_ROWS * 0.65) };
  const root: TreePoint = { col: 4, row: FRAME_ROWS - 1 };

  const segments: TreeSegment[] = [];

  // Connect canopy to mid-branch junctions
  for (const p of canopyPoints) {
    const target = p.col <= 4 ? mid1 : mid2;
    segments.push({ x0: p.col, y0: p.row, x1: target.col, y1: target.row, brightness: 170 });
  }
  segments.push({ x0: mid1.col, y0: mid1.row, x1: mid3.col, y1: mid3.row, brightness: 210 });
  segments.push({ x0: mid2.col, y0: mid2.row, x1: mid3.col, y1: mid3.row, brightness: 210 });
  segments.push({ x0: mid3.col, y0: mid3.row, x1: root.col, y1: root.row, brightness: 240 });

  const TOTAL = 20000;
  const PAUSE = 4000;
  const CYCLE = TOTAL + PAUSE;

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const elapsed = (Date.now() - startTime) % CYCLE;
      const f = createFrame();

      const fade = elapsed > TOTAL ? clamp(1 - (elapsed - TOTAL) / PAUSE, 0, 1) : 1;

      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si]!;
        const segStart = (si / segments.length) * TOTAL;
        const segEnd = ((si + 1) / segments.length) * TOTAL;

        if (elapsed < segStart) continue;

        const progress = elapsed >= segEnd ? 1 : (elapsed - segStart) / (segEnd - segStart);
        const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
        const steps = Math.max(1, Math.ceil(len) * 2);

        for (let s = 0; s <= Math.round(steps * progress); s++) {
          const t = s / steps;
          setPixelSafe(
            f,
            seg.x0 + (seg.x1 - seg.x0) * t,
            seg.y0 + (seg.y1 - seg.y0) * t,
            Math.round(seg.brightness * fade),
          );
        }
      }

      // Canopy dots brighten as tree materialises
      for (const p of canopyPoints) {
        const dotBrightness = Math.round(200 * clamp(elapsed / TOTAL, 0, 1) * fade);
        setPixelSafe(f, p.col, p.row, dotBrightness);
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// tree-4: DLA growth (diffusion-limited aggregation)
// ---------------------------------------------------------------------------

interface DLAParticle { col: number; row: number }

function createTree4Renderer(): ZenRendererApi {
  let stopped = false;
  let grid: Uint8Array;
  let buffer: Frame;
  let particles: DLAParticle[];
  let fillCount: number;
  let fadeAlpha: number;
  let fadeOut: boolean;
  let lastTime: number;

  function spawnParticle(): DLAParticle {
    return {
      col: Math.floor(Math.random() * FRAME_COLS),
      row: Math.floor(Math.random() * FRAME_ROWS),
    };
  }

  function isAdjacent(col: number, row: number): boolean {
    const neighbors: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dc, dr] of neighbors) {
      const nc = col + dc!;
      const nr = row + dr!;
      if (nc >= 0 && nc < FRAME_COLS && nr >= 0 && nr < FRAME_ROWS) {
        if ((grid[nc * FRAME_ROWS + nr] ?? 0) === 1) return true;
      }
    }
    return false;
  }

  function reset(): void {
    grid = new Uint8Array(FRAME_COLS * FRAME_ROWS);
    buffer = createFrame();
    const seedIdx = 4 * FRAME_ROWS + (FRAME_ROWS - 1);
    grid[seedIdx] = 1;
    buffer[seedIdx] = 255;
    fillCount = 1;
    fadeAlpha = 1;
    fadeOut = false;
    particles = [];
    for (let i = 0; i < 8; i++) particles.push(spawnParticle());
    lastTime = Date.now();
  }

  reset();

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const now = Date.now();
      const dt = now - lastTime;
      lastTime = now;

      if (fadeOut) {
        fadeAlpha -= dt * 0.001;
        if (fadeAlpha <= 0) {
          reset();
        } else {
          for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.round((buffer[i]!) * fadeAlpha);
          }
        }
        const f = createFrame();
        f.set(buffer);
        return f;
      }

      // Walk particles
      const STEPS = 4;
      for (let step = 0; step < STEPS; step++) {
        const nextParticles: DLAParticle[] = [];
        for (const p of particles) {
          const r = Math.random();
          let dc = 0;
          let dr = 0;
          if (r < 0.28) dc = -1;
          else if (r < 0.56) dc = 1;
          else if (r < 0.78) dr = -1; // slight upward bias
          else dr = 1;

          const nc = clamp(p.col + dc, 0, FRAME_COLS - 1);
          const nr = clamp(p.row + dr, 0, FRAME_ROWS - 1);

          if (isAdjacent(nc, nr)) {
            grid[nc * FRAME_ROWS + nr] = 1;
            buffer[nc * FRAME_ROWS + nr] = 220;
            fillCount++;
            particles.push(spawnParticle());
          } else {
            nextParticles.push({ col: nc, row: nr });
          }
        }
        particles = nextParticles;
        while (particles.length < 8) particles.push(spawnParticle());
      }

      if (fillCount > FRAME_COLS * FRAME_ROWS * 0.55) fadeOut = true;

      const f = createFrame();
      f.set(buffer);
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// tree-5: Cellular automaton sapling
// ---------------------------------------------------------------------------

function createTree5Renderer(): ZenRendererApi {
  let stopped = false;
  let grid: Uint8Array;
  let buffer: Frame;
  let lastTick: number;
  let tickCount: number;
  let fadeOut: boolean;
  let fadeAlpha: number;
  let lastTime: number;

  function buildFrame(g: Uint8Array): Frame {
    const f = createFrame();
    for (let col = 0; col < FRAME_COLS; col++) {
      for (let row = 0; row < FRAME_ROWS; row++) {
        const cell = g[col * FRAME_ROWS + row]!;
        if (cell === 1) f[col * FRAME_ROWS + row] = 220;
        else if (cell === 2) f[col * FRAME_ROWS + row] = 150;
      }
    }
    return f;
  }

  function reset(): void {
    grid = new Uint8Array(FRAME_COLS * FRAME_ROWS);
    grid[4 * FRAME_ROWS + (FRAME_ROWS - 1)] = 1;
    buffer = buildFrame(grid);
    lastTick = Date.now();
    lastTime = Date.now();
    tickCount = 0;
    fadeOut = false;
    fadeAlpha = 1;
  }

  reset();

  function tick(): void {
    const newGrid = new Uint8Array(grid);
    let changed = false;

    for (let col = 0; col < FRAME_COLS; col++) {
      for (let row = 0; row < FRAME_ROWS; row++) {
        const cell = grid[col * FRAME_ROWS + row]!;
        if (cell === 0) continue;

        // Only tips (no live cell directly above) can sprout
        const above = row > 0 ? (grid[col * FRAME_ROWS + (row - 1)] ?? 0) : 1;
        if (above !== 0) continue;

        const upProb = cell === 1 ? 0.4 : 0.25;
        const diagProb = 0.15;

        if (row > 0 && Math.random() < upProb) {
          newGrid[col * FRAME_ROWS + (row - 1)] = cell;
          changed = true;
        }
        if (col > 0 && row > 0 && Math.random() < diagProb) {
          if ((newGrid[(col - 1) * FRAME_ROWS + (row - 1)] ?? 0) === 0) {
            newGrid[(col - 1) * FRAME_ROWS + (row - 1)] = 2;
            changed = true;
          }
        }
        if (col < FRAME_COLS - 1 && row > 0 && Math.random() < diagProb) {
          if ((newGrid[(col + 1) * FRAME_ROWS + (row - 1)] ?? 0) === 0) {
            newGrid[(col + 1) * FRAME_ROWS + (row - 1)] = 2;
            changed = true;
          }
        }
      }
    }

    if (!changed) {
      fadeOut = true;
      return;
    }

    grid = newGrid;
    buffer = buildFrame(grid);
    tickCount++;
    if (tickCount > 60) fadeOut = true;
  }

  const TICK_INTERVAL = 150;

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const now = Date.now();
      const dt = now - lastTime;
      lastTime = now;

      if (fadeOut) {
        fadeAlpha -= dt * 0.0005;
        if (fadeAlpha <= 0) {
          reset();
        } else {
          for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.round((buffer[i]!) * fadeAlpha);
          }
        }
      } else if (now - lastTick >= TICK_INTERVAL) {
        lastTick = now;
        tick();
      }

      const f = createFrame();
      f.set(buffer);
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// tree-6: Trunk grows then wind-blown leaves
// ---------------------------------------------------------------------------

interface WindLeaf {
  col: number;
  row: number;
  brightness: number;
  speed: number;
  vspeed: number;
}

function createTree6Renderer(): ZenRendererApi {
  let stopped = false;
  const startTime = Date.now();

  const CYCLE = 30000;
  const PHASE1_END = 8000;
  const PHASE2_END = 20000;

  const TRUNK_COL = 4;
  const TRUNK_TOP = 5;
  const TRUNK_BOTTOM = FRAME_ROWS - 1;
  const TRUNK_LENGTH = TRUNK_BOTTOM - TRUNK_TOP;

  const BRANCH_ROWS = [8, 12, 16, 20, 24] as const;
  const BRANCH_LENGTH = 3;

  let leaves: WindLeaf[] = [];
  let lastLeafSpawnElapsed = -1000;
  let prevElapsed = 0;

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const now = Date.now();
      const elapsed = (now - startTime) % CYCLE;
      const f = createFrame();

      // Detect cycle restart and reset leaves
      if (elapsed < prevElapsed) {
        leaves = [];
        lastLeafSpawnElapsed = -1000;
      }
      prevElapsed = elapsed;

      // Phase 1: trunk grows upward
      const trunkProgress = elapsed < PHASE1_END ? elapsed / PHASE1_END : 1;
      const trunkTop = Math.round(TRUNK_BOTTOM - TRUNK_LENGTH * trunkProgress);
      for (let r = trunkTop; r <= TRUNK_BOTTOM; r++) {
        setPixelSafe(f, TRUNK_COL, r, 220);
      }

      // Phase 2: branch stubs appear
      if (elapsed >= PHASE1_END) {
        const branchProgress = elapsed < PHASE2_END
          ? (elapsed - PHASE1_END) / (PHASE2_END - PHASE1_END)
          : 1;

        for (let bi = 0; bi < BRANCH_ROWS.length; bi++) {
          const branchRow = BRANCH_ROWS[bi]!;
          const reveal = clamp(branchProgress * BRANCH_ROWS.length - bi, 0, 1);
          if (reveal <= 0) continue;
          const len = Math.round(BRANCH_LENGTH * reveal);
          for (let d = 1; d <= len; d++) {
            setPixelSafe(f, TRUNK_COL - d, branchRow + d, 185);
            setPixelSafe(f, TRUNK_COL + d, branchRow + d, 185);
          }
        }
      }

      // Phase 3: wind-blown leaves
      if (elapsed >= PHASE2_END) {
        const leafElapsed = elapsed - PHASE2_END;

        if (leafElapsed - lastLeafSpawnElapsed >= 300 && leaves.length < 40) {
          lastLeafSpawnElapsed = leafElapsed;
          const branchRow = BRANCH_ROWS[Math.floor(Math.random() * BRANCH_ROWS.length)]!;
          const side = Math.random() < 0.5 ? -1 : 1;
          leaves.push({
            col: TRUNK_COL + side * BRANCH_LENGTH + (Math.random() - 0.5),
            row: branchRow + (Math.random() - 0.5),
            brightness: 200 + Math.random() * 55,
            speed: 0.5 + Math.random() * 1.5,
            vspeed: 0.2 + Math.random() * 0.5,
          });
        }

        const dtSec = 1 / 30;
        const nextLeaves: WindLeaf[] = [];
        for (const leaf of leaves) {
          const nl: WindLeaf = {
            col: leaf.col + leaf.speed * dtSec,
            row: leaf.row + leaf.vspeed * dtSec,
            brightness: leaf.brightness * 0.995,
            speed: leaf.speed,
            vspeed: leaf.vspeed,
          };
          if (nl.col < FRAME_COLS && nl.row < FRAME_ROWS && nl.brightness > 10) {
            nextLeaves.push(nl);
            setPixelSafe(f, nl.col, nl.row, Math.round(nl.brightness));
          }
        }
        leaves = nextLeaves;
      } else {
        leaves = [];
        lastLeafSpawnElapsed = -1000;
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createZenTreeRenderer(style: ZenTreeStyle): ZenRendererApi {
  switch (style) {
    case 'tree-6': return createTree6Renderer();
  }
}
