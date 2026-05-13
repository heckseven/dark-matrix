import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type ClockFace = 'tiny-stacked' | 'binary' | 'bars' | 'elegant';

export const CLOCK_FACES: { id: ClockFace; label: string }[] = [
  { id: 'tiny-stacked', label: 'stacked' },
  { id: 'binary',       label: 'binary' },
  { id: 'bars',         label: 'bars' },
  { id: 'elegant',      label: 'elegant' },
];

export type ClockCtx = { now: Date };
export type ClockRenderer = (ctx: ClockCtx) => Frame;

const COLS = 9;
const ROWS = 34;

const DIGITS: readonly number[][] = [
  [3,5,5,5,6], // 0
  [2,6,2,2,7], // 1
  [6,1,2,4,7], // 2
  [6,1,3,1,6], // 3
  [5,5,7,1,1], // 4
  [7,4,6,1,6], // 5
  [3,4,6,5,2], // 6
  [7,1,2,2,2], // 7
  [2,5,2,5,2], // 8
  [2,5,3,1,6], // 9
];

function drawDigit(frame: Frame, digit: number, startCol: number, startRow: number): void {
  const glyphRows = DIGITS[digit];
  if (!glyphRows) return;
  for (let r = 0; r < 5; r++) {
    const bits = glyphRows[r] ?? 0;
    for (let c = 0; c < 3; c++) {
      if (bits & (1 << (2 - c))) {
        const fc = startCol + c;
        const fr = startRow + r;
        if (fc >= 0 && fc < COLS && fr >= 0 && fr < ROWS)
          frame[fc * ROWS + fr] = 255;
      }
    }
  }
}

function tinyStacked(): ClockRenderer {
  return ({ now }) => {
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const frame = createFrame();
    drawDigit(frame, Math.floor(h / 10), 1, 3);
    drawDigit(frame, h % 10, 5, 3);
    frame[4 * ROWS + 9]  = 255;
    frame[4 * ROWS + 11] = 255;
    drawDigit(frame, Math.floor(m / 10), 1, 13);
    drawDigit(frame, m % 10, 5, 13);
    frame[4 * ROWS + 19] = 255;
    frame[4 * ROWS + 21] = 255;
    drawDigit(frame, Math.floor(s / 10), 1, 23);
    drawDigit(frame, s % 10, 5, 23);
    return frame;
  };
}

function binary(): ClockRenderer {
  return ({ now }) => {
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const frame = createFrame();
    for (let b = 0; b < 5; b++) {
      if (h & (1 << (4 - b))) frame[(b + 2) * ROWS + 8]  = 255;
    }
    for (let b = 0; b < 6; b++) {
      if (m & (1 << (5 - b))) frame[(b + 2) * ROWS + 17] = 255;
    }
    for (let b = 0; b < 6; b++) {
      if (s & (1 << (5 - b))) frame[(b + 2) * ROWS + 26] = 255;
    }
    return frame;
  };
}

function bars(): ClockRenderer {
  return ({ now }) => {
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const frame = createFrame();
    const hHeight = Math.round((h / 24) * ROWS);
    const mHeight = Math.round((m / 60) * ROWS);
    const sHeight = Math.round((s / 60) * ROWS);
    for (let c = 0; c <= 1; c++)
      for (let r = ROWS - hHeight; r < ROWS; r++)
        frame[c * ROWS + r] = 255;
    for (let c = 3; c <= 5; c++)
      for (let r = ROWS - mHeight; r < ROWS; r++)
        frame[c * ROWS + r] = 255;
    for (let c = 7; c <= 8; c++)
      for (let r = ROWS - sHeight; r < ROWS; r++)
        frame[c * ROWS + r] = 255;
    return frame;
  };
}

// Pixel bitmasks for the elegant font (9 cols wide, cols 0-8, 5 rows tall).
// Each number is a column bitmask: bit c = 1 → pixel at column c is set.
const ELEGANT_DIGITS: readonly number[][] = [
  [56, 68, 68, 68, 56], // 0
  [16, 24, 16, 16, 16], // 1
  [60, 64, 120,  4, 116], // 2
  [60, 64,  48, 64,  92], // 3
  [32, 56, 108, 32,  32], // 4
  [124, 0, 124, 64,  60], // 5
  [56,  4,  60, 68,  56], // 6
  [92, 64, 112,  8,   8], // 7
  [56, 68,  56, 68,  56], // 8
  [56, 68, 120, 64,  64], // 9
];

function drawElegantDigit(frame: Frame, digit: number, startRow: number): void {
  const glyphRows = ELEGANT_DIGITS[digit];
  if (!glyphRows) return;
  for (let r = 0; r < 5; r++) {
    const bits = glyphRows[r] ?? 0;
    for (let c = 0; c < COLS; c++) {
      if ((bits >> c) & 1) frame[c * ROWS + startRow + r] = 255;
    }
  }
}

function elegant(): ClockRenderer {
  return ({ now }) => {
    const h = now.getHours();
    const m = now.getMinutes();
    const frame = createFrame();
    drawElegantDigit(frame, Math.floor(h / 10), 2);
    drawElegantDigit(frame, h % 10, 9);
    frame[3 * ROWS + 16] = 255;
    frame[5 * ROWS + 16] = 255;
    drawElegantDigit(frame, Math.floor(m / 10), 19);
    drawElegantDigit(frame, m % 10, 26);
    return frame;
  };
}

const FACTORIES: Record<ClockFace, () => ClockRenderer> = {
  'tiny-stacked': tinyStacked,
  'binary':       binary,
  'bars':         bars,
  'elegant':      elegant,
};

export function createClockRenderer(face: ClockFace): ClockRenderer {
  return FACTORIES[face]();
}

export function isClockFace(s: string): s is ClockFace {
  return Object.prototype.hasOwnProperty.call(FACTORIES, s);
}
