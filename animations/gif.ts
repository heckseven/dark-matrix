import type { Frame } from '../src/lib/frame.js';
import type { Animation } from '../src/lib/animation.js';
import { createFrame } from '../src/lib/frame.js';
import sharp from 'sharp';

export type GifOptions = {
  path: string;
  loop?: boolean;
  mode?: 'bw' | 'gray';
};

export interface GifAnimation extends Animation {
  readonly delays: number[];
}

const FRAME_W = 9;
const FRAME_H = 34;

export async function createGifAnimation(opts: GifOptions): Promise<GifAnimation> {
  if (!/\.gif$/i.test(opts.path)) {
    throw new Error(`Expected a .gif file, got: ${opts.path}`);
  }

  const loop = opts.loop ?? true;
  const mode = opts.mode ?? 'gray';

  const meta = await sharp(opts.path, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  const delays: number[] = meta.delay ?? Array.from({ length: pages }, () => 100);

  const frames: Frame[] = [];

  for (let i = 0; i < pages; i++) {
    const raw = await sharp(opts.path, { animated: false })
      .extract({ left: 0, top: i * FRAME_H, width: FRAME_W, height: FRAME_H })
      .resize(FRAME_W, FRAME_H, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    const frame = createFrame();
    for (let j = 0; j < raw.length && j < frame.length; j++) {
      const v = raw[j] ?? 0;
      frame[j] = mode === 'bw' ? (v >= 128 ? 255 : 0) : v;
    }
    frames.push(frame);
  }

  let stopped = false;

  return {
    delays,

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
          const frame = frames[index++]!;
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
