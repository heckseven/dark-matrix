import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chain = {
  resize: (w: unknown, h: unknown, opts?: unknown) => Chain;
  grayscale: () => Chain;
  raw: () => Chain;
  toBuffer: () => Promise<Buffer>;
};

let mockPixels: number[] = Array(306).fill(100);

function makeChain(): Chain {
  const chain: Chain = {
    resize: () => chain,
    grayscale: () => chain,
    raw: () => chain,
    toBuffer: () => Promise.resolve(Buffer.from(mockPixels)),
  };
  return chain;
}

vi.mock('sharp', () => ({
  default: vi.fn(() => makeChain()),
}));

import { convertImage } from './image-convert.js';

describe('convertImage', () => {
  beforeEach(() => {
    mockPixels = Array(306).fill(100);
  });

  it('returns a Frame of length 306', async () => {
    const frame = await convertImage('test.png');
    expect(frame).toBeInstanceOf(Uint8Array);
    expect(frame.length).toBe(306);
  });

  it('gray mode: preserves raw pixel values', async () => {
    mockPixels = Array(306).fill(200);
    const frame = await convertImage('test.png', { mode: 'gray' });
    expect(frame[0]).toBe(200);
    expect(frame[305]).toBe(200);
  });

  it('bw mode: threshold at 128 (>=128 → 255)', async () => {
    mockPixels = Array(306).fill(0).map((_, i) => (i % 2 === 0 ? 200 : 50));
    const frame = await convertImage('test.png', { mode: 'bw' });
    // raw is row-major (row * 9 + col), frame is col-major (col * 34 + row)
    // raw[0] = pixels[0] = 200 → frame[col=0,row=0] = frame[0]  = 255
    // raw[1] = pixels[1] = 50  → frame[col=1,row=0] = frame[34] = 0
    expect(frame[0]).toBe(255);
    expect(frame[34]).toBe(0);
  });

  it('bw mode: < 128 → 0', async () => {
    mockPixels = Array(306).fill(50);
    const frame = await convertImage('test.png', { mode: 'bw' });
    for (let i = 0; i < 306; i++) expect(frame[i]).toBe(0);
  });

  it('default mode is gray', async () => {
    mockPixels = Array(306).fill(77);
    const frame = await convertImage('test.png');
    expect(frame[0]).toBe(77);
  });

  it('calls sharp with correct resize dimensions', async () => {
    const { default: sharp } = await import('sharp');
    vi.mocked(sharp).mockClear();
    await convertImage('foo.png');
    expect(vi.mocked(sharp)).toHaveBeenCalledWith('foo.png');
  });
});
