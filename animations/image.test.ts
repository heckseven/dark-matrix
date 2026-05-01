import { describe, it, expect } from 'vitest';
import { createImageAnimation } from './image.js';
import { createFrame } from '../src/lib/frame.js';

function makeFrame(value = 128) {
  const f = createFrame();
  f.fill(value);
  return f;
}

describe('createImageAnimation', () => {
  it('yields the frame indefinitely when loop=true', async () => {
    const frame = makeFrame();
    const anim = createImageAnimation(frame);
    const iter = anim[Symbol.asyncIterator]();
    for (let i = 0; i < 10; i++) {
      const r = await iter.next();
      expect(r.done).toBe(false);
      expect(r.value).toBe(frame);
    }
    anim.stop();
  });

  it('yields exactly one frame when loop=false', async () => {
    const frame = makeFrame();
    const anim = createImageAnimation(frame, { loop: false });
    const iter = anim[Symbol.asyncIterator]();
    const r1 = await iter.next();
    expect(r1.done).toBe(false);
    expect(r1.value).toBe(frame);
    const r2 = await iter.next();
    expect(r2.done).toBe(true);
  });

  it('stop() ends iteration immediately', async () => {
    const anim = createImageAnimation(makeFrame());
    const iter = anim[Symbol.asyncIterator]();
    await iter.next();
    anim.stop();
    const r = await iter.next();
    expect(r.done).toBe(true);
  });

  it('default loop is true', async () => {
    const anim = createImageAnimation(makeFrame());
    const iter = anim[Symbol.asyncIterator]();
    const r1 = await iter.next();
    const r2 = await iter.next();
    expect(r1.done).toBe(false);
    expect(r2.done).toBe(false);
    anim.stop();
  });
});
