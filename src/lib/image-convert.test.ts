import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';

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

vi.mock('node:fs/promises', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs/promises')>();
  return { ...orig, realpath: vi.fn() };
});

import { realpath } from 'node:fs/promises';
import { convertImage, renderPreview } from './image-convert.js';
import { createFrame } from './frame.js';

const HOME = os.homedir();

describe('convertImage', () => {
  beforeEach(() => {
    mockPixels = Array(306).fill(100);
    vi.mocked(realpath).mockResolvedValue(`${HOME}/test.png`);
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

  it('bw mode: >= 128 → 255', async () => {
    mockPixels = Array(306).fill(0).map((_, i) => (i % 2 === 0 ? 200 : 50));
    const frame = await convertImage('test.png', { mode: 'bw' });
    // raw[0]=200 → frame[col=0,row=0]=frame[0]=255
    // raw[1]=50  → frame[col=1,row=0]=frame[34]=0
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

  it('rejects paths outside home directory', async () => {
    vi.mocked(realpath).mockResolvedValue('/etc/passwd');
    await expect(convertImage('/etc/passwd')).rejects.toThrow('home directory');
  });

  it('rejects unsupported file extensions', async () => {
    vi.mocked(realpath).mockResolvedValue(`${HOME}/image.svg`);
    await expect(convertImage('image.svg')).rejects.toThrow('Unsupported');
  });

  it('accepts .jpg, .jpeg, .gif extensions', async () => {
    for (const ext of ['.jpg', '.jpeg', '.gif']) {
      vi.mocked(realpath).mockResolvedValue(`${HOME}/img${ext}`);
      await expect(convertImage(`img${ext}`)).resolves.toBeDefined();
    }
  });
});

describe('renderPreview', () => {
  it('returns 17 lines for a 9×34 frame', () => {
    const frame = createFrame();
    const preview = renderPreview(frame);
    const lines = preview.split('\n');
    expect(lines).toHaveLength(17);
  });

  it('each line is 9 characters wide', () => {
    const frame = createFrame();
    for (const line of renderPreview(frame).split('\n')) {
      expect([...line]).toHaveLength(9);
    }
  });

  it('all-dark frame renders as spaces', () => {
    const frame = createFrame(); // all zeros
    for (const line of renderPreview(frame).split('\n')) {
      expect(line).toBe('         ');
    }
  });

  it('all-lit frame renders as block chars', () => {
    const frame = createFrame();
    frame.fill(255);
    for (const line of renderPreview(frame).split('\n')) {
      for (const ch of [...line]) expect(ch).toBe('█');
    }
  });

  it('half-lit column (top half 255, bottom 0) renders ▀ then space', () => {
    const frame = createFrame();
    // col=0, rows 0-16 = 255; rows 17-33 = 0
    for (let row = 0; row < 17; row++) frame[0 * 34 + row] = 255;
    const lines = renderPreview(frame).split('\n');
    // row 0 = chars at r=0: top=frame[0]=255, bot=frame[1]=255 → both lit rows 0,1 → █
    // actually rows 0-16 are lit, so:
    // r=0: top=row0=255, bot=row1=255 → █
    // ...
    // r=8: top=row16=255, bot=row17=0 → ▀
    // r=9-16: top=row18-33=0 → space
    expect(lines[8]![0]).toBe('▀');
    expect(lines[9]![0]).toBe(' ');
  });
});
