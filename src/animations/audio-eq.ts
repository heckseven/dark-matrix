import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Frame } from '../lib/frame.js';
import type { Animation } from '../lib/animation.js';
import { createRenderer } from './audio-renderers.js';
import type { AudioStyle, RenderCtx } from './audio-renderers.js';

export type { AudioStyle };

const require = createRequire(import.meta.url);
const FFT = require('fft.js') as typeof import('fft.js');

export type AudioSource = 'monitor' | 'mic';

export type AudioEqOptions = {
  source?: AudioSource;
  loop?: boolean;
  fftSize?: number;
  gain?: number;
  target?: string;  // pw-record --target override (resolved node ID)
  style?: AudioStyle;
  fullBandCount?: number;
};

export interface AudioEqAnimation extends Animation {
  readonly source: AudioSource;
}

// Internal type — not exported; fullBands is only for browser preview, not hardware
export interface BandCtx extends RenderCtx {
  fullBands?: number[];
}

const BAND_EDGES = [20, 60, 120, 250, 500, 1000, 2000, 6000, 14000, 20000];
const BAND_COUNT = 9;
const SAMPLE_RATE = 48000;

function computeBandMagnitudes(
  out: number[],
  fftSize: number,
): number[] {
  const half = fftSize / 2;
  const bands = new Array<number>(BAND_COUNT).fill(0);
  const counts = new Array<number>(BAND_COUNT).fill(0);

  for (let k = 1; k <= half; k++) {
    const freq = (k * SAMPLE_RATE) / fftSize;
    const mag = Math.sqrt((out[2 * k] ?? 0) ** 2 + (out[2 * k + 1] ?? 0) ** 2);

    for (let b = 0; b < BAND_COUNT; b++) {
      const lo = BAND_EDGES[b] ?? 0;
      const hi = BAND_EDGES[b + 1] ?? Infinity;
      if (freq >= lo && freq < hi) {
        bands[b] = (bands[b] ?? 0) + mag;
        counts[b] = (counts[b] ?? 0) + 1;
        break;
      }
    }
  }

  for (let b = 0; b < BAND_COUNT; b++) {
    const c = counts[b] ?? 0;
    bands[b] = c > 0 ? (bands[b] ?? 0) / c : 0;
  }

  return bands;
}

// Log-spaced N-band computation for fullscreen browser preview.
// Hardware always uses computeBandMagnitudes (9 fixed bands) — this is additive.
function computeBandsN(out: number[], fftSize: number, n: number): number[] {
  n = Math.max(1, Math.min(512, Math.floor(n)));
  const half = fftSize / 2;
  const bands = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);
  const logMin = Math.log10(20);
  const logMax = Math.log10(20000);
  const edges = Array.from({ length: n + 1 }, (_, i) =>
    Math.pow(10, logMin + (i / n) * (logMax - logMin)));

  for (let k = 1; k <= half; k++) {
    const freq = (k * SAMPLE_RATE) / fftSize;
    const mag = Math.sqrt((out[2 * k] ?? 0) ** 2 + (out[2 * k + 1] ?? 0) ** 2);
    for (let b = 0; b < n; b++) {
      const lo = edges[b] ?? 0;
      const hi = edges[b + 1] ?? Infinity;
      if (freq >= lo && freq < hi) {
        bands[b] = (bands[b] ?? 0) + mag;
        counts[b] = (counts[b] ?? 0) + 1;
        break;
      }
    }
  }

  for (let b = 0; b < n; b++) {
    const c = counts[b] ?? 0;
    bands[b] = c > 0 ? (bands[b] ?? 0) / c : 0;
  }

  return bands;
}

interface BandStream {
  [Symbol.asyncIterator](): AsyncIterator<BandCtx>;
  stop(): void;
  setFullBandCount(n: number): void;
}

export function createAudioBandStream(opts?: Omit<AudioEqOptions, 'style'>): BandStream {
  const fftSize = opts?.fftSize ?? 2048;
  const gain = opts?.gain ?? 1.0;
  // PulseAudio target syntax. ffmpeg's pulse input honors sink-monitor names
  // like "<sink>.monitor"; pw-record's --target is overridden by WirePlumber's
  // auto-link policy and silently routes monitor requests to the mic instead.
  const pulseTarget = opts?.target ?? 'default';

  let stopped = false;
  let resolveChunk: ((ctx: BandCtx | null) => void) | null = null;
  const pending: BandCtx[] = [];
  let buffer = Buffer.alloc(0);
  let procClosed = false;
  let currentFullBandCount = opts?.fullBandCount ?? 0;

  const proc = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-f', 'pulse', '-i', pulseTarget,
      '-ac', '1', '-ar', '48000', '-f', 's16le', '-',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );

  const fft = new FFT(fftSize);

  function processBuffer() {
    const windowBytes = fftSize * 2;
    while (buffer.length >= windowBytes) {
      const window = buffer.subarray(0, windowBytes);
      buffer = buffer.subarray(windowBytes);

      const samples = new Array<number>(fftSize);
      for (let i = 0; i < fftSize; i++) {
        const raw = window.readInt16LE(i * 2);
        samples[i] = raw / 32768;
      }

      const out = fft.createComplexArray() as number[];
      fft.realTransform(out, samples);
      fft.completeSpectrum(out);

      const n = currentFullBandCount;
      const ctx: BandCtx = {
        bands: computeBandMagnitudes(out, fftSize),
        fftSize,
        gain,
        ...(n > 0 ? { fullBands: computeBandsN(out, fftSize, n) } : {}),
      };

      if (resolveChunk) {
        const resolve = resolveChunk;
        resolveChunk = null;
        resolve(ctx);
      } else {
        pending.push(ctx);
      }
    }
  }

  proc.stdout.on('data', (chunk: Buffer) => {
    if (stopped) return;
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  });

  proc.on('close', () => {
    procClosed = true;
    if (resolveChunk) {
      const resolve = resolveChunk;
      resolveChunk = null;
      resolve(null);
    }
  });

  return {
    [Symbol.asyncIterator](): AsyncIterator<BandCtx> {
      return {
        async next(): Promise<IteratorResult<BandCtx>> {
          if (stopped || procClosed) return { value: undefined as unknown as BandCtx, done: true };
          if (pending.length > 0) return { value: pending.shift()!, done: false };
          const ctx = await new Promise<BandCtx | null>(resolve => { resolveChunk = resolve; });
          if (ctx === null || stopped) return { value: undefined as unknown as BandCtx, done: true };
          return { value: ctx, done: false };
        },
      };
    },
    stop() {
      stopped = true;
      proc.kill();
      if (resolveChunk) {
        const resolve = resolveChunk;
        resolveChunk = null;
        resolve(null);
      }
    },
    setFullBandCount(n: number) {
      currentFullBandCount = n;
    },
  };
}

export function createAudioEqAnimation(opts?: AudioEqOptions): AudioEqAnimation {
  const source = opts?.source ?? 'monitor';
  const style = opts?.style ?? 'dark-matter';
  const renderer = createRenderer(style);
  const bandStream = createAudioBandStream(opts);
  const iter = bandStream[Symbol.asyncIterator]();

  return {
    source,

    [Symbol.asyncIterator](): AsyncIterator<Frame> {
      return {
        async next(): Promise<IteratorResult<Frame>> {
          const result = await iter.next();
          if (result.done) return { value: undefined as unknown as Frame, done: true };
          return { value: renderer(result.value), done: false };
        },
      };
    },

    stop(): void { bandStream.stop(); },
  };
}
