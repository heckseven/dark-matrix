import { describe, it, expect } from 'vitest';
import {
  FRAME_COLS, FRAME_ROWS, FRAME_SIZE,
  createFrame, setPixel, getPixel, packBW, cloneFrame, toGrayColumns,
} from './frame.js';

describe('createFrame', () => {
  it('returns Uint8Array of length 306', () => {
    const f = createFrame();
    expect(f).toBeInstanceOf(Uint8Array);
    expect(f.length).toBe(FRAME_SIZE);
  });

  it('is zeroed', () => {
    const f = createFrame();
    expect(f.every((v) => v === 0)).toBe(true);
  });
});

describe('setPixel / getPixel', () => {
  it('round-trips for all corners', () => {
    const f = createFrame();
    const corners = [
      [0, 0], [FRAME_COLS - 1, 0],
      [0, FRAME_ROWS - 1], [FRAME_COLS - 1, FRAME_ROWS - 1],
    ] as const;
    corners.forEach(([c, r], i) => {
      setPixel(f, c, r, i * 50 + 1);
      expect(getPixel(f, c, r)).toBe(i * 50 + 1);
    });
  });

  it('round-trips center pixel', () => {
    const f = createFrame();
    setPixel(f, 4, 17, 200);
    expect(getPixel(f, 4, 17)).toBe(200);
  });

  it('setPixel throws RangeError for col=9', () => {
    expect(() => setPixel(createFrame(), 9, 0, 0)).toThrow(RangeError);
  });

  it('setPixel throws RangeError for row=34', () => {
    expect(() => setPixel(createFrame(), 0, 34, 0)).toThrow(RangeError);
  });

  it('getPixel throws RangeError for out-of-bounds', () => {
    expect(() => getPixel(createFrame(), -1, 0)).toThrow(RangeError);
  });
});

describe('packBW', () => {
  it('all-zero frame → 39 zero bytes', () => {
    const out = packBW(createFrame());
    expect(out.length).toBe(39);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('all-255 frame → first 38 bytes 0xFF, last byte 0x03 (306 % 8 = 2 remainder bits)', () => {
    const f = createFrame().fill(255) as ReturnType<typeof createFrame>;
    const out = packBW(f);
    expect(out.length).toBe(39);
    expect(out.slice(0, 38).every((v) => v === 0xff)).toBe(true);
    expect(out[38]).toBe(0x03); // only pixels 304 and 305 (bits 0 and 1)
  });

  it('single pixel at (0,0) → first byte bit 0 set (0x01)', () => {
    const f = createFrame();
    setPixel(f, 0, 0, 255);
    const out = packBW(f);
    expect(out[0]).toBe(0x01);
    expect(out.slice(1).every((v) => v === 0)).toBe(true);
  });

  it('single pixel at (0,7) → first byte bit 7 set (0x80)', () => {
    const f = createFrame();
    setPixel(f, 0, 7, 255);
    const out = packBW(f);
    expect(out[0]).toBe(0x80);
  });

  it('single pixel at (0,8) → second byte bit 0 set', () => {
    const f = createFrame();
    setPixel(f, 0, 8, 255);
    const out = packBW(f);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0x01);
  });
});

describe('cloneFrame', () => {
  it('produces equal but independent copy', () => {
    const f = createFrame();
    setPixel(f, 3, 10, 99);
    const g = cloneFrame(f);
    expect(Array.from(g)).toEqual(Array.from(f));
    setPixel(f, 3, 10, 0);
    expect(getPixel(g, 3, 10)).toBe(99); // independent
  });
});

describe('toGrayColumns', () => {
  it('returns array of length 9', () => {
    expect(toGrayColumns(createFrame())).toHaveLength(9);
  });

  it('each column is 34 bytes', () => {
    toGrayColumns(createFrame()).forEach((col) => expect(col.length).toBe(34));
  });

  it('column values match source frame', () => {
    const f = createFrame();
    setPixel(f, 2, 5, 77);
    const cols = toGrayColumns(f);
    expect(cols[2]![5]).toBe(77);
  });
});
