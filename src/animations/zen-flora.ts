import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenFloraStyle =
  | 'flora-1'
  | 'flora-2'
  | 'flora-3'
  | 'flora-4'
  | 'flora-5'
  | 'flora-6';

const CENTER_COL = 4;
const CENTER_ROW = 17;
// Use min(CENTER_COL, CENTER_ROW) for a square-ish polar fit
const POLAR_SCALE = 4;

/** Clamp a value to [0, 255] and round to integer */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Plot a bright pixel with soft falloff to neighbouring pixels.
 * col/row may be fractional — we round to nearest and add neighbours.
 */
function plotSoft(frame: Frame, col: number, row: number, brightness: number): void {
  const c = Math.round(col);
  const r = Math.round(row);
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= FRAME_COLS || nr < 0 || nr >= FRAME_ROWS) continue;
      const dist = Math.sqrt(dc * dc + dr * dr);
      const contrib = brightness * Math.exp(-dist * 1.5);
      const idx = nc * FRAME_ROWS + nr;
      frame[idx] = clamp255((frame[idx] ?? 0) + contrib);
    }
  }
}

/**
 * Plot a bright dot (single pixel, no falloff).
 */
function plotDot(frame: Frame, col: number, row: number, brightness: number): void {
  const c = Math.round(col);
  const r = Math.round(row);
  if (c < 0 || c >= FRAME_COLS || r < 0 || r >= FRAME_ROWS) return;
  const idx = c * FRAME_ROWS + r;
  frame[idx] = clamp255((frame[idx] ?? 0) + brightness);
}

/**
 * Draw a line from (c0,r0) to (c1,r1) using plotSoft.
 */
function drawLine(
  frame: Frame,
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  brightness: number,
  steps = 24,
): void {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    plotSoft(frame, c0 + (c1 - c0) * t, r0 + (r1 - r0) * t, brightness);
  }
}

// ---------------------------------------------------------------------------
// flora-1: Petal unfurl
// ---------------------------------------------------------------------------
function createFlora1(): ZenRendererApi {
  let frameCount = 0;
  let stopped = false;

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const f = createFrame();

      // Cycle period in frames (at 30 fps, 45 s cycle = 1350 frames)
      const CYCLE = 1350;
      const t = (frameCount % CYCLE) / CYCLE; // 0..1 within cycle
      frameCount++;

      const NUM_PETALS = 6;
      // Petal length grows from 0 to max then back to 0
      // Use a smooth envelope: sin of half-cycle
      const envelope = Math.sin(t * Math.PI); // 0→1→0 over cycle
      const maxLen = POLAR_SCALE * 3.5; // in display units
      const petalLen = envelope * maxLen;

      // Slow rotation of the whole flower
      const rotOffset = t * Math.PI * 0.5; // 90° per cycle

      for (let p = 0; p < NUM_PETALS; p++) {
        const baseAngle = (p / NUM_PETALS) * Math.PI * 2 + rotOffset;

        // Each petal: draw two edge lines forming a pointed shape
        // Spread angle controls how "open" the petal is (wider = more open)
        const spreadAngle = 0.25 + envelope * 0.3; // narrow to open

        for (let s = -1; s <= 1; s += 2) {
          const edgeAngle = baseAngle + s * spreadAngle;
          const endC = CENTER_COL + Math.cos(edgeAngle) * petalLen;
          const endR = CENTER_ROW + Math.sin(edgeAngle) * petalLen * 2.2;
          const bright = clamp255(180 * envelope + 40);
          drawLine(f, CENTER_COL, CENTER_ROW, endC, endR, bright, 20);
        }

        // Center spine of petal (brightest)
        const endC = CENTER_COL + Math.cos(baseAngle) * petalLen;
        const endR = CENTER_ROW + Math.sin(baseAngle) * petalLen * 2.2;
        drawLine(f, CENTER_COL, CENTER_ROW, endC, endR, clamp255(220 * envelope + 35), 20);
      }

      // Center dot always visible
      plotSoft(f, CENTER_COL, CENTER_ROW, 255);

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// flora-2: Fibonacci / golden-angle spiral
// ---------------------------------------------------------------------------
function createFlora2(): ZenRendererApi {
  let frameCount = 0;
  let stopped = false;
  const GOLDEN_ANGLE = 137.508 * (Math.PI / 180);
  const MAX_POINTS = 80;
  const CYCLE_FRAMES = 600; // grow fully in 20s @ 30fps

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const f = createFrame();

      const t = frameCount / CYCLE_FRAMES;
      const numPoints = Math.floor((t % 1) * MAX_POINTS) + 1;
      // Slow global rotation
      const rotAngle = (frameCount / 1200) * Math.PI * 2;
      frameCount++;

      for (let n = 0; n < numPoints; n++) {
        const angle = n * GOLDEN_ANGLE + rotAngle;
        // Radius scales with sqrt(n) and fits within POLAR_SCALE
        const r = Math.sqrt(n) * (POLAR_SCALE / Math.sqrt(MAX_POINTS));
        const col = CENTER_COL + Math.cos(angle) * r;
        // Stretch vertically to fill the taller display
        const row = CENTER_ROW + Math.sin(angle) * r * 2.5;

        // Brightness: newer points brighter
        const ageFrac = n / numPoints;
        const bright = clamp255(180 + 75 * ageFrac);
        plotDot(f, col, row, bright);
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// flora-3: Fractal L-system bloom
// ---------------------------------------------------------------------------

interface LSegment {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

function buildLSystem(iterations: number): LSegment[] {
  const segments: LSegment[] = [];

  // Recursive tree: trunk at bottom-center, growing upward (-PI/2)
  function grow(c: number, r: number, angle: number, len: number, depth: number): void {
    if (depth === 0 || len < 0.4) return;

    const endC = c + Math.cos(angle) * len;
    const endR = r + Math.sin(angle) * len;
    segments.push({ c0: c, r0: r, c1: endC, r1: endR });

    const nextLen = len * 0.62;
    const branchAngle = 0.55; // ~31 degrees

    grow(endC, endR, angle - branchAngle, nextLen, depth - 1);
    grow(endC, endR, angle, nextLen * 0.8, depth - 1);
    grow(endC, endR, angle + branchAngle, nextLen, depth - 1);
  }

  const trunkLen = 8;
  grow(CENTER_COL, FRAME_ROWS - 2, -Math.PI / 2, trunkLen, iterations);

  return segments;
}

function createFlora3(): ZenRendererApi {
  let frameCount = 0;
  let stopped = false;

  const GROW_FRAMES = 450; // 15s per iteration at 30fps
  const MAX_ITER = 4;
  const levelSegments: LSegment[][] = [];
  for (let i = 1; i <= MAX_ITER; i++) {
    levelSegments.push(buildLSystem(i));
  }

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const f = createFrame();

      const cycleDuration = GROW_FRAMES * MAX_ITER;
      const cycleT = frameCount % cycleDuration;
      frameCount++;

      // Which iteration level are we growing into?
      const iter = Math.min(Math.floor(cycleT / GROW_FRAMES), MAX_ITER - 1);
      // How far through this iteration (0..1)
      const iterT = (cycleT % GROW_FRAMES) / GROW_FRAMES;

      // Draw all completed iterations fully (dim)
      for (let i = 0; i < iter; i++) {
        const segs = levelSegments[i];
        if (!segs) continue;
        for (const seg of segs) {
          const bright = clamp255(80 + 60 * (i / MAX_ITER));
          drawLine(f, seg.c0, seg.r0, seg.c1, seg.r1, bright, 10);
        }
      }

      // Draw current iteration partially (reveal segments one by one)
      const currentSegs = levelSegments[iter];
      if (currentSegs && currentSegs.length > 0) {
        const visibleCount = Math.floor(iterT * currentSegs.length);
        for (let i = 0; i < visibleCount; i++) {
          const seg = currentSegs[i];
          if (!seg) continue;
          const bright = clamp255(160 + 60 * (iter / MAX_ITER));
          drawLine(f, seg.c0, seg.r0, seg.c1, seg.r1, bright, 10);
        }
        // Partially draw the next segment
        if (visibleCount < currentSegs.length) {
          const seg = currentSegs[visibleCount];
          if (seg) {
            const partialT = (iterT * currentSegs.length) % 1;
            const midC = seg.c0 + (seg.c1 - seg.c0) * partialT;
            const midR = seg.r0 + (seg.r1 - seg.r0) * partialT;
            drawLine(f, seg.c0, seg.r0, midC, midR, 200, 8);
          }
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
// flora-4: Rose curve r=cos(k*theta) rotating
// ---------------------------------------------------------------------------
function createFlora4(): ZenRendererApi {
  let frameCount = 0;
  let stopped = false;

  // k varies: 2→4→2 slowly
  const K_CYCLE = 1800; // 60s full k-cycle @ 30fps
  const ROT_CYCLE = 600; // 20s full rotation @ 30fps

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const f = createFrame();

      // Vary k smoothly between 2 and 4 (triangle wave)
      const kT = (frameCount % K_CYCLE) / K_CYCLE; // 0..1
      // Triangle wave: 0→1→0
      const kTri = kT < 0.5 ? kT * 2 : 2 - kT * 2;
      const k = 2 + kTri * 2; // 2..4

      // Rotation offset
      const rotation = ((frameCount % ROT_CYCLE) / ROT_CYCLE) * Math.PI * 2;
      frameCount++;

      const STEPS = 400;
      // For non-integer k, use 2π*ceil(k) theta range to ensure full petals
      const thetaMax = Math.PI * 2 * Math.ceil(k);

      for (let i = 0; i <= STEPS; i++) {
        const theta = (i / STEPS) * thetaMax;
        const r = Math.cos(k * theta);
        if (r < 0) continue; // only positive petals

        const angle = theta + rotation;
        const col = CENTER_COL + Math.cos(angle) * r * POLAR_SCALE;
        const row = CENTER_ROW + Math.sin(angle) * r * POLAR_SCALE * 3;
        const bright = clamp255(150 + 105 * r);
        plotSoft(f, col, row, bright);
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// flora-5: Lissajous blossom with persistence / decay
// ---------------------------------------------------------------------------
function createFlora5(): ZenRendererApi {
  let frameCount = 0;
  let stopped = false;
  // Persistence buffer
  const persist = new Float32Array(FRAME_COLS * FRAME_ROWS);
  const DECAY = 0.93;

  // a=3, b=2 Lissajous
  const A = 3;
  const B = 2;
  // Phase δ cycles 0→2π over 30s = 900 frames
  const PHASE_CYCLE = 900;

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const f = createFrame();

      const delta = ((frameCount % PHASE_CYCLE) / PHASE_CYCLE) * Math.PI * 2;
      frameCount++;

      // Decay persistence
      for (let i = 0; i < persist.length; i++) {
        persist[i] = (persist[i] ?? 0) * DECAY;
      }

      // Trace the Lissajous figure and add to persistence
      const STEPS = 300;
      for (let i = 0; i <= STEPS; i++) {
        const t = (i / STEPS) * Math.PI * 2;
        const x = Math.sin(A * t + delta); // -1..1
        const y = Math.sin(B * t);          // -1..1

        // Map to display: x→col, y→row, stretch vertically
        const col = CENTER_COL + x * (FRAME_COLS / 2 - 0.5);
        const row = CENTER_ROW + y * (FRAME_ROWS / 2 - 1);

        const c = Math.round(col);
        const r = Math.round(row);
        if (c >= 0 && c < FRAME_COLS && r >= 0 && r < FRAME_ROWS) {
          const idx = c * FRAME_ROWS + r;
          persist[idx] = Math.min(255, (persist[idx] ?? 0) + 60);
        }
      }

      // Copy persistence into frame
      for (let i = 0; i < FRAME_COLS * FRAME_ROWS; i++) {
        f[i] = clamp255(persist[i] ?? 0);
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// flora-6: Turing reaction-diffusion (Gray-Scott)
// ---------------------------------------------------------------------------
function createFlora6(): ZenRendererApi {
  let stopped = false;

  const W = FRAME_COLS;
  const H = FRAME_ROWS;
  const N = W * H;

  // Gray-Scott parameters — "spots / mitosis" pattern
  const GS_F = 0.0367;
  const GS_K = 0.0649;
  const Du = 0.16;
  const Dv = 0.08;

  // Chemical grids (u = feed chemical, v = catalyst)
  const u = new Float32Array(N).fill(1.0);
  const v = new Float32Array(N);

  // Seed v with a small random blob in the center
  for (let dc = -2; dc <= 2; dc++) {
    for (let dr = -4; dr <= 4; dr++) {
      const c = CENTER_COL + dc;
      const r = CENTER_ROW + dr;
      if (c >= 0 && c < W && r >= 0 && r < H) {
        const i = c * H + r;
        v[i] = 0.5 + (Math.random() - 0.5) * 0.1;
        u[i] = 0.25 + (Math.random() - 0.5) * 0.05;
      }
    }
  }

  const uNext = new Float32Array(N);
  const vNext = new Float32Array(N);

  function cellIdx(c: number, r: number): number {
    // Toroidal wrap
    const wc = ((c % W) + W) % W;
    const wr = ((r % H) + H) % H;
    return wc * H + wr;
  }

  function laplacian(grid: Float32Array, c: number, r: number): number {
    const center = grid[cellIdx(c, r)] ?? 0;
    // 5-point stencil (cross): 4 neighbours
    const sum =
      (grid[cellIdx(c - 1, r)] ?? 0) +
      (grid[cellIdx(c + 1, r)] ?? 0) +
      (grid[cellIdx(c, r - 1)] ?? 0) +
      (grid[cellIdx(c, r + 1)] ?? 0);
    return sum - 4 * center;
  }

  function step(): void {
    for (let c = 0; c < W; c++) {
      for (let r = 0; r < H; r++) {
        const i = cellIdx(c, r);
        const ui = u[i] ?? 0;
        const vi = v[i] ?? 0;
        const uvv = ui * vi * vi;
        uNext[i] = Math.max(0, Math.min(1, ui + Du * laplacian(u, c, r) - uvv + GS_F * (1 - ui)));
        vNext[i] = Math.max(0, Math.min(1, vi + Dv * laplacian(v, c, r) + uvv - (GS_F + GS_K) * vi));
      }
    }
    u.set(uNext);
    v.set(vNext);
  }

  return {
    render(): Frame {
      if (stopped) return createFrame();
      const f = createFrame();

      // Run 2 diffusion steps per render for smooth evolution
      step();
      step();

      // Display v concentration as brightness (v is 0..1, amplified to show detail)
      for (let c = 0; c < W; c++) {
        for (let r = 0; r < H; r++) {
          const vi = v[cellIdx(c, r)] ?? 0;
          f[c * H + r] = clamp255(vi * 255 * 3);
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
// Public factory
// ---------------------------------------------------------------------------
export function createZenFloraRenderer(style: ZenFloraStyle): ZenRendererApi {
  switch (style) {
    case 'flora-1': return createFlora1();
    case 'flora-2': return createFlora2();
    case 'flora-3': return createFlora3();
    case 'flora-4': return createFlora4();
    case 'flora-5': return createFlora5();
    case 'flora-6': return createFlora6();
  }
}
