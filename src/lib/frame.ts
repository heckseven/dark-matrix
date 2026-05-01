export const FRAME_COLS = 9;
export const FRAME_ROWS = 34;
export const FRAME_SIZE = FRAME_COLS * FRAME_ROWS; // 306

export type Frame = Uint8Array & { readonly _brand: 'Frame' };

export function createFrame(): Frame {
  return new Uint8Array(FRAME_SIZE) as Frame;
}

export function setPixel(f: Frame, col: number, row: number, value: number): void {
  if (col < 0 || col >= FRAME_COLS || row < 0 || row >= FRAME_ROWS) {
    throw new RangeError(`Pixel (${col}, ${row}) out of bounds (${FRAME_COLS}x${FRAME_ROWS})`);
  }
  f[col * FRAME_ROWS + row] = value;
}

export function getPixel(f: Frame, col: number, row: number): number {
  if (col < 0 || col >= FRAME_COLS || row < 0 || row >= FRAME_ROWS) {
    throw new RangeError(`Pixel (${col}, ${row}) out of bounds (${FRAME_COLS}x${FRAME_ROWS})`);
  }
  return f[col * FRAME_ROWS + row] ?? 0;
}

// Pack 306 pixels into 39 bytes, LSB-first.
// Bit index i = col * FRAME_ROWS + row (column-major).
// Byte = i >> 3, bit position = i & 7.
export function packBW(f: Frame): Uint8Array {
  const out = new Uint8Array(39);
  for (let i = 0; i < FRAME_SIZE; i++) {
    if ((f[i] ?? 0) >= 128) {
      out[i >> 3]! |= 1 << (i & 7);
    }
  }
  return out;
}

export function cloneFrame(f: Frame): Frame {
  return new Uint8Array(f) as Frame;
}

// Returns 9 column buffers of 34 bytes each for SendCol commands.
export function toGrayColumns(f: Frame): Uint8Array[] {
  return Array.from({ length: FRAME_COLS }, (_, col) =>
    f.slice(col * FRAME_ROWS, (col + 1) * FRAME_ROWS),
  );
}
