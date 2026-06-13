import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

// Inertial Spin Model (ISM) murmuration simulation.
// Key references:
//   Ballerini et al. 2008 (PNAS)               — topological k-nearest neighbors
//   Cavagna & del Castillo 2014 (arXiv 1403.1202) — ISM spin dynamics
//   Cavagna et al. 2022 (Nat. Comms)            — nonlinear speed confinement

const NUM_BOIDS     = 45;
const TARGET_SPEED  = 5.0;  // px/s cruise speed
const MIN_SPEED     = 1.5;  // px/s
const MAX_SPEED     = 10.0; // px/s hard ceiling
const K_NEIGHBORS   = 7;    // topological neighbors for alignment + cohesion
const K_SEP         = 1;    // topological neighbors for separation only
const SEP_WEIGHT    = 18;   // separation force magnitude
const COH_WEIGHT    = 22;   // topological cohesion force magnitude
const GLOBAL_COH    = 8;    // pull toward flock centroid — keeps flock as one unit
const J_ALIGN       = 10.0; // spin–alignment coupling (Cavagna J)
const CHI           = 0.4;  // behavioral inertia (s) — higher = faster waves
const ETA           = 1.8;  // spin friction — decays in ~1/ETA s
const SPIN_NOISE    = 0.5;  // random spin perturbation (rad/s)
const SPEED_DEAD    = 1.0;  // px/s dead zone for nonlinear speed confinement
const SPEED_K       = 3.0;  // confinement strength outside dead zone
const BANK_THRESH   = 2.5;  // |spin| above this: boid banks (dims — dark wave)
const WALL_MARGIN   = 2.0;  // px from edge where soft repulsion starts
const WALL_WEIGHT   = 30;   // soft wall repulsion force magnitude
const PRED_RADIUS   = 7.0;  // px flee radius
const PRED_WEIGHT   = 45;   // flee force magnitude
const PRED_DURATION = 5000; // ms
const PRED_SPEED    = 2.5;  // px/s inward drift

export type MurmurationRenderer = ZenRendererApi & {
  triggerPredator(): void;
  tick(dt: number): void;
};

interface Boid {
  x: number; y: number;
  vx: number; vy: number;
  spin: number; // angular momentum scalar (rad/s), drives turning waves
}

interface Predator {
  x: number; y: number;
  vx: number; vy: number;
  endMs: number;
}

// 2D cross product z-component — signed torque measure.
function cross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

// Soft wall repulsion: returns a restoring force component for one axis.
function wallForce(pos: number, max: number): number {
  if (pos < WALL_MARGIN) return (1 - pos / WALL_MARGIN) * WALL_WEIGHT;
  if (pos > max - WALL_MARGIN) return -(1 - (max - pos) / WALL_MARGIN) * WALL_WEIGHT;
  return 0;
}

// Nonlinear speed confinement (Cavagna 2022): dead zone + quadratic penalty.
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

export function createZenMurmurationRenderer(
  _side?: 'left' | 'right',
): MurmurationRenderer {
  // Initialise boids in a cluster around display centre.
  const cx0 = (FRAME_COLS - 1) / 2, cy0 = (FRAME_ROWS - 1) / 2;
  const boids: Boid[] = Array.from({ length: NUM_BOIDS }, () => {
    const angle = Math.random() * Math.PI * 2;
    return {
      x: cx0 + (Math.random() - 0.5) * 4,
      y: cy0 + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * TARGET_SPEED,
      vy: Math.sin(angle) * TARGET_SPEED,
      spin: (Math.random() - 0.5) * 0.2,
    };
  });

  let lastTime = Date.now();
  let stopped = false;
  let pred: Predator | null = null;

  function triggerPredator(): void {
    if (pred !== null) return;

    const edge = Math.floor(Math.random() * 4);
    let px: number, py: number;
    if (edge === 0)      { px = Math.random() * FRAME_COLS; py = -2; }
    else if (edge === 1) { px = Math.random() * FRAME_COLS; py = FRAME_ROWS + 2; }
    else if (edge === 2) { px = -2; py = Math.random() * FRAME_ROWS; }
    else                 { px = FRAME_COLS + 2; py = Math.random() * FRAME_ROWS; }

    const dx = cx0 - px, dy = cy0 - py;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    pred = {
      x: px, y: py,
      vx: (dx / dist) * PRED_SPEED, vy: (dy / dist) * PRED_SPEED,
      endMs: Date.now() + PRED_DURATION,
    };
  }

  function step(dt: number, now: number): void {
    if (pred !== null) {
      if (now >= pred.endMs) { pred = null; }
      else { pred.x += pred.vx * dt; pred.y += pred.vy * dt; }
    }

    const n = boids.length;

    // Arithmetic mean centroid — valid because boids no longer wrap.
    let sumX = 0, sumY = 0;
    for (const b of boids) { sumX += b.x; sumY += b.y; }
    const cx = sumX / n, cy = sumY / n;

    for (let i = 0; i < n; i++) {
      const b = boids[i]!;

      // Topological neighbor selection: sort by Euclidean distance, take k closest.
      const nbrs: Array<{ j: number; dx: number; dy: number; d: number }> = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = boids[j]!;
        const dx = b.x - o.x, dy = b.y - o.y;
        nbrs.push({ j, dx, dy, d: Math.sqrt(dx * dx + dy * dy) });
      }
      nbrs.sort((a, b) => a.d - b.d);

      // Separation: nearest K_SEP only.
      let fx = 0, fy = 0;
      for (let k = 0; k < Math.min(K_SEP, nbrs.length); k++) {
        const { dx, dy, d } = nbrs[k]!;
        if (d > 0) { fx += (dx / d) * SEP_WEIGHT; fy += (dy / d) * SEP_WEIGHT; }
      }

      // Alignment (ISM spin torque) + cohesion: nearest K_NEIGHBORS.
      let torqueSum = 0, cohDx = 0, cohDy = 0;
      const kN = Math.min(K_NEIGHBORS, nbrs.length);
      const bspd = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || TARGET_SPEED;
      const bux = b.vx / bspd, buy = b.vy / bspd;

      for (let k = 0; k < kN; k++) {
        const { j, dx, dy } = nbrs[k]!;
        const o = boids[j]!;
        const ospd = Math.sqrt(o.vx * o.vx + o.vy * o.vy) || TARGET_SPEED;
        torqueSum += cross2d(bux, buy, o.vx / ospd, o.vy / ospd);
        cohDx += -dx; cohDy += -dy;
      }

      if (kN > 0) {
        // ISM spin update: ds/dt = J·<torque> − η·s + noise
        b.spin += dt * (J_ALIGN * (torqueSum / kN) - ETA * b.spin
                       + (Math.random() - 0.5) * 2 * SPIN_NOISE);

        // Topological cohesion
        const cdx = cohDx / kN, cdy = cohDy / kN;
        const cm = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
        fx += (cdx / cm) * COH_WEIGHT;
        fy += (cdy / cm) * COH_WEIGHT;
      }

      // Global cohesion: pull toward flock centroid.
      const gcx = cx - b.x, gcy = cy - b.y;
      const gcm = Math.sqrt(gcx * gcx + gcy * gcy) || 1;
      fx += (gcx / gcm) * GLOBAL_COH;
      fy += (gcy / gcm) * GLOBAL_COH;

      // Soft wall repulsion.
      fx += wallForce(b.x, FRAME_COLS);
      fy += wallForce(b.y, FRAME_ROWS);

      // Predator flee.
      if (pred !== null) {
        const pdx = b.x - pred.x, pdy = b.y - pred.y;
        const pd = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pd < PRED_RADIUS && pd > 0) {
          fx += (pdx / pd) * PRED_WEIGHT;
          fy += (pdy / pd) * PRED_WEIGHT;
        }
      }

      // Apply positional forces to velocity.
      b.vx += fx * dt;
      b.vy += fy * dt;

      // Rotate velocity by spin (ISM: dθ/dt = spin / chi).
      const rotAngle = b.spin * dt / CHI;
      const cosR = Math.cos(rotAngle), sinR = Math.sin(rotAngle);
      const rvx = b.vx * cosR - b.vy * sinR;
      b.vy = b.vx * sinR + b.vy * cosR;
      b.vx = rvx;

      // Nonlinear speed confinement.
      [b.vx, b.vy] = confineSpeed(b.vx, b.vy);

      // Update position; reflect off bounds as a hard safety valve.
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0)             { b.x = 0;             b.vx =  Math.abs(b.vx); }
      if (b.x > FRAME_COLS - 1) { b.x = FRAME_COLS - 1; b.vx = -Math.abs(b.vx); }
      if (b.y < 0)             { b.y = 0;             b.vy =  Math.abs(b.vy); }
      if (b.y > FRAME_ROWS - 1) { b.y = FRAME_ROWS - 1; b.vy = -Math.abs(b.vy); }
    }
  }

  function drawFrame(): Frame {
    const frame = createFrame();
    for (const b of boids) {
      // Banking: high |spin| = boid presenting narrow cross-section (dark wave).
      if (Math.abs(b.spin) > BANK_THRESH) continue;
      const col = Math.round(b.x);
      const row = Math.round(b.y);
      if (col >= 0 && col < FRAME_COLS && row >= 0 && row < FRAME_ROWS) {
        frame[col * FRAME_ROWS + row] = 255;
      }
    }
    return frame;
  }

  return {
    triggerPredator,

    tick(dt: number): void {
      if (!stopped) { const now = Date.now(); step(dt, now); lastTime = now; }
    },

    render(): Frame {
      const now = Date.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      if (!stopped) step(dt, now);
      return drawFrame();
    },

    stop(): void { stopped = true; },
  };
}
