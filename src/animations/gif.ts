import type { Frame } from '../lib/frame.js';
import type { Animation } from '../lib/animation.js';
import { createFrame } from '../lib/frame.js';
import sharp from 'sharp';

export type GifFit = 'contain' | 'cover' | 'fill';

export type GifOptions = {
  path: string;
  loop?: boolean;
  mode?: 'bw' | 'gray';
  fit?: GifFit;
  dual?: boolean;
};

export interface GifAnimation extends Animation {
  readonly delays: number[];
  readonly dual: boolean;
}

const FRAME_W = 9;
const FRAME_H = 34;

export async function createGifAnimation(opts: GifOptions): Promise<GifAnimation> {
  if (!/\.gif$/i.test(opts.path)) {
    throw new Error(`Expected a .gif file, got: ${opts.path}`);
  }

  const loop = opts.loop ?? true;
  const mode = opts.mode ?? 'gray';
  const fit = opts.fit ?? 'contain';
  const dual = opts.dual ?? false;
  const outW = dual ? FRAME_W * 2 : FRAME_W;

  const meta = await sharp(opts.path, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  const delays: number[] = meta.delay ?? Array.from({ length: pages }, () => 100);

  // sharp with animated:true resizes each frame independently and stacks them in raw output
  const stacked = await sharp(opts.path, { animated: true })
    .resize(outW, FRAME_H, { fit, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .grayscale()
    .raw()
    .toBuffer();

  const bytesPerFrame = outW * FRAME_H;
  // Store as plain Uint8Arrays; dual frames are 18×34, single are 9×34
  const frames: Uint8Array[] = [];

  for (let i = 0; i < pages; i++) {
    const slice = stacked.subarray(i * bytesPerFrame, (i + 1) * bytesPerFrame);
    const buf = new Uint8Array(bytesPerFrame);
    for (let row = 0; row < FRAME_H; row++) {
      for (let col = 0; col < outW; col++) {
        const v = slice[row * outW + col] ?? 0;
        buf[col * FRAME_H + row] = mode === 'bw' ? (v >= 128 ? 255 : 0) : v;
      }
    }
    frames.push(buf);
  }

  let stopped = false;

  return {
    delays,
    dual,

    [Symbol.asyncIterator](): AsyncIterator<Frame> {
      let index = 0;

      return {
        async next(): Promise<IteratorResult<Frame>> {
          if (stopped) return { value: undefined as unknown as Frame, done: true };
          if (index >= frames.length) {
            if (!loop) return { value: undefined as unknown as Frame, done: true };
            index = 0;
          }
          if (stopped) return { value: undefined as unknown as Frame, done: true };
          // Cast to Frame — single frames are 9×34, dual are 18×34 (daemon handles split)
          const frame = frames[index++] as unknown as Frame;
          return { value: frame, done: false };
        },

        async return(): Promise<IteratorResult<Frame>> {
          stopped = true;
          return { value: undefined as unknown as Frame, done: true };
        },
      };
    },

    stop(): void {
      stopped = true;
    },
  };
}
