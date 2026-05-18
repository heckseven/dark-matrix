import { describe, it, expect } from 'vitest';
import { createFrame, FRAME_SIZE } from './frame.js';
import { composeFrames } from './compositor.js';
import type { NotifyOverlay } from './compositor.js';
import type { Frame } from './frame.js';

function filledFrame(value: number): Frame {
  const f = createFrame();
  f.fill(value);
  return f;
}

function sparseFrame(...entries: [index: number, value: number][]): Frame {
  const f = createFrame();
  for (const [i, v] of entries) f[i] = v;
  return f;
}

describe('composeFrames', () => {
  it('null overlay returns base references unchanged — no allocation', () => {
    const base: [Frame, Frame] = [createFrame(), createFrame()];
    const result = composeFrames(base, null);
    expect(result[0]).toBe(base[0]);
    expect(result[1]).toBe(base[1]);
  });

  it('left null overlay: left is same reference, right is blended', () => {
    const base: [Frame, Frame] = [filledFrame(100), filledFrame(100)];
    const overlay: NotifyOverlay = { left: null, right: filledFrame(50) };
    const result = composeFrames(base, overlay);
    expect(result[0]).toBe(base[0]);
    expect(result[1]).not.toBe(base[1]);
    expect(result[1][0]).toBe(150);
  });

  it('right null overlay: right is same reference, left is blended', () => {
    const base: [Frame, Frame] = [filledFrame(100), filledFrame(100)];
    const overlay: NotifyOverlay = { left: filledFrame(50), right: null };
    const result = composeFrames(base, overlay);
    expect(result[0]).not.toBe(base[0]);
    expect(result[1]).toBe(base[1]);
    expect(result[0][0]).toBe(150);
  });

  it('BW OR blend: 0+255=255, 255+0=255, 0+0=0', () => {
    const base: [Frame, Frame] = [sparseFrame([0, 255], [1, 0]), createFrame()];
    const overlay: NotifyOverlay = { left: sparseFrame([0, 0], [1, 255]), right: null };
    const result = composeFrames(base, overlay);
    expect(result[0][0]).toBe(255); // 255+0 = 255
    expect(result[0][1]).toBe(255); // 0+255 = 255
    expect(result[0][2]).toBe(0);   // 0+0 = 0
  });

  it('grayscale additive blend: 100+100=200', () => {
    const base: [Frame, Frame] = [filledFrame(100), createFrame()];
    const overlay: NotifyOverlay = { left: filledFrame(100), right: null };
    const result = composeFrames(base, overlay);
    expect(result[0][0]).toBe(200);
  });

  it('grayscale additive clamp: 200+100=255 (not 300)', () => {
    const base: [Frame, Frame] = [filledFrame(200), createFrame()];
    const overlay: NotifyOverlay = { left: filledFrame(100), right: null };
    const result = composeFrames(base, overlay);
    expect(result[0][0]).toBe(255);
  });

  it('all-zero overlay: result equals base values', () => {
    const base: [Frame, Frame] = [filledFrame(128), filledFrame(64)];
    const overlay: NotifyOverlay = { left: filledFrame(0), right: filledFrame(0) };
    const result = composeFrames(base, overlay);
    expect(result[0][0]).toBe(128);
    expect(result[1][0]).toBe(64);
  });

  it('all-255 overlay: result is all-255', () => {
    const base: [Frame, Frame] = [filledFrame(0), filledFrame(128)];
    const overlay: NotifyOverlay = { left: filledFrame(255), right: filledFrame(255) };
    const result = composeFrames(base, overlay);
    expect(result[0].every(v => v === 255)).toBe(true);
    expect(result[1].every(v => v === 255)).toBe(true);
  });

  it('blended frames have correct length (FRAME_SIZE = 306)', () => {
    const base: [Frame, Frame] = [filledFrame(1), filledFrame(1)];
    const overlay: NotifyOverlay = { left: filledFrame(1), right: filledFrame(1) };
    const result = composeFrames(base, overlay);
    expect(result[0].length).toBe(FRAME_SIZE);
    expect(result[1].length).toBe(FRAME_SIZE);
  });
});
