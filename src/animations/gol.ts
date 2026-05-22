import type { Frame } from '../lib/frame.js';
import type { Animation } from '../lib/animation.js';
import { createFrame } from '../lib/frame.js';

export const LIFE_ALGORITHMS = {
  conway:   { birth: [3],             survival: [2, 3]             },
  highlife: { birth: [3, 6],          survival: [2, 3]             },
  daynight: { birth: [3, 6, 7, 8],    survival: [3, 4, 6, 7, 8]   },
  maze:     { birth: [3],             survival: [1, 2, 3, 4, 5]   },
  coral:    { birth: [3],             survival: [4, 5, 6, 7, 8]   },
  anneal:   { birth: [4, 6, 7, 8],    survival: [3, 5, 6, 7, 8]   },
} as const;

export type LifeAlgorithm = keyof typeof LIFE_ALGORITHMS;

export type GolOptions = {
  seed?: number;        // fixed seed for deterministic start; omit for random
  frames?: number;      // frames per loop iteration, default 420 (matches firmware)
  loop?: boolean;       // default true — re-seed and repeat when frames exhausted
  birth?: readonly number[];     // cells born with these neighbour counts; default [3]
  survival?: readonly number[];  // live cells surviving with these neighbour counts; default [2, 3]
};

const COLS = 9;
const ROWS = 34;

// LCG seeded PRNG — deterministic when seed is provided.
function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

function seedGrid(rng: () => number): Uint8Array {
  const g = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < g.length; i++) g[i] = rng() > 0.5 ? 1 : 0;
  return g;
}

function step(grid: Uint8Array, birth: readonly number[], survival: readonly number[]): Uint8Array {
  const next = new Uint8Array(COLS * ROWS);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      let n = 0;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (dc === 0 && dr === 0) continue;
          const nc = (col + dc + COLS) % COLS;
          const nr = (row + dr + ROWS) % ROWS;
          n += grid[nc * ROWS + nr] ?? 0;
        }
      }
      const alive = (grid[col * ROWS + row] ?? 0) === 1;
      next[col * ROWS + row] = (alive ? survival.includes(n) : birth.includes(n)) ? 1 : 0;
    }
  }
  return next;
}

function toFrame(grid: Uint8Array): Frame {
  const f = createFrame();
  for (let i = 0; i < grid.length; i++) f[i] = (grid[i] ?? 0) ? 255 : 0;
  return f;
}

export function createGolAnimation(opts?: GolOptions): Animation {
  const totalFrames = opts?.frames ?? 420;
  const loop = opts?.loop ?? true;
  const birth: readonly number[] = opts?.birth ?? [3];
  const survival: readonly number[] = opts?.survival ?? [2, 3];
  const rng = makePrng(opts?.seed ?? (Math.random() * 0xffffffff) >>> 0);

  let grid = seedGrid(rng);
  let stopped = false;

  return {
    [Symbol.asyncIterator]() {
      let count = 0;
      return {
        async next(): Promise<IteratorResult<Frame>> {
          if (stopped) return { value: undefined as never, done: true as const };
          if (count >= totalFrames) {
            if (!loop) return { value: undefined as never, done: true as const };
            grid = seedGrid(rng);
            count = 0;
          }
          const frame = toFrame(grid);
          grid = step(grid, birth, survival);
          count++;
          return { value: frame, done: false as const };
        },
      };
    },
    stop() { stopped = true; },
  };
}
