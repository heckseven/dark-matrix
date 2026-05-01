import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Frame } from '../lib/frame.js';
import type { Animation } from '../lib/animation.js';
import { createFrame } from '../lib/frame.js';

const require = createRequire(import.meta.url);
const FFT = require('fft.js') as typeof import('fft.js');

export type AudioSource = 'monitor' | 'mic';

export type AudioEqOptions = {
  source?: AudioSource;
  loop?: boolean;
  fftSize?: number;
  gain?: number;
};

export interface AudioEqAnimation extends Animation {
  readonly source: AudioSource;
}

const MONITOR_NODE = 'alsa_output.pci-0000_c5_00.6.analog-stereo.monitor';
const MIC_NODE = 'alsa_input.pci-0000_c5_00.6.analog-stereo';

const BAND_EDGES = [20, 60, 120, 250, 500, 1000, 2000, 6000, 14000, 20000];
const BAND_COUNT = 9;
const ROWS = 34;
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

function buildFrame(bands: number[], gain: number, fftSize: number): Frame {
  const normFactor = fftSize / 2;
  const frame = createFrame();

  for (let col = 0; col < BAND_COUNT; col++) {
    const mag = bands[col] ?? 0;
    const height = Math.min(ROWS, Math.round((mag * gain * ROWS) / normFactor));

    for (let row = 0; row < ROWS; row++) {
      frame[col * ROWS + row] = row >= ROWS - height ? 255 : 0;
    }
  }

  return frame;
}

export function createAudioEqAnimation(opts?: AudioEqOptions): AudioEqAnimation {
  const source = opts?.source ?? 'monitor';
  const fftSize = opts?.fftSize ?? 2048;
  const gain = opts?.gain ?? 1.0;

  const targetNode = source === 'monitor' ? MONITOR_NODE : MIC_NODE;

  let stopped = false;
  let resolveChunk: ((frame: Frame | null) => void) | null = null;
  const pendingFrames: Frame[] = [];
  let buffer = Buffer.alloc(0);
  let procClosed = false;

  const proc = spawn(
    'pw-record',
    ['--target', targetNode, '--format=s16', '--rate=48000', '--channels=1', '-'],
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

      const bands = computeBandMagnitudes(out, fftSize);
      const frame = buildFrame(bands, gain, fftSize);

      if (resolveChunk) {
        const resolve = resolveChunk;
        resolveChunk = null;
        resolve(frame);
      } else {
        pendingFrames.push(frame);
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
    source,

    [Symbol.asyncIterator](): AsyncIterator<Frame> {
      return {
        async next(): Promise<IteratorResult<Frame>> {
          if (stopped || procClosed) {
            return { value: undefined as unknown as Frame, done: true };
          }

          if (pendingFrames.length > 0) {
            return { value: pendingFrames.shift()!, done: false };
          }

          const frame = await new Promise<Frame | null>(resolve => {
            resolveChunk = resolve;
          });

          if (frame === null || stopped) {
            return { value: undefined as unknown as Frame, done: true };
          }

          return { value: frame, done: false };
        },
      };
    },

    stop(): void {
      stopped = true;
      proc.kill();
      if (resolveChunk) {
        const resolve = resolveChunk;
        resolveChunk = null;
        resolve(null);
      }
    },
  };
}
