import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type ClockFace = 'tiny-stacked' | 'binary' | 'bars' | 'elegant' | 'stretch' | 'binary-audio';

export const CLOCK_FACES: { id: ClockFace; label: string }[] = [
  { id: 'tiny-stacked',  label: 'stacked' },
  { id: 'binary',        label: 'binary' },
  { id: 'binary-audio',  label: 'stack' },
  { id: 'bars',          label: 'bars' },
  { id: 'elegant',       label: 'elegant' },
  { id: 'stretch',       label: 'stretch' },
];

export type ClockCtx = { now: Date; bands?: number[]; fftSize?: number; gain?: number; side?: 'left' | 'right' };
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

type StretchGlyph = {
  readonly topRows: readonly number[];
  readonly middleRow: number;
  readonly bottomRow: number | null;
  readonly shortMid: number;
  readonly stretchedMid: number;
};

const STRETCH_GLYPHS: readonly StretchGlyph[] = [
  { topRows: [48],             middleRow: 40, bottomRow: 24, shortMid: 5, stretchedMid: 10 }, // 0
  { topRows: [24],             middleRow: 16, bottomRow: 56, shortMid: 5, stretchedMid: 10 }, // 1
  { topRows: [56, 0, 48],      middleRow:  8, bottomRow: 56, shortMid: 3, stretchedMid:  8 }, // 2
  { topRows: [56, 32, 16, 0],  middleRow: 32, bottomRow: 24, shortMid: 2, stretchedMid:  7 }, // 3
  { topRows: [8, 40, 56],      middleRow: 32, bottomRow: null, shortMid: 4, stretchedMid: 9 }, // 4
  { topRows: [56, 8, 56],      middleRow: 32, bottomRow: 24, shortMid: 3, stretchedMid:  8 }, // 5
  { topRows: [56, 8, 56],      middleRow: 40, bottomRow: 56, shortMid: 3, stretchedMid:  8 }, // 6
  { topRows: [56, 32, 16],     middleRow:  8, bottomRow: null, shortMid: 4, stretchedMid: 9 }, // 7
  { topRows: [48, 40, 16],     middleRow: 40, bottomRow: 24, shortMid: 3, stretchedMid:  8 }, // 8
  { topRows: [56, 40, 56],     middleRow: 32, bottomRow: null, shortMid: 4, stretchedMid: 9 }, // 9
] as const;

function stretch(): ClockRenderer {
  const ANIM_MS = 600;

  // Stateful: track real wall-clock time when each digit last changed.
  // Using Date.now() (not simulated `now`) so animation runs at real speed
  // regardless of fast-clock mode in the designer.
  let prevDigits: [number, number, number, number] | null = null;
  const changeWall: [number, number, number, number] = [0, 0, 0, 0];

  function animMid(t: number, shortMid: number, stretchedMid: number): number {
    if (t >= 1) return stretchedMid;
    if (t <= 0) return shortMid;
    return Math.round(shortMid + (stretchedMid - shortMid) * t);
  }

  function drawGlyph(frame: Frame, digit: number, colOff: number, rowStart: number, midCount: number): void {
    const g = STRETCH_GLYPHS[digit];
    if (!g) return;
    let r = rowStart;
    const paint = (mask: number) => {
      for (let c = 0; c < COLS; c++) {
        if ((mask >> c) & 1) {
          const fc = c + colOff;
          if (fc >= 0 && fc < COLS && r >= 0 && r < ROWS) frame[fc * ROWS + r] = 255;
        }
      }
      r++;
    };
    for (const mask of g.topRows) paint(mask);
    for (let m = 0; m < midCount; m++) paint(g.middleRow);
    if (g.bottomRow !== null) paint(g.bottomRow);
  }

  return ({ now }) => {
    const frame = createFrame();
    const wallMs = Date.now();
    const h = now.getHours();
    const m = now.getMinutes();
    const digits: [number, number, number, number] = [
      Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10,
    ];

    if (prevDigits === null) {
      // First render: treat all digits as already settled so nothing plays on load
      const settled = wallMs - ANIM_MS;
      for (let i = 0; i < 4; i++) changeWall[i] = settled;
    } else {
      for (let i = 0; i < 4; i++) {
        if (digits[i] !== prevDigits[i]) changeWall[i] = wallMs;
      }
    }
    prevDigits = digits;

    const ts = changeWall.map(ct => Math.min((wallMs - ct) / ANIM_MS, 1)) as [number, number, number, number];

    // Layout (34 rows total):
    //   row 0:      padding
    //   rows 1–14:  HH (14 rows stretched, extraMid=2)
    //   row 15:     gap
    //   row 16:     divider
    //   row 17:     gap
    //   rows 18–32: MM (15 rows stretched, extraMid=3)
    //   row 33:     padding
    frame[3 * ROWS + 16] = 255;
    frame[5 * ROWS + 16] = 255;

    const draw = (digit: number, t: number, colOff: number, rowStart: number, extraMid: number) => {
      const g = STRETCH_GLYPHS[digit];
      if (g) drawGlyph(frame, digit, colOff, rowStart, animMid(t, g.shortMid, g.stretchedMid + extraMid));
    };

    draw(digits[0], ts[0], -2, 1, 2);
    draw(digits[1], ts[1],  2, 1, 2);
    draw(digits[2], ts[2], -2, 18, 3);
    draw(digits[3], ts[3],  2, 18, 3);

    return frame;
  };
}

function binaryAudio(): ClockRenderer {
  const BW = 3, BH = 4;
  const N_BH = 3;             // 9 / BW
  const N_BV = 8;             // (ROWS - 2) / BH — 1 row padding top + bottom
  const BANDS_PER_COL = 3;
  const brightness = new Float32Array(N_BH * N_BV);

  function bandLevel(mag: number, gain: number, ref: number): number {
    const MIN_DB = -60;
    const m = mag * gain;
    const db = m > 0 ? 20 * Math.log10(m / ref) : MIN_DB;
    return Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB));
  }

  return ({ now, bands, fftSize = 2048, gain = 1.0, side = 'left' }) => {
    const ts = Math.floor(now.getTime() / 1000);
    const frame = createFrame();

    const colEnergy = new Float32Array(N_BH);
    if (bands && bands.length > 0) {
      const ref = fftSize / 2;
      for (let bh = 0; bh < N_BH; bh++) {
        let e = 0;
        for (let b = bh * BANDS_PER_COL; b < (bh + 1) * BANDS_PER_COL; b++) {
          e += bandLevel(bands[b] ?? 0, gain, ref);
        }
        colEnergy[bh] = e / BANDS_PER_COL;
      }
    } else {
      const t = Date.now() / 1000;
      for (let bh = 0; bh < N_BH; bh++) {
        colEnergy[bh] = 0.45 + 0.4 * Math.sin(t * (0.9 + bh * 0.5) + bh * 1.2);
      }
    }

    for (let bh = 0; bh < N_BH; bh++) {
      const e = colEnergy[bh] ?? 0;
      for (let bv = 0; bv < N_BV; bv++) {
        const bitIdx = bh * N_BV + (N_BV - 1 - bv);
        const bit = (ts >>> bitIdx) & 1;
        const idx = bh * N_BV + bv;
        if (bit) {
          const target = 0.35 + e * 0.65;
          brightness[idx] = (brightness[idx] ?? 0) * 0.35 + target * 0.65;
        } else {
          brightness[idx] = (brightness[idx] ?? 0) * 0.55;
        }
        const level = brightness[idx] ?? 0;
        if (level > 0.015) {
          // mirror column order on right module so LSBs stay on the outside
          const pixelBh = side === 'right' ? (N_BH - 1 - bh) : bh;
          for (let c = pixelBh * BW; c < (pixelBh + 1) * BW; c++) {
            for (let r = 1 + bv * BH; r < 1 + (bv + 1) * BH; r++) {
              frame[c * ROWS + r] = Math.min(255, Math.round(level * 255));
            }
          }
        }
      }
    }

    return frame;
  };
}

const FACTORIES: Record<ClockFace, () => ClockRenderer> = {
  'tiny-stacked':  tinyStacked,
  'binary':        binary,
  'binary-audio':  binaryAudio,
  'bars':          bars,
  'elegant':       elegant,
  'stretch':       stretch,
};

export function createClockRenderer(face: ClockFace): ClockRenderer {
  return FACTORIES[face]();
}

export function isClockFace(s: string): s is ClockFace {
  return Object.prototype.hasOwnProperty.call(FACTORIES, s);
}
