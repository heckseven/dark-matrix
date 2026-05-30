import type { AudioStyle } from '../store.js';
import { BAYER4 } from '../../../animations/bayer.js';

// Shared frame helpers for audio-visualizer grids (audio mode + cast mode).
// A single module is 9 columns × 34 rows; frames are base64-encoded column-major
// byte arrays, matching the daemon's wire format.

const COLS = 9;
const ROWS = 34;

function makeFrame(fill: (c: number, r: number) => number): string {
  const data = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      data[c * ROWS + r] = fill(c, r);
  return btoa(String.fromCharCode(...data));
}

const EQ_H   = [10, 16, 22, 28, 30, 28, 22, 16, 10] as const;
const SPEC_H = [ 4,  7, 10, 13, 14, 13, 10,  7,  4] as const;
const CTR    = Math.floor(ROWS / 2);

/** Static fallback frames shown before live FFT band data arrives. */
export const PLACEHOLDER: Record<AudioStyle, string> = {
  'spectrum-fall':       makeFrame((c, r) => Math.abs(r - CTR) <= SPEC_H[c]! ? 255 - Math.round((r / (ROWS - 1)) * 255) : 0),
  'vu-glitch':           makeFrame((c, r) => r % 9 < 4 && (c * 5 + r * 7) % 7 < 4 ? 255 : 0),
  'circuit':             makeFrame((c, r) => { const bv = Math.floor(r / 4), bh = Math.floor(c / 3); return (bv + bh) % 3 !== 0 && (c * 7 + r * 11) % 5 < 3 ? 255 : 0; }),
  'spirits':             makeFrame((c, r) => { const h = [10,16,22,28,30,28,22,16,10][c]!; const bRow = ROWS - 1 - h; return Math.abs(r - bRow) <= 1 ? Math.round(255 * Math.pow(0.78, Math.abs(r - bRow))) : 0; }),
  'scope-dual':          makeFrame((c, r) => { const rA = ROWS - 1 - Math.round(EQ_H[c]! / ROWS * (ROWS - 1)); const rB = ROWS - 1 - Math.round(EQ_H[COLS - 1 - c]! / ROWS * (ROWS - 1)) + 4; return r === rA ? 255 : Math.abs(r - rA) === 1 ? 170 : r === rB ? 180 : Math.abs(r - rB) === 1 ? 150 : 0; }),
  'glitch-sort-b':       makeFrame((c, r) => { const sc = (c + 1) % 9; const h = [10,16,22,28,30,28,22,16,10][sc]!; return r < h && (sc * 7 + r * 11) % 3 < 2 ? 255 : 0; }),
  'spiral-d':            makeFrame((c, r) => { const CC=4, CR=17; for (let arm=0; arm<2; arm++) { const off=(arm/2)*2*Math.PI; for (let s=0; s<45; s++) { const frac=s/44; const theta=off+frac*5*Math.PI; const sc=Math.round(CC+Math.cos(theta)*CC*frac); const sr=Math.round(CR+Math.sin(theta)*CR*frac); if (sc===c && sr===r) return 255; } } return 0; }),
  'strobe':              makeFrame((c, _r) => [1,0,0,1,1,0,0,1,0][c] ? 255 : 0),
  'dark-matter':         makeFrame((c, r) => { const t = ROWS - EQ_H[c]!; return r === t - 2 ? 255 : r >= t ? ((c * 13 + r * 7) % 11 < 9 ? 255 : 0) : 0; }),
  'neo':                 makeFrame((c, r) => { const head = [6, 20, 11, 3, 16, 26, 8, 14, 22][c]!; const d = r - head; return d >= 0 && d < 9 ? Math.round(255 * Math.pow(0.65, d)) : 0; }),
  'cipher':              makeFrame((c, r) => (c * 17 + r * 31) % 7 < 4 ? 255 : 0),
  'wake':                makeFrame((_c, r) => Math.max(Math.round(255 * Math.pow(0.86, Math.abs(r - 7) * 1.1)), Math.round(255 * Math.pow(0.86, Math.abs(r - 23) * 1.1)))),
  'rhythm':              makeFrame((_c, r) => Math.round(Math.max(0, 1 - Math.abs(Math.abs(r - CTR) - 8) / 1.5) * 255)),
  'drop':                makeFrame((c, r) => { const cx = 4, cy = 17; const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2); return Math.round(Math.max(0, 1 - Math.abs(d - 8) / 0.5) * 255); }),
  'life-erode-4':        makeFrame((c, r) => (c * 19 + r * 37 + c * r * 5) % 13 < 1 ? 255 : 0),
  'kick-d':              makeFrame((c, r) => { const h = [1,3,6,11,16,11,6,3,1][c]!; return r === ROWS - 1 - h ? 255 : 0; }),
  'waterfall':           makeFrame((_c, r) => Math.round((r / (ROWS - 1)) * 255)),
  'sparks':              makeFrame((c, r) => ((c * 7 + r * 11) % 13 < Math.round((1 - r / (ROWS - 1)) * 6)) ? 255 : 0),
  'hex':                 makeFrame((c, r) => { const heads = [[8,22,14],[5,19,26],[12,6,20],[3,17,28],[7,15,23],[15,8,25],[10,20,4],[4,18,27],[9,2,16]][c]!; return Math.max(...heads.map((h, i) => { const d = r - h + i; return d >= 0 && d < 9 ? Math.round(255 * Math.pow(0.65, d)) : 0; })); }),
  'specter':             makeFrame((c, r) => (c * 7 + r * 11) % 17 < 2 && (c * 3 + r * 5) % 7 < 3 ? 200 : 0),
  'heat':                makeFrame((c, r) => { const h = Math.round((EQ_H[c]! + (c % 3 === 0 ? 4 : c % 3 === 1 ? -3 : 2)) * 0.25); return r >= ROWS - h ? ((c * 13 + r * 29) % 11 < 4 ? 0 : 255) : r < ROWS-h && r > ROWS-h-14 && (c*3+r*7)%13===0 ? Math.round(200*Math.pow(0.87,ROWS-h-1-r)) : 0; }),
  'glitch-corrupt':      makeFrame((c, r) => (c>=1&&c<=3&&r>=8&&r<=17)||(c>=5&&c<=7&&r>=20&&r<=28) ? (c*17+r*31)%5<3 ? 255 : 0 : 0),
};

/** A fully blank single-module frame — used for the "off" tile. */
export const BLANK_FRAME: string = makeFrame(() => 0);

/** Bayer-dither an 8-bit grayscale frame down to the panel's 1-bit output. */
export function frameToB64(frame: Uint8Array): string {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
      out[col * ROWS + row] = (frame[col * ROWS + row] ?? 0) > threshold ? 255 : 0;
    }
  }
  return btoa(String.fromCharCode(...out));
}

/** Mirror a single-module frame into a dual-module (18-wide) frame. */
export function mirrorFrame(b64: string): string {
  const src = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  const dst = new Uint8Array(COLS * 2 * ROWS);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = src[c * ROWS + r] ?? 0;
      dst[c * ROWS + r] = v;
      dst[(COLS * 2 - 1 - c) * ROWS + r] = v;
    }
  }
  return btoa(String.fromCharCode(...dst));
}
