import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

const NUM_BOIDS = 50;
const MAX_SPEED = 8.0;   // px/s
const MIN_SPEED = 2.0;   // px/s
const SEP_RADIUS = 2.5;  // px — push apart within this distance
const SEP_WEIGHT = 20;   // acceleration magnitude for separation
const ALIGN_RADIUS = 6.0; // px
const ALIGN_WEIGHT = 1.5; // factor applied to (avgV - currentV)
const COH_RADIUS = 9.0;  // px
const COH_WEIGHT = 30;   // acceleration magnitude for cohesion
const PRED_RADIUS = 7.0; // px
const PRED_WEIGHT = 55;  // strong flee acceleration
const PRED_DURATION_MS = 5000;
const PRED_SPEED = 2.5;  // px/s — predator drifts inward slowly

export type MurmurationRenderer = ZenRendererApi & {
  triggerPredator(): void;
  tick(dt: number): void;
};

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
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

function clampSpeed(vx: number, vy: number): [number, number] {
  const spd = Math.sqrt(vx * vx + vy * vy);
  if (spd === 0) {
    const a = Math.random() * Math.PI * 2;
    return [Math.cos(a) * MIN_SPEED, Math.sin(a) * MIN_SPEED];
  }
  if (spd > MAX_SPEED) return [(vx / spd) * MAX_SPEED, (vy / spd) * MAX_SPEED];
  if (spd < MIN_SPEED) return [(vx / spd) * MIN_SPEED, (vy / spd) * MIN_SPEED];
  return [vx, vy];
}

export function createZenMurmurationRenderer(
  _side?: 'left' | 'right',
): MurmurationRenderer {
  const boids: Boid[] = Array.from({ length: NUM_BOIDS }, () => {
    const spd = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * FRAME_COLS,
      y: Math.random() * FRAME_ROWS,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
    };
  });

  // lastTime tracks wall-clock for the render() path; 0.1s cap handles first-frame spike.
  let lastTime = Date.now();
  let stopped = false;
  let pred: Predator | null = null;

  function triggerPredator(): void {
    if (pred !== null) return; // one active at a time

    const edge = Math.floor(Math.random() * 4);
    let px: number, py: number;
    if (edge === 0)      { px = Math.random() * FRAME_COLS; py = -2; }
    else if (edge === 1) { px = Math.random() * FRAME_COLS; py = FRAME_ROWS + 2; }
    else if (edge === 2) { px = -2; py = Math.random() * FRAME_ROWS; }
    else                 { px = FRAME_COLS + 2; py = Math.random() * FRAME_ROWS; }

    const cx = FRAME_COLS / 2, cy = FRAME_ROWS / 2;
    const dx = cx - px, dy = cy - py;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    pred = { x: px, y: py, vx: (dx / dist) * PRED_SPEED, vy: (dy / dist) * PRED_SPEED, endMs: Date.now() + PRED_DURATION_MS };
  }

  function step(dt: number, now: number): void {
    if (pred !== null) {
      if (now >= pred.endMs) { pred = null; }
      else { pred.x += pred.vx * dt; pred.y += pred.vy * dt; }
    }

    for (const b of boids) {
      let sepX = 0, sepY = 0, sepN = 0;
      let alignVx = 0, alignVy = 0, alignN = 0;
      let cohDx = 0, cohDy = 0, cohN = 0;

      for (const o of boids) {
        if (o === b) continue;
        const dx = tDiff(b.x, o.x, FRAME_COLS);
        const dy = tDiff(b.y, o.y, FRAME_ROWS);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SEP_RADIUS && dist > 0) {
          // unit vector pointing away from neighbour
          sepX += dx / dist; sepY += dy / dist; sepN++;
        }
        if (dist < ALIGN_RADIUS) {
          alignVx += o.vx; alignVy += o.vy; alignN++;
        }
        if (dist < COH_RADIUS) {
          // direction from b toward o
          cohDx += -dx; cohDy += -dy; cohN++;
        }
      }

      let fx = 0, fy = 0;

      if (sepN > 0) {
        fx += (sepX / sepN) * SEP_WEIGHT;
        fy += (sepY / sepN) * SEP_WEIGHT;
      }
      if (alignN > 0) {
        fx += (alignVx / alignN - b.vx) * ALIGN_WEIGHT;
        fy += (alignVy / alignN - b.vy) * ALIGN_WEIGHT;
      }
      if (cohN > 0) {
        const cdx = cohDx / cohN, cdy = cohDy / cohN;
        const cm = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
        fx += (cdx / cm) * COH_WEIGHT;
        fy += (cdy / cm) * COH_WEIGHT;
      }

      if (pred !== null) {
        const pdx = tDiff(b.x, pred.x, FRAME_COLS);
        const pdy = tDiff(b.y, pred.y, FRAME_ROWS);
        const pd = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pd < PRED_RADIUS && pd > 0) {
          fx += (pdx / pd) * PRED_WEIGHT;
          fy += (pdy / pd) * PRED_WEIGHT;
        }
      }

      b.vx += fx * dt;
      b.vy += fy * dt;
      [b.vx, b.vy] = clampSpeed(b.vx, b.vy);

      b.x = wrap(b.x + b.vx * dt, FRAME_COLS);
      b.y = wrap(b.y + b.vy * dt, FRAME_ROWS);
    }
  }

  function drawFrame(): Frame {
    const frame = createFrame();
    for (const b of boids) {
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

    // Advance simulation by a fixed dt — used for thumbnail pre-warming without wall-clock.
    tick(dt: number): void {
      if (!stopped) {
        const now = Date.now();
        step(dt, now);
        lastTime = now;
      }
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
