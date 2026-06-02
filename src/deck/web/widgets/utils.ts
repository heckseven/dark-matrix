// Shared pixel helpers for browser widget descriptors.
// These mirror the local helpers in HudInspector.tsx; widget files import
// from here rather than duplicating them.

export const COLS = 9;
export const ROWS = 34;
export const EMPTY_PIXELS = btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));

const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;

export function bwToB64(frame: Uint8Array): string {
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

export function bayerToB64(frame: Uint8Array): string {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
      out[col * ROWS + row] = (frame[col * ROWS + row] ?? 0) > threshold ? 255 : 0;
    }
  }
  return btoa(String.fromCharCode(...out));
}

export function mirrorFrame(frame: Uint8Array): Uint8Array {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    const src = COLS - 1 - col;
    for (let row = 0; row < ROWS; row++) {
      out[col * ROWS + row] = frame[src * ROWS + row] ?? 0;
    }
  }
  return out;
}

// Bayer-dither a frame to a Uint8Array (0|255 per pixel), same as HudDualPreview
export function bayerDitherToUint8(frame: Uint8Array): Uint8Array {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
      out[col * ROWS + row] = (frame[col * ROWS + row] ?? 0) > threshold ? 255 : 0;
    }
  }
  return out;
}
