import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenSpiroStyle = 'spiro-1' | 'spiro-2' | 'spiro-3';

const CENTER_ROW = 17;

/** Clamp a value to [0, 255] and round */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Plot a point into a Float32Array buffer with soft anti-aliased falloff.
 * Uses exp(-dist²/0.5) weighting within a 1px radius.
 */
function plotSoftBuf(
  buf: Float32Array,
  cx: number,
  cy: number,
  brightness: number,
  totalCols: number,
  colOffset: number,
): void {
  const frameCol = cx - colOffset;
  const fc = Math.round(frameCol);
  const fr = Math.round(cy);
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const nc = fc + dc;
      const nr = fr + dr;
      if (nc < 0 || nc >= FRAME_COLS || nr < 0 || nr >= FRAME_ROWS) continue;
      const distSq = (frameCol - nc) * (frameCol - nc) + (cy - nr) * (cy - nr);
      const weight = Math.exp(-distSq / 0.5);
      const idx = nc * FRAME_ROWS + nr;
      buf[idx] = Math.min(255, (buf[idx] ?? 0) + brightness * weight);
    }
  }
}

/** Convert a float brightness buffer to a Frame */
function bufToFrame(buf: Float32Array): Frame {
  const f = createFrame();
  for (let i = 0; i < FRAME_COLS * FRAME_ROWS; i++) {
    f[i] = clamp255(buf[i] ?? 0);
  }
  return f;
}

// ---------------------------------------------------------------------------
// spiro-1: Five-petal rose (hypotrochoid R=6, r=1, d=5)
// x(t) = 5*cos(t) + 5*cos(5t)
// y(t) = 5*sin(t) - 5*sin(5t)
// Period: 2π — draws itself over 12s, then rotates, resets every 60s
// ---------------------------------------------------------------------------
function createSpiro1(side?: 'left' | 'right'): ZenRendererApi {
  let stopped = false;
  const startTime = Date.now();

  const totalCols = side !== undefined ? FRAME_COLS * 2 : FRAME_COLS;
  const colOffset = side === 'right' ? FRAME_COLS : 0;
  const centerCol = (totalCols - 1) / 2;

  const xScale = 3.5;
  const yScale = xScale * 2.3;

  const DRAW_MS = 12_000;  // draw phase: 12s
  const CYCLE_MS = 60_000; // full cycle: 60s before reset

  const buf = new Float32Array(FRAME_COLS * FRAME_ROWS);
  const DECAY = 0.985;

  // Points per full revolution (2π)
  const TOTAL_STEPS = 360;

  let lastT = 0; // last t value plotted (0..2π)
  let globalRotation = 0;
  let drawingDone = false;
  let lastFrameTime = startTime;

  function spiroXY(t: number, rot: number): [number, number] {
    const x = 5 * Math.cos(t) + 5 * Math.cos(5 * t);
    const y = 5 * Math.sin(t) - 5 * Math.sin(5 * t);
    // Apply global rotation
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return [
      centerCol + rx * xScale,
      CENTER_ROW + ry * yScale,
    ];
  }

  return {
    render(): Frame {
      if (stopped) return createFrame();

      const now = Date.now();
      const dt = (now - lastFrameTime) / 1000; // seconds since last frame
      lastFrameTime = now;

      const elapsed = now - startTime;
      const cycleElapsed = elapsed % CYCLE_MS;

      // Reset at start of each cycle
      if (cycleElapsed < 50 && elapsed > CYCLE_MS / 2) {
        buf.fill(0);
        lastT = 0;
        drawingDone = false;
        globalRotation = 0;
      }

      // Decay the buffer each frame
      for (let i = 0; i < buf.length; i++) {
        buf[i] = (buf[i] ?? 0) * DECAY;
      }

      if (!drawingDone) {
        // Drawing phase: advance t proportionally over 12s
        const drawFraction = Math.min(cycleElapsed / DRAW_MS, 1.0);
        const targetT = drawFraction * Math.PI * 2;

        // Plot steps from lastT to targetT
        const stepsNeeded = Math.max(1, Math.round((targetT - lastT) / (Math.PI * 2) * TOTAL_STEPS));
        for (let s = 0; s < stepsNeeded; s++) {
          const t = lastT + (s / stepsNeeded) * (targetT - lastT);
          const [cx, cy] = spiroXY(t, globalRotation);
          plotSoftBuf(buf, cx, cy, 255, totalCols, colOffset);
        }
        lastT = targetT;

        if (drawFraction >= 1.0) {
          drawingDone = true;
        }
      } else {
        // Rotation phase: rotate at 0.04 rad/s, regenerate curve each frame
        globalRotation += 0.04 * dt;

        // Replot the full curve at moderate brightness to keep it visible
        for (let s = 0; s <= TOTAL_STEPS; s++) {
          const t = (s / TOTAL_STEPS) * Math.PI * 2;
          const [cx, cy] = spiroXY(t, globalRotation);
          plotSoftBuf(buf, cx, cy, 80, totalCols, colOffset);
        }
      }

      // Draw bright leading dot at current t position
      const [lcx, lcy] = spiroXY(lastT >= Math.PI * 2 ? Math.PI * 2 : lastT, globalRotation);
      plotSoftBuf(buf, lcx, lcy, 255, totalCols, colOffset);

      return bufToFrame(buf);
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// spiro-2: Three-loop clover (hypotrochoid R=4, r=1, d=3.5)
// x(t) = 3*cos(t) + d*cos(3t)
// y(t) = 3*sin(t) - d*sin(3t)
// Period: 2π — always fully drawn, rotates at 0.08 rad/s, petals pulse
// ---------------------------------------------------------------------------
function createSpiro2(side?: 'left' | 'right'): ZenRendererApi {
  let stopped = false;
  const startTime = Date.now();

  const totalCols = side !== undefined ? FRAME_COLS * 2 : FRAME_COLS;
  const colOffset = side === 'right' ? FRAME_COLS : 0;
  const centerCol = (totalCols - 1) / 2;

  const xScale = 3.0;
  const yScale = 7.0;

  const STEPS = 200;
  let globalRotation = 0;
  let lastFrameTime = startTime;

  const buf = new Float32Array(FRAME_COLS * FRAME_ROWS);

  function getD(tWall: number): number {
    return 3.5 + 1.0 * Math.sin(tWall * 0.3);
  }

  function plotCurve(rot: number, d: number): void {
    for (let s = 0; s <= STEPS; s++) {
      const t = (s / STEPS) * Math.PI * 2;
      const x = 3 * Math.cos(t) + d * Math.cos(3 * t);
      const y = 3 * Math.sin(t) - d * Math.sin(3 * t);
      // Apply rotation
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      const cx = centerCol + rx * xScale;
      const cy = CENTER_ROW + ry * yScale;
      plotSoftBuf(buf, cx, cy, 255, totalCols, colOffset);
    }
  }

  // Initialize buffer with full curve
  plotCurve(0, 3.5);

  return {
    render(): Frame {
      if (stopped) return createFrame();

      const now = Date.now();
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      const tWall = (now - startTime) / 1000;

      globalRotation += 0.08 * dt;

      const d = getD(tWall);

      // Clear buffer and regenerate curve each frame (pulsing d requires recalc)
      buf.fill(0);
      plotCurve(globalRotation, d);

      return bufToFrame(buf);
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// spiro-3: Five-fold star/flower (epitrochoid R=5, r=3, d=3)
// x(t) = 8*cos(t) - 3*cos(8/3 * t)
// y(t) = 8*sin(t) - 3*sin(8/3 * t)
// Period: 6π — draws over 20s, holds 5s, fades 3s, redraws; rotates at 0.03 rad/s
// ---------------------------------------------------------------------------
function createSpiro3(side?: 'left' | 'right'): ZenRendererApi {
  let stopped = false;
  const startTime = Date.now();

  const totalCols = side !== undefined ? FRAME_COLS * 2 : FRAME_COLS;
  const colOffset = side === 'right' ? FRAME_COLS : 0;
  const centerCol = (totalCols - 1) / 2;

  const xScale = 3.8;
  const yScale = 9.0;

  const DRAW_MS = 20_000;  // draw phase
  const HOLD_MS = 5_000;   // hold phase
  const FADE_MS = 3_000;   // fade phase
  const CYCLE_MS = DRAW_MS + HOLD_MS + FADE_MS; // 28s total

  const FULL_PERIOD = Math.PI * 6; // 6π
  const TOTAL_STEPS = 600; // steps for full period

  const buf = new Float32Array(FRAME_COLS * FRAME_ROWS);
  const DECAY_DRAW = 0.985;

  let globalRotation = 0;
  let lastT = 0;
  let lastFrameTime = startTime;
  let lastCyclePhase = -1;

  function spiroXY(t: number, rot: number): [number, number] {
    const x = 8 * Math.cos(t) - 3 * Math.cos((8 / 3) * t);
    const y = 8 * Math.sin(t) - 3 * Math.sin((8 / 3) * t);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return [
      centerCol + rx * xScale,
      CENTER_ROW + ry * yScale,
    ];
  }

  return {
    render(): Frame {
      if (stopped) return createFrame();

      const now = Date.now();
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      const cycleElapsed = (now - startTime) % CYCLE_MS;

      // Determine phase: 0=draw, 1=hold, 2=fade
      let phase: number;
      let phaseT: number;
      if (cycleElapsed < DRAW_MS) {
        phase = 0;
        phaseT = cycleElapsed / DRAW_MS;
      } else if (cycleElapsed < DRAW_MS + HOLD_MS) {
        phase = 1;
        phaseT = (cycleElapsed - DRAW_MS) / HOLD_MS;
      } else {
        phase = 2;
        phaseT = (cycleElapsed - DRAW_MS - HOLD_MS) / FADE_MS;
      }

      // Reset at start of draw phase
      if (phase === 0 && lastCyclePhase !== 0) {
        buf.fill(0);
        lastT = 0;
      }
      lastCyclePhase = phase;

      globalRotation += 0.03 * dt;

      if (phase === 0) {
        // Drawing: advance t, decay buffer, plot new points
        const targetT = phaseT * FULL_PERIOD;

        // Decay
        for (let i = 0; i < buf.length; i++) {
          buf[i] = (buf[i] ?? 0) * DECAY_DRAW;
        }

        // Plot new points from lastT to targetT
        const stepsNeeded = Math.max(1, Math.round((targetT - lastT) / FULL_PERIOD * TOTAL_STEPS));
        for (let s = 0; s < stepsNeeded; s++) {
          const t = lastT + (s / stepsNeeded) * (targetT - lastT);
          const [cx, cy] = spiroXY(t, globalRotation);
          plotSoftBuf(buf, cx, cy, 255, totalCols, colOffset);
        }
        lastT = targetT;

        // Leading dot
        if (lastT > 0) {
          const [lcx, lcy] = spiroXY(lastT, globalRotation);
          plotSoftBuf(buf, lcx, lcy, 255, totalCols, colOffset);
        }
      } else if (phase === 1) {
        // Hold: maintain buffer with slow decay, keep redrawing at lower brightness
        for (let i = 0; i < buf.length; i++) {
          buf[i] = (buf[i] ?? 0) * DECAY_DRAW;
        }
        // Redraw fully to maintain brightness during hold
        for (let s = 0; s <= TOTAL_STEPS; s++) {
          const t = (s / TOTAL_STEPS) * FULL_PERIOD;
          const [cx, cy] = spiroXY(t, globalRotation);
          plotSoftBuf(buf, cx, cy, 60, totalCols, colOffset);
        }
      } else {
        // Fade: just decay fast
        const fadeFactor = Math.pow(0.85, dt * 30);
        for (let i = 0; i < buf.length; i++) {
          buf[i] = (buf[i] ?? 0) * fadeFactor;
        }
      }

      return bufToFrame(buf);
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------
export function createZenSpiroRenderer(style: ZenSpiroStyle, side?: 'left' | 'right'): ZenRendererApi {
  switch (style) {
    case 'spiro-1': return createSpiro1(side);
    case 'spiro-2': return createSpiro2(side);
    case 'spiro-3': return createSpiro3(side);
  }
}
