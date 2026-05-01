import type { Frame } from '../src/lib/frame.js';
import type { Animation } from '../src/lib/animation.js';

export type ImageOptions = {
  loop?: boolean; // default true
};

export function createImageAnimation(frame: Frame, opts?: ImageOptions): Animation {
  const loop = opts?.loop ?? true;
  let stopped = false;

  return {
    [Symbol.asyncIterator](): AsyncIterator<Frame> {
      let done = false;
      return {
        async next(): Promise<IteratorResult<Frame>> {
          if (stopped || done) return { value: undefined as unknown as Frame, done: true };
          if (!loop) done = true;
          return { value: frame, done: false };
        },
      };
    },
    stop() {
      stopped = true;
    },
  };
}
