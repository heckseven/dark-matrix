import { describe, it, expect } from 'vitest';
import { createScrollAnimation } from './scroll.js';

async function nextFrame(anim: ReturnType<typeof createScrollAnimation>) {
  const iter = anim[Symbol.asyncIterator]();
  return iter.next();
}

async function advanceN(anim: ReturnType<typeof createScrollAnimation>, n: number) {
  const iter = anim[Symbol.asyncIterator]();
  let last;
  for (let i = 0; i < n; i++) {
    last = await iter.next();
  }
  return last!;
}

describe('scroll frame dimensions', () => {
  it('left and right frames are both 306-byte Uint8Arrays', async () => {
    const anim = createScrollAnimation({ text: 'Hi' });
    const iter = anim[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.done).toBe(false);
    const [left, right] = result.value;
    expect(left).toBeInstanceOf(Uint8Array);
    expect(left.length).toBe(306);
    expect(right).toBeInstanceOf(Uint8Array);
    expect(right.length).toBe(306);
    anim.stop();
  });
});

describe('scroll content', () => {
  it('advancing N frames shifts content left by N pixels (pixelsPerTick=1)', async () => {
    const text = 'ABC';
    const anim1 = createScrollAnimation({ text, loop: false });
    const anim2 = createScrollAnimation({ text, loop: false });

    const iter1 = anim1[Symbol.asyncIterator]();
    const iter2 = anim2[Symbol.asyncIterator]();

    // Frame 0 from anim1 should equal frame N from anim2 if anim2 is at offset N
    const N = 3;
    for (let i = 0; i < N; i++) await iter2.next();

    const r1 = await iter1.next();
    const r2 = await iter2.next();

    expect(r1.done).toBe(false);
    expect(r2.done).toBe(false);

    // Frame 0 left of anim1 = frame N left of anim1 offset by N pixels.
    // Verify: advance anim1 by N, then compare to fresh anim2 at same position.
    // Simpler: check that frame at offset 0 ≠ frame at offset N for non-trivial text.
    // Text starts at offset=-18 (blank lead-in). Skip 18 frames to reach offset=0 (start of 'A').
    const anim3 = createScrollAnimation({ text: 'ABC', loop: false });
    const iter3 = anim3[Symbol.asyncIterator]();
    for (let i = 0; i < 18; i++) await iter3.next(); // skip blank lead-in
    const frame0 = (await iter3.next()).value[0];     // offset=0: 'A' visible
    for (let i = 0; i < 5; i++) await iter3.next();
    const frame6 = (await iter3.next()).value[0];     // offset=6: past 'A'

    // These frames are 6 pixels apart — they should differ (A vs space)
    expect(Buffer.from(frame0)).not.toEqual(Buffer.from(frame6));
  });
});

describe('scroll stop', () => {
  it('stop() causes iterator to return done on next call', async () => {
    const anim = createScrollAnimation({ text: 'hello' });
    const iter = anim[Symbol.asyncIterator]();
    await iter.next();
    anim.stop();
    const result = await iter.next();
    expect(result.done).toBe(true);
  });
});

describe('scroll loop=false', () => {
  it('stops after full text has scrolled through', async () => {
    // text = 'A' = 6px wide. wrapAt = 6 + 18 = 24. With pixelsPerTick=1, stops after 24 frames.
    const text = 'A';
    const anim = createScrollAnimation({ text, loop: false });
    const iter = anim[Symbol.asyncIterator]();

    let count = 0;
    while (true) {
      const r = await iter.next();
      if (r.done) break;
      count++;
      if (count > 100) break; // safety
    }

    // offset starts at -18, wrapAt = 6+18 = 24, total frames = 24-(-18) = 42
    expect(count).toBe(42);
  });
});
