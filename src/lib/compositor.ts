import { FRAME_ROWS, FRAME_COLS } from './frame.js';
import type { Frame } from './frame.js';

export type NotifyOverlay = {
  left: Frame | null;
  right: Frame | null;
  /**
   * Blend mode within [stripStart, stripEnd). Outside the strip: always passthrough.
   * 'or': additive clamp (default). 'replace': overlay fully replaces base.
   * 'xor': text cancels lit cells; text appears only in dark areas.
   * 'halo': text appears on base; 8-connected neighbours of lit pixels are zeroed (black border).
   */
  mode?: 'or' | 'replace' | 'xor' | 'halo';
  stripStart?: number;
  stripEnd?: number;
};

export function composeFrames(
  base: readonly [Frame, Frame],
  overlay: NotifyOverlay | null,
): [Frame, Frame] {
  if (overlay === null) return [base[0], base[1]];

  const left  = blendSide(base[0], overlay.left, overlay);
  const right = blendSide(base[1], overlay.right, overlay);
  return [left, right];
}

function blendSide(base: Frame, over: Frame | null, opts: NotifyOverlay): Frame {
  if (over === null) return base;
  const out = new Uint8Array(base.length) as Frame;
  const { mode = 'or', stripStart, stripEnd } = opts;
  const hasStrip = stripStart !== undefined && stripEnd !== undefined;
  const ss = stripStart ?? 0;
  const se = stripEnd ?? FRAME_ROWS;

  for (let col = 0; col < FRAME_COLS; col++) {
    for (let row = 0; row < FRAME_ROWS; row++) {
      const i = col * FRAME_ROWS + row;
      const b = base[i] ?? 0;
      const o = over[i] ?? 0;

      if (hasStrip && (row < ss || row >= se)) { out[i] = b; continue; }

      if (mode === 'replace') {
        out[i] = o;
      } else if (mode === 'xor') {
        out[i] = o > 0 ? (b > 0 ? 0 : 255) : b;
      } else if (mode === 'halo') {
        if (o > 0) {
          out[i] = o;
        } else {
          let neighborLit = false;
          for (let dc = -1; dc <= 1 && !neighborLit; dc++) {
            for (let dr = -1; dr <= 1 && !neighborLit; dr++) {
              if (dc === 0 && dr === 0) continue;
              const nc = col + dc; const nr = row + dr;
              if (nc >= 0 && nc < FRAME_COLS && nr >= 0 && nr < FRAME_ROWS) {
                if ((over[nc * FRAME_ROWS + nr] ?? 0) > 0) neighborLit = true;
              }
            }
          }
          out[i] = neighborLit ? 0 : b;
        }
      } else {
        out[i] = Math.min(255, b + o);
      }
    }
  }
  return out;
}
