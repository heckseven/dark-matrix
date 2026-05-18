import type { Frame } from './frame.js';

export type NotifyOverlay = {
  left: Frame | null;
  right: Frame | null;
};

export function composeFrames(
  base: readonly [Frame, Frame],
  overlay: NotifyOverlay | null,
): [Frame, Frame] {
  if (overlay === null) return [base[0], base[1]];

  const left  = blendSide(base[0], overlay.left);
  const right = blendSide(base[1], overlay.right);
  return [left, right];
}

function blendSide(base: Frame, over: Frame | null): Frame {
  if (over === null) return base;
  const out = new Uint8Array(base.length) as Frame;
  for (let i = 0; i < base.length; i++) {
    out[i] = Math.min(255, (base[i] ?? 0) + (over[i] ?? 0));
  }
  return out;
}
