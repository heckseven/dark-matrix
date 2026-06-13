import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

// Inertial Spin Model (ISM) murmuration simulation.
// Key references:
//   Ballerini et al. 2008 (PNAS)               — topological k-nearest neighbors
//   Cavagna & del Castillo 2014 (arXiv 1403.1202) — ISM spin dynamics
//   Cavagna et al. 2022 (Nat. Comms)            — nonlinear speed confinement

const NUM_BOIDS      = 55;             // standalone (9-wide)
const NUM_BOIDS_SPAN = 90;             // spanning (18-wide canvas)
const SPAN_COLS      = FRAME_COLS * 2; // 18 — virtual width when both panels span

const TARGET_SPEED  = 5.0;
const MIN_SPEED     = 1.5;
const MAX_SPEED     = 10.0;
const K_NEIGHBORS   = 7;
const K_SEP         = 3;
const SEP_WEIGHT    = 18;   // reduced — tighter flock spacing
const COH_WEIGHT    = 12;
const PERP_COH      = 1.5;  // spring perpendicular to travel — keeps flock narrow
const LONG_COH      = 0.3;  // spring along travel — weak, allows flock to elongate
const J_ALIGN       = 12.0; // strong velocity alignment — whole flock turns together
const CHI           = 2.0;  // moderate inertia — wide arcs without locking into stable orbit
const ETA           = 1.0;  // low friction — aligned turns persist and sweep across display
const SPIN_NOISE    = 1.5;  // organic variation that seeds new turn events
const SPEED_DEAD    = 1.0;
const SPEED_K       = 3.0;
const BANK_THRESH   = 4.0;  // fires during collective turns (spin ~6) not cruising (spin ~1.5)
const DIRECT_ALIGN   = 12.0; // immediate steer toward neighbor headings (complements ISM spin waves)
const WALL_MARGIN   = 2.0;
const WALL_WEIGHT   = 30;
const V_PAD_X       = 6;    // virtual cols beyond each display edge (boids swoop off/on)
const V_PAD_Y       = 8;    // virtual rows beyond top/bottom of display
const PRED_RADIUS   = 7.0;
const PRED_WEIGHT   = 45;
const PRED_DURATION = 5000;
const PRED_SPEED    = 2.5;

export type MurmurationRenderer = ZenRendererApi & {
  triggerPredator(): void;
  tick(dt: number): void;
};

interface Boid {
  x: number; y: number;
  vx: number; vy: number;
  spin: number;
}

interface Predator {
  x: number; y: number;
  vx: number; vy: number;
  endMs: number;
}

// ---------------------------------------------------------------------------
// Spanning singleton — shared boid state when both panels run murmuration.
// Left renderer owns step(); right renderer skips step() if one ran within 5 ms.
// ---------------------------------------------------------------------------
interface SpanState {
  boids: Boid[];
  pred: Predator | null;
  refCount: number;
  lastStepMs: number;
}
let spanState: SpanState | null = null;

function acquireSpanState(): SpanState {
  if (spanState === null) {
    spanState = {
      boids: initBoids(SPAN_COLS, NUM_BOIDS_SPAN),
      pred: null,
      refCount: 0,
      lastStepMs: 0, // 0 ensures first render always steps
    };
  }
  spanState.refCount++;
  return spanState;
}

function releaseSpanState(): void {
  if (spanState !== null) {
    spanState.refCount--;
    if (spanState.refCount <= 0) spanState = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initBoids(totalCols: number, count: number): Boid[] {
  const cx = (totalCols - 1) / 2, cy = (FRAME_ROWS - 1) / 2;
  const flockAngle = Math.random() * Math.PI * 2; // whole flock starts aligned
  return Array.from({ length: count }, () => {
    const angle = flockAngle + (Math.random() - 0.5) * 0.4; // ±0.2 rad spread
    return {
      x: cx + (Math.random() - 0.5) * 7,
      y: cy + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * TARGET_SPEED,
      vy: Math.sin(angle) * TARGET_SPEED,
      spin: (Math.random() - 0.5) * 0.2,
    };
  });
}

function cross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function wallForce(pos: number, max: number): number {
  if (pos < WALL_MARGIN) return (1 - pos / WALL_MARGIN) * WALL_WEIGHT;
  if (pos > max - WALL_MARGIN) return -(1 - (max - pos) / WALL_MARGIN) * WALL_WEIGHT;
  return 0;
}

function confineSpeed(vx: number, vy: number): [number, number] {
  const spd = Math.sqrt(vx * vx + vy * vy);
  if (spd === 0) {
    const a = Math.random() * Math.PI * 2;
    return [Math.cos(a) * TARGET_SPEED, Math.sin(a) * TARGET_SPEED];
  }
  const err = spd - TARGET_SPEED;
  let newSpd = spd;
  if (Math.abs(err) > SPEED_DEAD) {
    const excess = Math.abs(err) - SPEED_DEAD;
    newSpd = spd - Math.sign(err) * SPEED_K * excess * excess;
    newSpd = Math.max(MIN_SPEED, Math.min(MAX_SPEED, newSpd));
  }
  return [(vx / spd) * newSpd, (vy / spd) * newSpd];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createZenMurmurationRenderer(
  side?: 'left' | 'right',
): MurmurationRenderer {
  const spanning   = side !== undefined;
  const physCols   = spanning ? SPAN_COLS : FRAME_COLS;
  const totalCols  = physCols + V_PAD_X * 2;
  const totalRows  = FRAME_ROWS + V_PAD_Y * 2;
  // drawOffsetX maps virtual x → local panel column; drawOffsetY maps virtual y → row
  const drawOffsetX = V_PAD_X + (side === 'right' ? FRAME_COLS : 0);
  const drawOffsetY = V_PAD_Y;

  let shared: SpanState | null = null;
  let privBoids: Boid[] | null = null;
  let privPred: Predator | null = null;

  if (spanning) {
    shared = acquireSpanState();
  } else {
    privBoids = initBoids(FRAME_COLS, NUM_BOIDS);
  }

  const getBoids = (): Boid[]          => spanning ? shared!.boids : privBoids!;
  const getPred  = (): Predator | null  => spanning ? shared!.pred  : privPred;
  const setPred  = (p: Predator | null): void => {
    if (spanning) shared!.pred = p; else privPred = p;
  };

  let lastTime = Date.now();
  let stopped  = false;

  // Prevent double-step when both panels share state: only the first render()
  // call per frame advances the simulation.
  function shouldStep(now: number): boolean {
    if (!spanning) return true;
    if (now - shared!.lastStepMs < 5) return false;
    shared!.lastStepMs = now;
    return true;
  }

  function triggerPredator(): void {
    if (getPred() !== null) return;
    const cx = (totalCols - 1) / 2, cy = (totalRows - 1) / 2;
    const edge = Math.floor(Math.random() * 4);
    let px: number, py: number;
    if      (edge === 0) { px = Math.random() * totalCols; py = -2; }
    else if (edge === 1) { px = Math.random() * totalCols; py = totalRows + 2; }
    else if (edge === 2) { px = -2;            py = Math.random() * totalRows; }
    else                 { px = totalCols + 2; py = Math.random() * totalRows; }
    const dx = cx - px, dy = cy - py;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    setPred({
      x: px, y: py,
      vx: (dx / dist) * PRED_SPEED,
      vy: (dy / dist) * PRED_SPEED,
      endMs: Date.now() + PRED_DURATION,
    });
  }

  function step(dt: number, now: number): void {
    const boids = getBoids();
    let pred = getPred();

    if (pred !== null) {
      if (now >= pred.endMs) {
        setPred(null);
        pred = null;
      } else {
        pred.x += pred.vx * dt;
        pred.y += pred.vy * dt;
      }
    }

    const n = boids.length;
    let sumX = 0, sumY = 0, sumVx = 0, sumVy = 0;
    for (const b of boids) { sumX += b.x; sumY += b.y; sumVx += b.vx; sumVy += b.vy; }
    const cx = sumX / n, cy = sumY / n;
    const fspd = Math.sqrt(sumVx * sumVx + sumVy * sumVy) || 1;
    const fux = sumVx / fspd, fuy = sumVy / fspd; // flock unit-velocity direction

    for (let i = 0; i < n; i++) {
      const b = boids[i]!;

      const nbrs: Array<{ j: number; dx: number; dy: number; d: number }> = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = boids[j]!;
        const dx = b.x - o.x, dy = b.y - o.y;
        nbrs.push({ j, dx, dy, d: Math.sqrt(dx * dx + dy * dy) });
      }
      nbrs.sort((a, nb) => a.d - nb.d);

      let fx = 0, fy = 0;
      for (let k = 0; k < Math.min(K_SEP, nbrs.length); k++) {
        const { dx, dy, d } = nbrs[k]!;
        if (d > 0) { fx += (dx / d) * SEP_WEIGHT; fy += (dy / d) * SEP_WEIGHT; }
      }

      let torqueSum = 0, cohDx = 0, cohDy = 0, alignVx = 0, alignVy = 0;
      const kN   = Math.min(K_NEIGHBORS, nbrs.length);
      const bspd = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || TARGET_SPEED;
      const bux  = b.vx / bspd, buy = b.vy / bspd;

      for (let k = 0; k < kN; k++) {
        const { j, dx, dy } = nbrs[k]!;
        const o    = boids[j]!;
        const ospd = Math.sqrt(o.vx * o.vx + o.vy * o.vy) || TARGET_SPEED;
        const oux = o.vx / ospd, ouy = o.vy / ospd;
        torqueSum += cross2d(bux, buy, oux, ouy);
        cohDx += -dx; cohDy += -dy;
        alignVx += oux; alignVy += ouy;
      }

      if (kN > 0) {
        b.spin += dt * (J_ALIGN * (torqueSum / kN) - ETA * b.spin
                       + (Math.random() - 0.5) * 2 * SPIN_NOISE);
        const cdx = cohDx / kN, cdy = cohDy / kN;
        const cm  = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
        fx += (cdx / cm) * COH_WEIGHT;
        fy += (cdy / cm) * COH_WEIGHT;
        fx += (alignVx / kN) * DIRECT_ALIGN;
        fy += (alignVy / kN) * DIRECT_ALIGN;
      }

      // Anisotropic cohesion spring: strong perpendicular to travel (narrow), weak along (elongated).
      const relX  = b.x - cx, relY = b.y - cy;
      const along = relX * fux  + relY * fuy;   // signed lead distance
      const perp  = relX * -fuy + relY * fux;   // signed lateral offset
      fx -= LONG_COH * along * fux  + PERP_COH * perp * -fuy;
      fy -= LONG_COH * along * fuy  + PERP_COH * perp *  fux;

      fx += wallForce(b.x, totalCols);
      fy += wallForce(b.y, totalRows);

      if (pred !== null) {
        const pdx = b.x - pred.x, pdy = b.y - pred.y;
        const pd  = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pd < PRED_RADIUS && pd > 0) {
          fx += (pdx / pd) * PRED_WEIGHT;
          fy += (pdy / pd) * PRED_WEIGHT;
        }
      }

      b.vx += fx * dt;
      b.vy += fy * dt;

      const rotAngle = b.spin * dt / CHI;
      const cosR = Math.cos(rotAngle), sinR = Math.sin(rotAngle);
      const rvx = b.vx * cosR - b.vy * sinR;
      b.vy = b.vx * sinR + b.vy * cosR;
      b.vx = rvx;

      [b.vx, b.vy] = confineSpeed(b.vx, b.vy);

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0)             { b.x = 0;             b.vx =  Math.abs(b.vx); }
      if (b.x > totalCols - 1) { b.x = totalCols - 1; b.vx = -Math.abs(b.vx); }
      if (b.y < 0)             { b.y = 0;             b.vy =  Math.abs(b.vy); }
      if (b.y > totalRows - 1) { b.y = totalRows - 1; b.vy = -Math.abs(b.vy); }
    }
  }

  function drawFrame(): Frame {
    const frame = createFrame();
    for (const b of getBoids()) {
      if (Math.abs(b.spin) > BANK_THRESH) continue;
      const col = Math.round(b.x) - drawOffsetX;
      const row = Math.round(b.y) - drawOffsetY;
      if (col >= 0 && col < FRAME_COLS && row >= 0 && row < FRAME_ROWS) {
        frame[col * FRAME_ROWS + row] = 255;
      }
    }
    return frame;
  }

  return {
    triggerPredator,

    tick(dt: number): void {
      if (!stopped) {
        const now = Date.now();
        if (shouldStep(now)) step(dt, now);
        lastTime = now;
      }
    },

    render(): Frame {
      const now = Date.now();
      const dt  = Math.min((now - lastTime) / 1000, 0.1);
      lastTime  = now;
      if (!stopped && shouldStep(now)) step(dt, now);
      return drawFrame();
    },

    stop(): void {
      stopped = true;
      if (spanning) releaseSpanState();
    },
  };
}
