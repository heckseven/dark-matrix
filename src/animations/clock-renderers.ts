import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type ClockFace = 'tiny-stacked' | 'binary' | 'bars';

export const CLOCK_FACES: { id: ClockFace; label: string }[] = [
  { id: 'tiny-stacked', label: 'stacked' },
  { id: 'binary',       label: 'binary' },
  { id: 'bars',         label: 'bars' },
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
    const frame = createFrame();
    drawDigit(frame, Math.floor(h / 10), 1, 5);
    drawDigit(frame, h % 10, 5, 5);
    frame[4 * ROWS + 15] = 255;
    frame[4 * ROWS + 17] = 255;
    drawDigit(frame, Math.floor(m / 10), 1, 21);
    drawDigit(frame, m % 10, 5, 21);
    return frame;
  };
}

function binary(): ClockRenderer {
  return ({ now }) => {
    const h = now.getHours();
    const m = now.getMinutes();
    const frame = createFrame();
    for (let b = 0; b < 5; b++) {
      if (h & (1 << (4 - b))) frame[(b + 2) * ROWS + 12] = 255;
    }
    for (let b = 0; b < 6; b++) {
      if (m & (1 << (5 - b))) frame[(b + 2) * ROWS + 22] = 255;
    }
    return frame;
  };
}

function bars(): ClockRenderer {
  return ({ now }) => {
    const h = now.getHours();
    const m = now.getMinutes();
    const frame = createFrame();
    const hHeight = Math.round((h / 24) * ROWS);
    const mHeight = Math.round((m / 60) * ROWS);
    for (let c = 1; c <= 3; c++)
      for (let r = ROWS - hHeight; r < ROWS; r++)
        frame[c * ROWS + r] = 255;
    for (let c = 5; c <= 7; c++)
      for (let r = ROWS - mHeight; r < ROWS; r++)
        frame[c * ROWS + r] = 255;
    return frame;
  };
}

const FACTORIES: Record<ClockFace, () => ClockRenderer> = {
  'tiny-stacked': tinyStacked,
  'binary':       binary,
  'bars':         bars,
};

export function createClockRenderer(face: ClockFace): ClockRenderer {
  return FACTORIES[face]();
}

export function isClockFace(s: string): s is ClockFace {
  return Object.prototype.hasOwnProperty.call(FACTORIES, s);
}
