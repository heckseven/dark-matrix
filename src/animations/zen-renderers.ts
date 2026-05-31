import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import { createZenFluidRenderer } from './zen-fluid.js';
import { createZenBreathRenderer } from './zen-breath.js';
import { createZenFloraRenderer } from './zen-flora.js';
import { createZenGrassRenderer } from './zen-grass.js';
import { createZenPlantRenderer } from './zen-plant.js';
import { createZenSpiroRenderer } from './zen-spiro.js';

export type { ZenFluidStyle } from './zen-fluid.js';
export type { ZenBreathStyle } from './zen-breath.js';
export type { ZenFloraStyle } from './zen-flora.js';
export type { ZenGrassStyle } from './zen-grass.js';
export type { ZenPlantStyle } from './zen-plant.js';
export type { ZenSpiroStyle } from './zen-spiro.js';

export type ZenStyle =
  | 'waves' | 'pool' | 'brush'
  | 'breathe' | 'inhale'
  | 'blossom'
  | 'rose' | 'orbit' | 'corona'
  | 'grass'
  | 'pine' | 'seeds';

export const ZEN_STYLES: { id: ZenStyle; label: string }[] = [
  { id: 'waves',   label: 'waves'   },
  { id: 'pool',    label: 'pool'    },
  { id: 'brush',   label: 'brush'   },
  { id: 'breathe', label: 'breathe' },
  { id: 'inhale',  label: 'inhale'  },
  { id: 'blossom', label: 'blossom' },
  { id: 'rose',    label: 'rose'    },
  { id: 'orbit',   label: 'orbit'   },
  { id: 'corona',  label: 'corona'  },
  { id: 'grass',   label: 'grass'   },
  { id: 'pine',    label: 'pine'    },
  { id: 'seeds',   label: 'seeds'   },
];

export const ZEN_STYLE_VALUES = ZEN_STYLES.map(s => s.id) as [string, ...string[]];

export type ZenRendererApi = {
  render(): Frame;
  stop(): void;
};

export function createZenRenderer(style: ZenStyle, side?: 'left' | 'right'): ZenRendererApi {
  switch (style) {
    case 'waves':
    case 'pool':
    case 'brush':
      return createZenFluidRenderer(style, side);
    case 'breathe':
    case 'inhale':
      return createZenBreathRenderer(style, side);
    case 'blossom':
      return createZenFloraRenderer(style, side);
    case 'rose':
    case 'orbit':
    case 'corona':
      return createZenSpiroRenderer(style, side);
    case 'grass':
      return createZenGrassRenderer(style, side);
    case 'pine':
    case 'seeds':
      return createZenPlantRenderer(style);
    default:
      return createZenFluidRenderer('waves');
  }
}

// ---------------------------------------------------------------------------
// Static representative thumbnails
// ---------------------------------------------------------------------------

function clamp255th(v: number): number { return Math.max(0, Math.min(255, Math.round(v))); }

function plotSoftTh(
  buf: Float32Array,
  cx: number, cy: number,
  brightness: number,
): void {
  const fc = Math.round(cx);
  const fr = Math.round(cy);
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const nc = fc + dc;
      const nr = fr + dr;
      if (nc < 0 || nc >= FRAME_COLS || nr < 0 || nr >= FRAME_ROWS) continue;
      const distSq = (cx - nc) ** 2 + (cy - nr) ** 2;
      const idx = nc * FRAME_ROWS + nr;
      buf[idx] = Math.min(255, (buf[idx] ?? 0) + brightness * Math.exp(-distSq / 0.5));
    }
  }
}

function bufToFrameTh(buf: Float32Array): Frame {
  const f = createFrame();
  for (let i = 0; i < FRAME_COLS * FRAME_ROWS; i++) f[i] = clamp255th(buf[i] ?? 0);
  return f;
}

/** Return a single representative frame for use as a static thumbnail. */
export function zenThumbFrame(style: ZenStyle): Frame {
  switch (style) {
    // Renderers that look representative on first call
    case 'waves':
    case 'pool':
    case 'orbit':
    case 'blossom': {
      const r = createZenRenderer(style);
      const f = r.render();
      r.stop();
      return f;
    }

    // breathe: show ~75% fill (mid-inhale/hold visual)
    case 'breathe': {
      const f = createFrame();
      const litRows = Math.floor(0.75 * FRAME_ROWS);
      for (let col = 0; col < FRAME_COLS; col++) {
        for (let i = 0; i < litRows; i++) {
          f[col * FRAME_ROWS + (FRAME_ROWS - 1 - i)] = 255;
        }
        // soft top edge
        if (litRows < FRAME_ROWS) f[col * FRAME_ROWS + (FRAME_ROWS - 1 - litRows)] = 128;
      }
      return f;
    }

    // inhale: hold phase — outer ring at max radius + inner ring at ~50%
    case 'inhale': {
      const f = createFrame();
      const cx = 4, cy = 17, outerR = 14, innerR = 7;
      for (let col = 0; col < FRAME_COLS; col++) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          const dist = Math.sqrt((col - cx) ** 2 + (row - cy) ** 2);
          // outer ring (hold pulse width ~2.0)
          const od = Math.abs(dist - outerR);
          const outerB = od <= 2.0 ? (1 - od / 2.0) * 220 : 0;
          // inner ring
          const id2 = Math.abs(dist - innerR);
          const innerB = id2 <= 0.5 ? (1 - id2 / 0.5) * 0.8 * 255 : 0;
          const b = Math.max(outerB, innerB);
          if (b > 0) f[col * FRAME_ROWS + row] = clamp255th(b);
        }
      }
      return f;
    }

    // rose: plot complete 5-petal hypotrochoid (2π, 360 steps)
    case 'rose': {
      const buf = new Float32Array(FRAME_COLS * FRAME_ROWS);
      const xS = 3.5, yS = 3.5 * 2.3, cx = 4, cy = 17;
      for (let s = 0; s <= 360; s++) {
        const t = (s / 360) * Math.PI * 2;
        plotSoftTh(buf, cx + (5 * Math.cos(t) + 5 * Math.cos(5 * t)) * xS, cy + (5 * Math.sin(t) - 5 * Math.sin(5 * t)) * yS, 255);
      }
      return bufToFrameTh(buf);
    }

    // corona: plot complete 5-fold epitrochoid (6π, 600 steps)
    case 'corona': {
      const buf = new Float32Array(FRAME_COLS * FRAME_ROWS);
      const xS = (FRAME_COLS / 2 - 0.5) / 11;
      const yS = (FRAME_ROWS / 2 - 2) / 11;
      const cx = 4, cy = 17;
      const period = Math.PI * 6;
      for (let s = 0; s <= 600; s++) {
        const t = (s / 600) * period;
        plotSoftTh(buf,
          cx + (8 * Math.cos(t) - 3 * Math.cos((8 / 3) * t)) * xS,
          cy + (8 * Math.sin(t) - 3 * Math.sin((8 / 3) * t)) * yS,
          255);
      }
      return bufToFrameTh(buf);
    }

    // brush: double-pendulum — pre-run 5s of physics to fill the trail
    case 'brush': {
      const m1 = 1, m2 = 1, L1 = 8, L2 = 8, g = 9.8;
      let theta1 = Math.PI * 0.6, theta2 = Math.PI * 0.9;
      let omega1 = 0, omega2 = 0;
      const pivX = (FRAME_COLS - 1) / 2, pivY = 4;
      const trail = new Float32Array(FRAME_COLS * FRAME_ROWS);
      const physDt = 0.015;
      const frameDtMs = 33;
      const decay = Math.pow(0.85, frameDtMs / 1000);
      const subs = Math.max(1, Math.round(frameDtMs / (physDt * 1000)));
      for (let frame = 0; frame < 150; frame++) {
        for (let _s = 0; _s < subs; _s++) {
          const cos12 = Math.cos(theta1 - theta2);
          const sin12 = Math.sin(theta1 - theta2);
          const den = 2 * m1 + m2 - m2 * Math.cos(2 * (theta1 - theta2));
          omega1 += ((-g * (2 * m1 + m2) * Math.sin(theta1) - m2 * g * Math.sin(theta1 - 2 * theta2) - 2 * sin12 * m2 * (omega2 ** 2 * L2 + omega1 ** 2 * L1 * cos12)) / (L1 * den)) * physDt;
          omega2 += ((2 * sin12 * (omega1 ** 2 * L1 * (m1 + m2) + g * (m1 + m2) * Math.cos(theta1) + omega2 ** 2 * L2 * m2 * cos12)) / (L2 * den)) * physDt;
          theta1 += omega1 * physDt;
          theta2 += omega2 * physDt;
        }
        const x1 = pivX + L1 * Math.sin(theta1);
        const y1 = pivY + L1 * Math.cos(theta1);
        const x2 = x1 + L2 * Math.sin(theta2);
        const y2 = y1 + L2 * Math.cos(theta2);
        for (let i = 0; i < trail.length; i++) trail[i] = trail[i]! * decay;
        const c2 = Math.round(x2), r2 = Math.round(y2);
        if (c2 >= 0 && c2 < FRAME_COLS && r2 >= 0 && r2 < FRAME_ROWS) {
          trail[c2 * FRAME_ROWS + r2] = 255;
          for (let dc = -1; dc <= 1; dc++) {
            for (let dr = -1; dr <= 1; dr++) {
              const nc = c2 + dc, nr = r2 + dr;
              if (nc >= 0 && nc < FRAME_COLS && nr >= 0 && nr < FRAME_ROWS) {
                const idx = nc * FRAME_ROWS + nr;
                trail[idx] = Math.max(trail[idx]!, 180 * (1 - Math.sqrt(dc ** 2 + dr ** 2) * 0.5));
              }
            }
          }
        }
        const c1 = Math.round(x1), r1 = Math.round(y1);
        if (c1 >= 0 && c1 < FRAME_COLS && r1 >= 0 && r1 < FRAME_ROWS)
          trail[c1 * FRAME_ROWS + r1] = Math.max(trail[c1 * FRAME_ROWS + r1]!, 120);
      }
      return bufToFrameTh(trail);
    }

    // grass: particle grass — simulate 2s of upward flow
    case 'grass': {
      const PPERCOL = 5;
      const ps: Array<{ col: number; row: number; speed: number }> = [];
      for (let col = 0; col < FRAME_COLS; col++) {
        for (let p = 0; p < PPERCOL; p++) {
          const rowFrac = p / PPERCOL;
          ps.push({
            col,
            row: FRAME_ROWS - 1 - Math.floor(rowFrac * (FRAME_ROWS - 1) * 0.7),
            speed: 4.0 + ((col * 1.3 + p * 2.7) % 3.0),
          });
        }
      }
      for (let step = 0; step < 60; step++) {
        for (const p of ps) {
          p.row -= p.speed * 0.033;
          if (p.row < 0) p.row = FRAME_ROWS - 1;
        }
      }
      const f = createFrame();
      for (const p of ps) {
        const row = Math.round(p.row);
        if (row < 0 || row >= FRAME_ROWS) continue;
        const brightness = clamp255th(60 + (row / (FRAME_ROWS - 1)) * 180);
        const idx = p.col * FRAME_ROWS + row;
        f[idx] = Math.max(f[idx] ?? 0, brightness);
      }
      return f;
    }

    // pine: fern frond — fully grown state
    case 'pine': {
      const f = createFrame();
      const cc = Math.round((FRAME_COLS - 1) / 2);
      const sinA = Math.sin(70 * (Math.PI / 180));
      const cosA = Math.cos(70 * (Math.PI / 180));
      for (let row = 3; row <= FRAME_ROWS - 1; row++) f[cc * FRAME_ROWS + row] = 200;
      let pi = 0;
      for (let row = FRAME_ROWS - 1 - 3; row >= 3; row -= 3) {
        const plen = Math.max(2, 4 - Math.floor(pi / 2));
        for (const s of [-1, 1]) {
          for (let d = 1; d <= plen; d++) {
            const pc = cc + s * Math.round(d * sinA);
            const pr = row - Math.round(d * cosA);
            if (pc >= 0 && pc < FRAME_COLS && pr >= 0 && pr < FRAME_ROWS)
              f[pc * FRAME_ROWS + pr] = 170;
          }
        }
        pi++;
      }
      return f;
    }

    // seeds: wild grass reeds — fully grown state
    case 'seeds': {
      const f = createFrame();
      const cc = Math.round((FRAME_COLS - 1) / 2);
      const stems = [
        { dc: -2, h: 26, curv: 0.15 },
        { dc:  0, h: 30, curv: -0.1 },
        { dc:  2, h: 22, curv: 0.2 },
      ];
      for (const { dc, h, curv } of stems) {
        const base = FRAME_ROWS - 1;
        for (let i = 0; i <= h; i++) {
          const row = base - i;
          const col = cc + dc + Math.round(curv * (i / h) * h * 0.3);
          if (col >= 0 && col < FRAME_COLS && row >= 0 && row < FRAME_ROWS)
            f[col * FRAME_ROWS + row] = 190;
        }
        const tipRow = base - h;
        const tipCol = cc + dc + Math.round(curv * 0.3 * h);
        for (let a = -2; a <= 2; a++) {
          if (tipCol + a >= 0 && tipCol + a < FRAME_COLS) {
            if (tipRow - 1 >= 0) f[(tipCol + a) * FRAME_ROWS + tipRow - 1] = 180;
            if (Math.abs(a) <= 1 && tipRow - 2 >= 0) f[(tipCol + a) * FRAME_ROWS + tipRow - 2] = 160;
          }
        }
      }
      return f;
    }
    default: {
      const _exhaustive: never = style;
      throw new Error(`zenThumbFrame: unhandled style ${_exhaustive}`);
    }
  }
}
