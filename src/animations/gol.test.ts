import { describe, it, expect } from 'vitest';
import { createGolAnimation } from './gol.js';

describe('createGolAnimation', () => {
  it('yields Frame objects of length 306', async () => {
    const anim = createGolAnimation({ seed: 1 });
    const iter = anim[Symbol.asyncIterator]();
    const r = await iter.next();
    expect(r.done).toBe(false);
    expect(r.value).toBeInstanceOf(Uint8Array);
    expect(r.value.length).toBe(306);
    anim.stop();
  });

  it('pixels are 0 or 255 only', async () => {
    const anim = createGolAnimation({ seed: 42 });
    const iter = anim[Symbol.asyncIterator]();
    const r = await iter.next();
    for (const v of r.value) expect(v === 0 || v === 255).toBe(true);
    anim.stop();
  });

  it('deterministic with fixed seed — same frame sequence', async () => {
    const a1 = createGolAnimation({ seed: 7, frames: 5, loop: false });
    const a2 = createGolAnimation({ seed: 7, frames: 5, loop: false });
    const frames1: Uint8Array[] = [];
    const frames2: Uint8Array[] = [];
    for await (const f of a1) frames1.push(f);
    for await (const f of a2) frames2.push(f);
    expect(frames1).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(Buffer.from(frames1[i]!)).toEqual(Buffer.from(frames2[i]!));
    }
  });

  it('different seeds produce different first frames', async () => {
    const anim1 = createGolAnimation({ seed: 1 });
    const anim2 = createGolAnimation({ seed: 2 });
    const r1 = await anim1[Symbol.asyncIterator]().next();
    const r2 = await anim2[Symbol.asyncIterator]().next();
    expect(Buffer.from(r1.value)).not.toEqual(Buffer.from(r2.value));
    anim1.stop(); anim2.stop();
  });

  it('loop=false ends after the specified frame count', async () => {
    const anim = createGolAnimation({ seed: 1, frames: 10, loop: false });
    let count = 0;
    for await (const _ of anim) count++;
    expect(count).toBe(10);
  });

  it('frames differ over time (GoL evolves)', async () => {
    const anim = createGolAnimation({ seed: 1 });
    const iter = anim[Symbol.asyncIterator]();
    const f1 = (await iter.next()).value;
    const f2 = (await iter.next()).value;
    // After one GoL step, at least some cells should have changed
    let diffs = 0;
    for (let i = 0; i < 306; i++) if (f1[i] !== f2[i]) diffs++;
    expect(diffs).toBeGreaterThan(0);
    anim.stop();
  });

  it('stop() ends iteration immediately', async () => {
    const anim = createGolAnimation({ seed: 1 });
    const iter = anim[Symbol.asyncIterator]();
    await iter.next();
    anim.stop();
    const r = await iter.next();
    expect(r.done).toBe(true);
  });
});
