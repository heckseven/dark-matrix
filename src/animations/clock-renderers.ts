import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type ClockFace = 'elegant' | 'stretch' | 'binary-audio' | 'analogue' | 'binary-blocks' | 'binary-tall' | 'binary-diamond';

export const CLOCK_FACES: { id: ClockFace; label: string }[] = [
  { id: 'binary-audio',   label: 'stack'    },
  { id: 'elegant',        label: 'elegant'  },
  { id: 'stretch',        label: 'stretch'  },
  { id: 'analogue',       label: 'analogue' },
  { id: 'binary-blocks',  label: 'blocks'   },
  { id: 'binary-tall',    label: 'signal'   },
  { id: 'binary-diamond', label: 'struct'   },
];

export type ClockCtx = { now: Date; bands?: number[]; fftSize?: number; gain?: number; side?: 'left' | 'right' };
export type ClockRenderer = (ctx: ClockCtx) => Frame;

const COLS = 9;
const ROWS = 34;


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
  const N_BH = 3;
  const N_BV = 8;
  const BANDS_PER_COL = 3;
  const blockCorrupt = new Float32Array(N_BH * N_BV);
  const blockAge = new Uint8Array(N_BH * N_BV);

  function bandLvl(mag: number, gain: number, ref: number): number {
    const MIN_DB = -60;
    const m = mag * gain;
    const db = m > 0 ? 20 * Math.log10(m / ref) : MIN_DB;
    return Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB));
  }

  return ({ now, bands, fftSize = 2048, gain = 1.0, side = 'left' }) => {
    const ts = Math.floor(now.getTime() / 1000);
    const frame = createFrame();
    const ref = fftSize / 2;

    const colEnergy = new Float32Array(N_BH);
    if (bands && bands.length > 0) {
      for (let bh = 0; bh < N_BH; bh++) {
        let e = 0;
        for (let b = bh * BANDS_PER_COL; b < (bh + 1) * BANDS_PER_COL; b++) {
          e += bandLvl(bands[b] ?? 0, gain, ref);
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
      const energy = colEnergy[bh] ?? 0;
      for (let bv = 0; bv < N_BV; bv++) {
        const bitIdx = bh * N_BV + (N_BV - 1 - bv);
        const bit = (ts >>> bitIdx) & 1;
        const idx = bh * N_BV + bv;

        blockAge[idx] = ((blockAge[idx] ?? 0) + 1) % (2 + bv % 5);
        if (blockAge[idx] === 0) {
          if (bit === 1) {
            if (energy > 0.20 && Math.random() < energy * 0.7) {
              blockCorrupt[idx] = 0.8 + Math.random() * 0.2;
            } else {
              // Converge toward ambient (~0.15) so on-bits stay dim but visible at silence
              blockCorrupt[idx] = (blockCorrupt[idx] ?? 0) * 0.65 + 0.0525;
            }
          } else {
            blockCorrupt[idx] = (blockCorrupt[idx] ?? 0) * 0.2;
          }
        }

        const corr = blockCorrupt[idx] ?? 0;
        if (corr > 0.08) {
          const pixelBh = side === 'right' ? (N_BH - 1 - bh) : bh;
          for (let c = pixelBh * BW; c < (pixelBh + 1) * BW; c++) {
            for (let r = 1 + bv * BH; r < 1 + (bv + 1) * BH; r++) {
              frame[c * ROWS + r] = Math.random() < corr ? 255 : 0;
            }
          }
        }
      }
    }

    return frame;
  };
}

function analogue(): ClockRenderer {
  const CX = 4;
  const CY = 16;
  const MIN_LEN = 6;
  const HR_LEN = 2;
  const TWO_PI = 2 * Math.PI;

  function drawLine(frame: Frame, x0: number, y0: number, x1: number, y1: number): void {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (x0 >= 0 && x0 < COLS && y0 >= 0 && y0 < ROWS)
        frame[x0 * ROWS + y0] = 255;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  return ({ now }) => {
    const h = now.getHours() % 12;
    const m = now.getMinutes();
    const s = now.getSeconds();
    const frame = createFrame();

    const minAngle = ((m + s / 60) / 60) * TWO_PI - Math.PI / 2;
    const hrAngle  = ((h + m / 60) / 12)  * TWO_PI - Math.PI / 2;

    drawLine(frame, CX, CY,
      Math.round(CX + MIN_LEN * Math.cos(minAngle)),
      Math.round(CY + MIN_LEN * Math.sin(minAngle)));
    drawLine(frame, CX, CY,
      Math.round(CX + HR_LEN * Math.cos(hrAngle)),
      Math.round(CY + HR_LEN * Math.sin(hrAngle)));

    return frame;
  };
}

function flipH(frame: Frame): Frame {
  const out = createFrame();
  for (let c = 0; c < COLS; c++) {
    const src = (COLS - 1 - c) * ROWS;
    const dst = c * ROWS;
    for (let r = 0; r < ROWS; r++) out[dst + r] = frame[src + r] ?? 0;
  }
  return out;
}

// Frame 1: two 2-wide column groups, 2×2 pixel blocks — H left, M right
function binaryBlocks(): ClockRenderer {
  // 17 bits (H:5 + M:6 + S:6) in two column groups, reading L→R T→B
  // 9 row positions × (2 tall + 1 gap) = 26 rows; offset 4 centers in 34 rows
  const LEFT_COLS  = [2, 3] as const;
  const RIGHT_COLS = [5, 6] as const;
  const TOP_OFFSET = 4;

  function paintBlock(frame: Frame, cols: readonly number[], topRow: number): void {
    for (const c of cols) {
      for (let r = topRow; r < topRow + 2 && r < ROWS; r++) frame[c * ROWS + r] = 255;
    }
  }

  return ({ now, side }) => {
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const frame = createFrame();

    const bits: number[] = [];
    for (let b = 4; b >= 0; b--) bits.push((h >> b) & 1);
    for (let b = 5; b >= 0; b--) bits.push((m >> b) & 1);
    for (let b = 5; b >= 0; b--) bits.push((s >> b) & 1);

    for (let i = 0; i < bits.length; i++) {
      if (!bits[i]) continue;
      paintBlock(
        frame,
        (i & 1) === 0 ? LEFT_COLS : RIGHT_COLS,
        TOP_OFFSET + Math.floor(i / 2) * 3,
      );
    }
    return side === 'right' ? flipH(frame) : frame;
  };
}

// Frame 4: H/M/S/deciseconds in cols 1,3,5,7; 3-row-tall bits, 6 positions, empty bottom
function binaryTall(): ClockRenderer {
  const BIT_COLS = [1, 3, 5, 7] as const;

  function paintBit(frame: Frame, col: number, pos: number): void {
    const top = 3 + pos * 5; // 3 rows on, 2 gap; offset 3 centers 28-row content in 34 rows
    for (let r = top; r < top + 3 && r < ROWS; r++) frame[col * ROWS + r] = 255;
  }

  return ({ now, side }) => {
    const h  = now.getHours();
    const m  = now.getMinutes();
    const s  = now.getSeconds();
    const ds = Math.floor(now.getMilliseconds() / 100);
    const frame = createFrame();
    // Hours: 5 bits at positions 1–5 (position 0 always unused)
    for (let b = 0; b < 5; b++) {
      if (h & (1 << (4 - b))) paintBit(frame, BIT_COLS[0]!, b + 1);
    }
    // Minutes: 6 bits at positions 0–5
    for (let b = 0; b < 6; b++) {
      if (m & (1 << (5 - b))) paintBit(frame, BIT_COLS[1]!, b);
    }
    // Seconds: 6 bits at positions 0–5
    for (let b = 0; b < 6; b++) {
      if (s & (1 << (5 - b))) paintBit(frame, BIT_COLS[2]!, b);
    }
    // Deciseconds 0–9: 4 bits at positions 2–5
    for (let b = 0; b < 4; b++) {
      if (ds & (1 << (3 - b))) paintBit(frame, BIT_COLS[3]!, b + 2);
    }
    return side === 'right' ? flipH(frame) : frame;
  };
}

// Frame 2: X/diamond shapes — shared base + three seconds/movement variants
// Left side = hours (12h, 4 bits), right side = minutes/4 (4 bits, ~4-min resolution)
function drawDiamondShape(frame: Frame, startRow: number, filled: boolean, leftSide: boolean): void {
  const edgeCols = leftSide ? [1, 2, 3] as const : [7, 6, 5] as const;
  const fillFrom  = leftSide ? 1 : 7;

  function paintRow(r: number, edgeCol: number): void {
    if (r >= ROWS) return;
    if (filled) {
      const c0 = Math.min(fillFrom, edgeCol), c1 = Math.max(fillFrom, edgeCol);
      for (let c = c0; c <= c1; c++) frame[c * ROWS + r] = 255;
    } else {
      frame[edgeCol * ROWS + r] = 255;
    }
  }

  for (let i = 0; i < 3; i++) {
    paintRow(startRow + i + 1, edgeCols[i]!);
    paintRow(startRow + i + 5, edgeCols[2 - i]!);
  }
}

function drawDiamondBase(frame: Frame, h: number, m: number): void {
  const mBits = m >> 2;
  for (let i = 0; i < 4; i++) {
    drawDiamondShape(frame, i * 8, ((h     >> (3 - i)) & 1) === 1, true);
    drawDiamondShape(frame, i * 8, ((mBits >> (3 - i)) & 1) === 1, false);
  }
}

// Pixel bounces col 4 between row 1 (1 from top) and row 31 (2 from bottom), 1 row/s
// Period = 60 s: t=0→row 1, t=30→row 31, t=59→row 2
function binaryDiamond(): ClockRenderer {
  return ({ now, side }) => {
    const frame = createFrame();
    drawDiamondBase(frame, now.getHours() % 12, now.getMinutes());
    const t = Math.floor(now.getTime() / 1000) % 60;
    frame[4 * ROWS + (t <= 30 ? 1 + t : 61 - t)] = 255;
    return side === 'right' ? flipH(frame) : frame;
  };
}

const FACTORIES: Record<ClockFace, () => ClockRenderer> = {
  'binary-audio':   binaryAudio,
  'elegant':        elegant,
  'stretch':        stretch,
  'analogue':       analogue,
  'binary-blocks':  binaryBlocks,
  'binary-tall':    binaryTall,
  'binary-diamond': binaryDiamond,
};

export function createClockRenderer(face: ClockFace): ClockRenderer {
  return FACTORIES[face]();
}

export function isClockFace(s: string): s is ClockFace {
  return Object.prototype.hasOwnProperty.call(FACTORIES, s);
}
