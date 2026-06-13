import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

// Inertial Spin Model (ISM) murmuration simulation.
// Key references:
//   Ballerini et al. 2008 (PNAS)       — topological k-nearest neighbors
//   Cavagna & del Castillo 2014 (arXiv 1403.1202) — ISM spin dynamics
//   Cavagna et al. 2022 (Nat. Comms)   — nonlinear speed confinement

const NUM_BOIDS     = 30;
const TARGET_SPEED  = 5.0;  // px/s cruise speed
const MIN_SPEED     = 1.5;  // px/s floor (rarely hit)
const MAX_SPEED     = 10.0; // px/s ceiling (hard guard)
const K_NEIGHBORS   = 7;    // topological neighbors for alignment + cohesion
const K_SEP         = 1;    // topological neighbors for separation only
const SEP_WEIGHT    = 18;   // direct separation force magnitude
const COH_WEIGHT    = 5;    // direct cohesion force magnitude
const J_ALIGN       = 10.0; // spin–alignment coupling (Cavagna J parameter)
const CHI           = 0.4;  // behavioral inertia (s) — higher = faster waves
const ETA           = 1.8;  // spin friction — spin drains in ~1/ETA seconds
const SPIN_NOISE    = 0.5;  // random spin perturbation amplitude (rad/s)
const SPEED_DEAD    = 1.0;  // px/s dead zone for nonlinear speed confinement
const SPEED_K       = 3.0;  // confinement strength outside dead zone
const BANK_THRESH   = 2.5;  // |spin| above this: boid is banking (dims out)
const PRED_RADIUS   = 7.0;  // px — flee radius
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
  spin: number; // 2D angular momentum scalar (rad/s), drives turning waves
}

interface Predator {
  x: number; y: number;
  vx: number; vy: number;
  endMs: number;
}

function wrap(v: number, max: number): number {
  return ((v % max) + max) % max;
}

// Shortest signed difference a − b on a toroidal axis of length `max`.
function tDiff(a: number, b: number, max: number): number {
  let d = a - b;
  if (d > max / 2) d -= max;
  if (d < -max / 2) d += max;
  return d;
}

// 2D cross product z-component: ax*by − ay*bx.
// Used as signed torque measure: positive = b is CCW of a.
function cross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

// Nonlinear speed confinement (Cavagna 2022): dead zone around TARGET_SPEED
// lets small correlated fluctuations survive; quadratic penalty outside it.
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
  // Initialise boids at random positions with near-cruise velocity and zero spin.
  const boids: Boid[] = Array.from({ length: NUM_BOIDS }, () => {
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * FRAME_COLS,
      y: Math.random() * FRAME_ROWS,
      vx: Math.cos(angle) * TARGET_SPEED,
      vy: Math.sin(angle) * TARGET_SPEED,
      spin: (Math.random() - 0.5) * 0.2,
    };
  });

  // lastTime: wall-clock anchor for render(); 0.1s cap handles first-frame spike.
  let lastTime = Date.now();
  let stopped = false;
  let pred: Predator | null = null;

  function triggerPredator(): void {
    if (pred !== null) return; // one active at a time — debounce

    const edge = Math.floor(Math.random() * 4);
    let px: number, py: number;
    if (edge === 0)      { px = Math.random() * FRAME_COLS; py = -2; }
    else if (edge === 1) { px = Math.random() * FRAME_COLS; py = FRAME_ROWS + 2; }
    else if (edge === 2) { px = -2; py = Math.random() * FRAME_ROWS; }
    else                 { px = FRAME_COLS + 2; py = Math.random() * FRAME_ROWS; }

    const cx = FRAME_COLS / 2, cy = FRAME_ROWS / 2;
    const ddx = cx - px, ddy = cy - py;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    pred = {
      x: px, y: py,
      vx: (ddx / dist) * PRED_SPEED, vy: (ddy / dist) * PRED_SPEED,
      endMs: Date.now() + PRED_DURATION,
    };
  }

  function step(dt: number, now: number): void {
    // Advance predator
    if (pred !== null) {
      if (now >= pred.endMs) { pred = null; }
      else { pred.x += pred.vx * dt; pred.y += pred.vy * dt; }
    }

    const n = boids.length;

    for (let i = 0; i < n; i++) {
      const b = boids[i]!;

      // --- Topological neighbor selection (Ballerini 2008) ---
      // Sort all other boids by toroidal distance; take the k closest.
      const nbrs: Array<{ j: number; dx: number; dy: number; d: number }> = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = boids[j]!;
        const dx = tDiff(b.x, o.x, FRAME_COLS);
        const dy = tDiff(b.y, o.y, FRAME_ROWS);
        nbrs.push({ j, dx, dy, d: Math.sqrt(dx * dx + dy * dy) });
      }
      nbrs.sort((a, b) => a.d - b.d);

      // --- Separation: nearest K_SEP only (direct force) ---
      let fx = 0, fy = 0;
      for (let k = 0; k < Math.min(K_SEP, nbrs.length); k++) {
        const { dx, dy, d } = nbrs[k]!;
        if (d > 0) { fx += (dx / d) * SEP_WEIGHT; fy += (dy / d) * SEP_WEIGHT; }
      }

      // --- Alignment (via ISM spin torque) + cohesion: nearest K_NEIGHBORS ---
      let torqueSum = 0;
      let cohDx = 0, cohDy = 0;
      const kN = Math.min(K_NEIGHBORS, nbrs.length);

      const bspd = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || TARGET_SPEED;
      const bux = b.vx / bspd, buy = b.vy / bspd; // unit velocity of b

      for (let k = 0; k < kN; k++) {
        const { j, dx, dy } = nbrs[k]!;
        const o = boids[j]!;

        // ISM torque: signed angle from b's velocity toward o's velocity.
        // τ = (v̂_i × v̂_j) — positive = o is CCW of b, so spin up CCW.
        const ospd = Math.sqrt(o.vx * o.vx + o.vy * o.vy) || TARGET_SPEED;
        torqueSum += cross2d(bux, buy, o.vx / ospd, o.vy / ospd);

        // Cohesion: accumulate direction from b toward each topological neighbor.
        cohDx += -dx; cohDy += -dy;
      }

      if (kN > 0) {
        // Spin update (ISM): ds/dt = J * <torque> − η * s + noise
        const noise = (Math.random() - 0.5) * 2 * SPIN_NOISE;
        b.spin += dt * (J_ALIGN * (torqueSum / kN) - ETA * b.spin + noise);

        // Cohesion: normalised direction toward topological center of mass
        const cdx = cohDx / kN, cdy = cohDy / kN;
        const cm = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
        fx += (cdx / cm) * COH_WEIGHT;
        fy += (cdy / cm) * COH_WEIGHT;
      }

      // --- Predator flee (direct force, bypasses spin for faster reaction) ---
      if (pred !== null) {
        const pdx = tDiff(b.x, pred.x, FRAME_COLS);
        const pdy = tDiff(b.y, pred.y, FRAME_ROWS);
        const pd = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pd < PRED_RADIUS && pd > 0) {
          fx += (pdx / pd) * PRED_WEIGHT;
          fy += (pdy / pd) * PRED_WEIGHT;
        }
      }

      // Apply separation + cohesion forces
      b.vx += fx * dt;
      b.vy += fy * dt;

      // Rotate velocity by spin (ISM: dθ/dt = spin / chi).
      // The one-frame delay between torque→spin→rotation is what makes
      // alignment information propagate as a wave rather than diffuse.
      const rotAngle = b.spin * dt / CHI;
      const cosR = Math.cos(rotAngle), sinR = Math.sin(rotAngle);
      const rvx = b.vx * cosR - b.vy * sinR;
      const rvy = b.vx * sinR + b.vy * cosR;
      b.vx = rvx; b.vy = rvy;

      // Nonlinear speed confinement
      [b.vx, b.vy] = confineSpeed(b.vx, b.vy);

      b.x = wrap(b.x + b.vx * dt, FRAME_COLS);
      b.y = wrap(b.y + b.vy * dt, FRAME_ROWS);
    }
  }

  function drawFrame(): Frame {
    const frame = createFrame();
    for (const b of boids) {
      // Banking: high |spin| = boid is in a banking maneuver, presenting a
      // narrower cross-section to the viewer. Skip rendering to produce the
      // dark wave that rolls through the flock as spin propagates.
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

    // Advance simulation by a fixed dt — used for thumbnail pre-warming.
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
