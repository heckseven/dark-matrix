export const FRAME_COLS = 9;
export const FRAME_ROWS = 34;
export const FRAME_SIZE = FRAME_COLS * FRAME_ROWS;
export type Frame = Uint8Array & { readonly _brand: 'Frame' };
