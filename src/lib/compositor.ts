import { FRAME_ROWS } from './frame.js';
import type { Frame } from './frame.js';

export type NotifyOverlay = {
  left: Frame | null;
  right: Frame | null;
  /** 'or': additive blend (default). 'strip-replace': rows [stripStart, stripEnd) fully replace base. */
  mode?: 'or' | 'strip-replace';
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
  if (opts.mode === 'strip-replace' && opts.stripStart !== undefined && opts.stripEnd !== undefined) {
    const { stripStart, stripEnd } = opts;
    for (let i = 0; i < base.length; i++) {
      const row = i % FRAME_ROWS;
      out[i] = (row >= stripStart && row < stripEnd) ? (over[i] ?? 0) : (base[i] ?? 0);
    }
  } else {
    for (let i = 0; i < base.length; i++) {
      out[i] = Math.min(255, (base[i] ?? 0) + (over[i] ?? 0));
    }
  }
  return out;
}
