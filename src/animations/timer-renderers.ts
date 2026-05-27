import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import { ELEGANT_DIGITS, drawElegantDigit } from './clock-renderers.js';

export { ELEGANT_DIGITS, drawElegantDigit };

const COLS = FRAME_COLS;
const ROWS = FRAME_ROWS;

// ── Orbit paths ────────────────────────────────────────────────────────────
// Clockwise from top-left corner.

// Outer perimeter: 9+33+8+32 = 82 positions
export const OUTER_PATH: ReadonlyArray<readonly [number, number]> = (() => {
  const p: [number, number][] = [];
  for (let c = 0; c < COLS; c++) p.push([c, 0]);
  for (let r = 1; r < ROWS; r++) p.push([COLS - 1, r]);
  for (let c = COLS - 2; c >= 0; c--) p.push([c, ROWS - 1]);
  for (let r = ROWS - 2; r >= 1; r--) p.push([0, r]);
  return p;
})();

// Inner perimeter (1px inset): 7+31+6+30 = 74 positions
export const INNER_PATH: ReadonlyArray<readonly [number, number]> = (() => {
  const p: [number, number][] = [];
  for (let c = 1; c < COLS - 1; c++) p.push([c, 1]);
  for (let r = 2; r < ROWS - 1; r++) p.push([COLS - 2, r]);
  for (let c = COLS - 3; c >= 1; c--) p.push([c, ROWS - 2]);
  for (let r = ROWS - 3; r >= 2; r--) p.push([1, r]);
  return p;
})();

// ── Elegant timer renderer ─────────────────────────────────────────────────
// Stateless. Auto-selects display mode by remaining time:
//   ≥ 1h  → HH:MM  + two outer dots (ms-dot fast, seconds-dot slow)
//   ≥ 1m  → MM:SS  + outer ms-dot
//   < 1m  → SS.CC  (centiseconds — no orbit dots)

export type ElegantTimerMode = 'hh:mm' | 'mm:ss' | 'ss.cc';

export function getElegantTimerMode(remainingMs: number): ElegantTimerMode {
  if (remainingMs >= 3_600_000) return 'hh:mm';
  if (remainingMs >= 60_000) return 'mm:ss';
  return 'ss.cc';
}

export function renderElegantTimer(remainingMs: number): Frame {
  const frame = createFrame();
  const rem = Math.max(0, remainingMs);
  const mode = getElegantTimerMode(rem);

  const totalSec = Math.floor(rem / 1000);
  const ms = rem % 1000;
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);

  let A: number, B: number;
  if (mode === 'hh:mm') { A = hr;  B = min; }
  else if (mode === 'mm:ss') { A = min; B = sec; }
  else { A = sec; B = Math.floor(ms / 10); } // centiseconds

  // Digits — same layout as elegant clock
  drawElegantDigit(frame, Math.floor(A / 10), 2);
  drawElegantDigit(frame, A % 10, 9);
  frame[3 * ROWS + 16] = 255; // divider (two-pixel style from elegant clock)
  frame[5 * ROWS + 16] = 255;
  drawElegantDigit(frame, Math.floor(B / 10), 19);
  drawElegantDigit(frame, B % 10, 26);

  if (mode !== 'ss.cc') {
    // Outer orbit: ms sweeps one full lap per second
    const outerPos = Math.floor((1 - ms / 1000) * OUTER_PATH.length) % OUTER_PATH.length;
    const op = OUTER_PATH[outerPos]!;
    frame[op[0] * ROWS + op[1]] = 255;
  }

  if (mode === 'hh:mm') {
    // Second outer dot: seconds sweeps one full lap per minute
    const msInMin = sec * 1000 + ms;
    const secPos = Math.floor((1 - msInMin / 60_000) * OUTER_PATH.length) % OUTER_PATH.length;
    const sp = OUTER_PATH[secPos]!;
    frame[sp[0] * ROWS + sp[1]] = 255;
  }

  return frame;
}

// ── Elegant timer renderer (stateful) ─────────────────────────────────────
// Plays ELEGANT_FLASH_COUNT half-periods on expiry at ELEGANT_FLASH_INTERVAL_MS
// each, then holds at the zero display. Uses wall-clock time so the interval is
// accurate regardless of the animation frame rate.
// Call render() with remainingMs > 0 after expiry to signal a repeat restart.

export const ELEGANT_FLASH_COUNT       = 14; // total half-periods (7 on/off cycles)
export const ELEGANT_FLASH_INTERVAL_MS = 70; // ms per half-period → 980ms total

export interface ElegantTimerRenderer {
  render(remainingMs: number): Frame;
  stop(): void;
}

export function createElegantTimerRenderer(): ElegantTimerRenderer {
  let expiredAtMs = -1;
  let wasExpired  = false;

  return {
    render(remainingMs: number): Frame {
      const expired = remainingMs <= 0;

      if (!expired) {
        if (wasExpired) { expiredAtMs = -1; wasExpired = false; }
        return renderElegantTimer(remainingMs);
      }

      wasExpired = true;
      const nowMs = Date.now();
      if (expiredAtMs < 0) expiredAtMs = nowMs;

      const halfPeriod = Math.floor((nowMs - expiredAtMs) / ELEGANT_FLASH_INTERVAL_MS);

      if (halfPeriod < ELEGANT_FLASH_COUNT && halfPeriod % 2 === 0) {
        const base = renderElegantTimer(0);
        const out  = createFrame();
        for (let i = 0; i < base.length; i++) out[i] = base[i]! > 0 ? 0 : 255;
        return out;
      }

      return renderElegantTimer(0);
    },
    stop() { /* no resources */ },
  };
}

// ── Hourglass timer renderer ───────────────────────────────────────────────
// The hourglass pixel maps are sourced from the existing design at:
//   src/deck/web/components/ClaudeWidgets.stories.tsx
// boundary = glass outline; start = top full; full = bottom full.

const HG_BOUNDARY = '////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////////////8AAAAAAAAAAAAAAAAAAP//////////////////////////////AAAAAAAAAAD/////////////////////////////////////AAAAAP////////////////////////////////////////////////////////////////////////////////////8AAAAA/////////////////////////////////////wAAAAAAAAAA//////////////////////////////8AAAAAAAAAAAAAAAAAAP////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////';
const HG_START    = '////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAA////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAP//////////////////////AAAAAAAAAAAAAAAAAAAAAAD///////////////////8AAAAAAAAAAAAAAAAAAAAAAAAA/////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HG_FULL     = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////////////AAAAAAAAAAAAAAAAAAAAAAAAAP///////////////////wAAAAAAAAAAAAAAAAAAAAAA//////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAA////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAA/////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////';
const HG_COL_ORDER = [4, 3, 5, 2, 6, 1, 7, 0, 8] as const;

function buildHgCells(pixels: string, rowFrom: number, rowTo: number): ReadonlyArray<readonly [number, number]> {
  const buf = Uint8Array.from(atob(pixels), c => c.charCodeAt(0));
  const cells: [number, number][] = [];
  const step = rowFrom <= rowTo ? 1 : -1;
  for (let row = rowFrom; row !== rowTo + step; row += step) {
    for (const col of HG_COL_ORDER) {
      if ((buf[col * ROWS + row] ?? 0) > 0) cells.push([col, row]);
    }
  }
  return cells;
}

// top → neck (drain order = neck drains first), bottom → neck (fill from bottom up)
const HG_TOP_CELLS    = buildHgCells(HG_START, 16, 0);
const HG_BOTTOM_CELLS = buildHgCells(HG_FULL,  33, 17);
const HG_BOUNDARY_BUF = Uint8Array.from(atob(HG_BOUNDARY), c => c.charCodeAt(0));

// Post-spin drain order: (col=4, row=17) is the center of the top row of the bottom half.
// Cells nearest that origin drain first, creating a center-out reveal.
const HG_BOTTOM_DRAIN_ORDER: ReadonlyArray<readonly [number, number]> =
  [...HG_BOTTOM_CELLS].sort(([c1, r1], [c2, r2]) =>
    ((c1 - 4) ** 2 + (r1 - 17) ** 2) - ((c2 - 4) ** 2 + (r2 - 17) ** 2),
  );

export function renderHourglassFrame(fraction: number): Frame {
  const f = Math.max(0, Math.min(1, fraction));
  const frame = createFrame();

  // Drain top, fill bottom proportionally
  const elapsed = Math.round(f * HG_TOP_CELLS.length);
  for (let i = elapsed; i < HG_TOP_CELLS.length; i++) {
    const [c, r] = HG_TOP_CELLS[i]!;
    frame[c * ROWS + r] = 255;
  }
  for (let i = 0; i < elapsed && i < HG_BOTTOM_CELLS.length; i++) {
    const [c, r] = HG_BOTTOM_CELLS[i]!;
    frame[c * ROWS + r] = 255;
  }
  return frame;
}

// Re-export for stories that previously inlined these
export { HG_BOUNDARY, HG_START, HG_FULL, HG_TOP_CELLS, HG_BOTTOM_CELLS, HG_BOTTOM_DRAIN_ORDER };

// True 180° clockwise rotation around the display centre (Z-axis).
// 12 steps of 15° each = 1.2 s at 100 ms/frame.
// Pixels that rotate off the 9×34 bounds are clipped.
// Inverse mapping: for each destination pixel, find where it came from in the
// source — avoids gaps without any forward-mapping aliasing.
export const HOURGLASS_ROTATION_STEPS = 12;
export const HOURGLASS_DRAIN_STEPS    = 12; // frames to empty the bottom half after spin

const CX = 4;       // column centre
const CY = 16.5;    // row centre (between rows 16 and 17)

export function renderHourglassSpinning(step: number): Frame {
  const frame = createFrame();
  const angle = ((step + 1) / HOURGLASS_ROTATION_STEPS) * Math.PI; // 15°…180°
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const dc = col - CX;
      const dr = row - CY;
      // Inverse of clockwise rotation by angle = counterclockwise by angle
      const srcCol = Math.round(CX + dc * cosA + dr * sinA);
      const srcRow = Math.round(CY - dc * sinA + dr * cosA);
      if (srcCol >= 0 && srcCol < COLS && srcRow >= 0 && srcRow < ROWS &&
          (HG_BOUNDARY_BUF[srcCol * ROWS + srcRow] ?? 0) > 0) {
        frame[col * ROWS + row] = 255;
      }
    }
  }
  return frame;
}

// Post-spin: top half stays full, bottom half empties center-outward over HOURGLASS_DRAIN_STEPS.
export function renderHourglassDraining(drainStep: number): Frame {
  const frame = createFrame();
  for (const [c, r] of HG_TOP_CELLS) {
    frame[c * ROWS + r] = 255;
  }
  const drained = Math.round((drainStep + 1) / HOURGLASS_DRAIN_STEPS * HG_BOTTOM_DRAIN_ORDER.length);
  for (let i = drained; i < HG_BOTTOM_DRAIN_ORDER.length; i++) {
    const [c, r] = HG_BOTTOM_DRAIN_ORDER[i]!;
    frame[c * ROWS + r] = 255;
  }
  return frame;
}

const FLASH_HALF_PERIOD = 1; // frames (at 100ms/frame → 100ms per flash phase)
const FLASH_CYCLES = 14;     // total half-periods = 7 full flashes (ends OFF)
const FLASH_TOTAL = FLASH_CYCLES * FLASH_HALF_PERIOD;
const FLASH_PAUSE = 10;      // frames held lit after last flash before rotation (1 s)

export interface HourglassTimerRenderer {
  render(remainingMs: number, totalMs: number): Frame;
  stop(): void;
}

export function createHourglassTimerRenderer(): HourglassTimerRenderer {
  const TOTAL_GRAINS = HG_TOP_CELLS.length;
  let flashFrame = 0;
  let rotationFrame = -1;
  let drainFrame = -1;
  let wasExpired = false;

  function makeSettled(fraction: number): Uint8Array {
    const s = new Uint8Array(COLS * ROWS);
    const topCount = Math.round(fraction * TOTAL_GRAINS);
    for (let i = TOTAL_GRAINS - topCount; i < TOTAL_GRAINS; i++) {
      const [c, r] = HG_TOP_CELLS[i]!;
      s[c * ROWS + r] = 1;
    }
    const bottomCount = TOTAL_GRAINS - topCount;
    for (let i = 0; i < bottomCount && i < HG_BOTTOM_CELLS.length; i++) {
      const [c, r] = HG_BOTTOM_CELLS[i]!;
      s[c * ROWS + r] = 1;
    }
    return s;
  }

  let settled = makeSettled(1);

  function inBounds(c: number, r: number): boolean {
    return c >= 0 && c < COLS && r >= 0 && r < ROWS &&
      (HG_BOUNDARY_BUF[c * ROWS + r] ?? 0) > 0;
  }

  function physicsTick(): boolean {
    const next = new Uint8Array(COLS * ROWS);
    let anyMoved = false;
    for (let row = ROWS - 1; row >= 0; row--) {
      for (const col of HG_COL_ORDER) {
        const idx = col * ROWS + row;
        if (!settled[idx]) continue;
        const nr = row + 1;
        if (nr >= ROWS) { next[idx] = 1; continue; }
        if (inBounds(col, nr) && !settled[col * ROWS + nr] && !next[col * ROWS + nr]) {
          next[col * ROWS + nr] = 1; anyMoved = true; continue;
        }
        const dirs = Math.random() < 0.5 ? ([-1, 1] as const) : ([1, -1] as const);
        let fell = false;
        for (const d of dirs) {
          const nc = col + d;
          const ni = nc * ROWS + nr;
          if (inBounds(nc, nr) && !settled[ni] && !next[ni]) {
            next[ni] = 1; anyMoved = true; fell = true; break;
          }
        }
        if (!fell) next[idx] = 1;
      }
    }
    settled = next;
    return anyMoved;
  }

  return {
    render(remainingMs: number, totalMs: number): Frame {
      const expired = remainingMs <= 0;

      if (!expired) {
        if (wasExpired) {
          // Repeat timer restarted — reset physics to full top.
          settled = makeSettled(1);
          wasExpired = false;
        }
        flashFrame = 0;
        rotationFrame = -1;
        drainFrame = -1;
        const fraction = totalMs > 0 ? remainingMs / totalMs : 1;

        if (!physicsTick()) {
          settled = makeSettled(fraction);
          physicsTick();
        }

        const frame = createFrame();
        for (let i = 0; i < COLS * ROWS; i++) {
          if (settled[i]) frame[i] = 255;
        }
        return frame;
      }

      wasExpired = true;
      flashFrame++;

      if (flashFrame <= FLASH_TOTAL) {
        const flashOn = Math.floor((flashFrame - 1) / FLASH_HALF_PERIOD) % 2 === 0;
        return flashOn ? renderHourglassAllFilled() : renderHourglassBlack();
      }

      if (flashFrame <= FLASH_TOTAL + FLASH_PAUSE) {
        return renderHourglassAllFilled();
      }

      rotationFrame++;
      if (rotationFrame < HOURGLASS_ROTATION_STEPS) {
        return renderHourglassSpinning(rotationFrame);
      }

      // Drain bottom half center-outward, top stays full throughout.
      drainFrame++;
      if (drainFrame < HOURGLASS_DRAIN_STEPS) {
        return renderHourglassDraining(drainFrame);
      }

      // Drain complete — top full, bottom empty. Countdown can begin.
      return renderHourglassFrame(0);
    },
    stop() { /* no async resources to release */ },
  };
}

function renderHourglassAllFilled(): Frame {
  const frame = createFrame();
  for (let i = 0; i < COLS * ROWS; i++) {
    if ((HG_BOUNDARY_BUF[i] ?? 0) > 0) frame[i] = 255;
  }
  return frame;
}

function renderHourglassBlack(): Frame {
  return createFrame();
}
