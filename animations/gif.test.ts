import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- sharp mock -----------------------------------------------------------

type ChainableMock = {
  metadata: () => Promise<Record<string, unknown>>;
  extract: (opts: unknown) => ChainableMock;
  resize: (w: unknown, h: unknown, opts?: unknown) => ChainableMock;
  grayscale: () => ChainableMock;
  raw: () => ChainableMock;
  toBuffer: () => Promise<Buffer>;
};

let mockMetadata: Record<string, unknown> = {};
let mockPixels: number[] = [];

function makeChain(): ChainableMock {
  const chain: ChainableMock = {
    metadata: () => Promise.resolve(mockMetadata),
    extract: () => chain,
    resize: () => chain,
    grayscale: () => chain,
    raw: () => chain,
    toBuffer: () => Promise.resolve(Buffer.from(mockPixels)),
  };
  return chain;
}

vi.mock('sharp', () => {
  const sharpFn = vi.fn((_path: unknown, _opts?: unknown) => makeChain());
  return { default: sharpFn };
});

// --- tests ----------------------------------------------------------------

import { createGifAnimation } from './gif.js';

describe('createGifAnimation', () => {
  beforeEach(() => {
    // Default: 2-frame GIF, each frame 9*34=306 gray pixels at value 100
    mockMetadata = {
      pages: 2,
      delay: [100, 200],
    };
    mockPixels = Array.from({ length: 306 }, () => 100);
  });

  it('yields Frame objects of length 306', async () => {
    const anim = await createGifAnimation({ path: 'test.gif' });
    const iter = anim[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.done).toBe(false);
    expect(result.value).toHaveLength(306);
  });

  it('each Frame is a Uint8Array', async () => {
    const anim = await createGifAnimation({ path: 'test.gif' });
    const iter = anim[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.value).toBeInstanceOf(Uint8Array);
  });

  it('bw mode: pixel >= 128 becomes 255, else 0', async () => {
    mockPixels = Array.from({ length: 306 }, (_, i) => (i % 2 === 0 ? 200 : 50));
    const anim = await createGifAnimation({ path: 'test.gif', mode: 'bw' });
    const iter = anim[Symbol.asyncIterator]();
    const result = await iter.next();
    const frame = result.value;
    expect(frame[0]).toBe(255); // 200 >= 128
    expect(frame[1]).toBe(0);   // 50 < 128
  });

  it('gray mode: raw pixel values are preserved', async () => {
    mockPixels = Array.from({ length: 306 }, (_, i) => i % 256);
    const anim = await createGifAnimation({ path: 'test.gif', mode: 'gray' });
    const iter = anim[Symbol.asyncIterator]();
    const result = await iter.next();
    const frame = result.value;
    expect(frame[0]).toBe(0);
    expect(frame[1]).toBe(1);
    expect(frame[200]).toBe(200);
  });

  it('stop() causes iterator to return done', async () => {
    const anim = await createGifAnimation({ path: 'test.gif' });
    anim.stop();
    const iter = anim[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.done).toBe(true);
  });

  it('rejects non-GIF path (throws on .png extension)', async () => {
    await expect(createGifAnimation({ path: 'image.png' })).rejects.toThrow();
  });

  it('delays array has correct length (one entry per frame)', async () => {
    const anim = await createGifAnimation({ path: 'test.gif' });
    expect(anim.delays).toHaveLength(2);
    expect(anim.delays[0]).toBe(100);
    expect(anim.delays[1]).toBe(200);
  });
});
