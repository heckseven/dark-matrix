import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type AudioStyle = 'eq-bars' | 'spectrum-mirror' | 'vu-meter' | 'bounce' | 'waterfall' | 'fire' | 'sparks' | 'flame-bars';

export const AUDIO_STYLES: { id: AudioStyle; label: string }[] = [
  { id: 'eq-bars',         label: 'eq bars' },
  { id: 'spectrum-mirror', label: 'spectrum mirror' },
  { id: 'vu-meter',        label: 'vu meter' },
  { id: 'bounce',          label: 'bounce' },
  { id: 'waterfall',       label: 'waterfall' },
  { id: 'fire',            label: 'fire' },
  { id: 'sparks',          label: 'sparks' },
  { id: 'flame-bars',      label: 'flame bars' },
];

export type RenderCtx = {
  bands: number[];
  fftSize: number;
  gain: number;
};

type Renderer = (ctx: RenderCtx) => Frame;

const BAND_COUNT = 9;
const ROWS = 34;
const MIN_DB = -60;

function dbLevel(mag: number, gain: number, ref: number): number {
  const m = mag * gain;
  const db = m > 0 ? 20 * Math.log10(m / ref) : MIN_DB;
  return Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB));
}

function eqBars(): Renderer {
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const t = dbLevel(bands[col] ?? 0, gain, ref);
      const height = Math.round(t * ROWS);
      for (let row = 0; row < ROWS; row++) {
        frame[col * ROWS + row] = row >= ROWS - height ? 255 : 0;
      }
    }
    return frame;
  };
}

function spectrumMirror(): Renderer {
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const center = Math.floor(ROWS / 2);
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const t = dbLevel(bands[col] ?? 0, gain, ref);
      const halfH = Math.round(t * center);
      for (let row = 0; row < ROWS; row++) {
        frame[col * ROWS + row] = Math.abs(row - center) <= halfH ? 255 : 0;
      }
    }
    return frame;
  };
}

function vuMeter(): Renderer {
  let peak = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const height = Math.round(t * ROWS);
    peak = Math.max(t, peak * 0.98);
    const peakRow = ROWS - 1 - Math.round(peak * (ROWS - 1));
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      for (let row = 0; row < ROWS; row++) {
        frame[col * ROWS + row] = (row >= ROWS - height || (row === peakRow && peak > t)) ? 255 : 0;
      }
    }
    return frame;
  };
}

function bounce(): Renderer {
  const positions = new Float32Array(BAND_COUNT);
  const velocities = new Float32Array(BAND_COUNT);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const t = dbLevel(bands[col] ?? 0, gain, ref);
      const target = t * (ROWS - 1);
      if (target > (positions[col] ?? 0)) {
        positions[col] = target;
        velocities[col] = 0;
      } else {
        velocities[col] = (velocities[col] ?? 0) - 0.5;
        positions[col] = Math.max(0, (positions[col] ?? 0) + (velocities[col] ?? 0));
      }
      const ballRow = Math.max(0, Math.min(ROWS - 1, ROWS - 1 - Math.round(positions[col] ?? 0)));
      frame[col * ROWS + ballRow] = 255;
    }
    return frame;
  };
}

function waterfall(): Renderer {
  const history: Uint8Array[] = Array.from({ length: ROWS }, () => new Uint8Array(BAND_COUNT));
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const newRow = new Uint8Array(BAND_COUNT);
    for (let b = 0; b < BAND_COUNT; b++) {
      newRow[b] = Math.round(dbLevel(bands[b] ?? 0, gain, ref) * 255);
    }
    history.shift();
    history.push(newRow);
    const frame = createFrame();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < BAND_COUNT; col++) {
        frame[col * ROWS + row] = history[row]?.[col] ?? 0;
      }
    }
    return frame;
  };
}

function fire(): Renderer {
  const heat = new Float32Array(BAND_COUNT * ROWS);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    for (let col = 0; col < BAND_COUNT; col++) {
      heat[col * ROWS + (ROWS - 1)] = dbLevel(bands[col] ?? 0, gain, ref);
    }
    for (let row = 0; row < ROWS - 1; row++) {
      for (let col = 0; col < BAND_COUNT; col++) {
        const below  = heat[col * ROWS + row + 1] ?? 0;
        const belowL = heat[Math.max(0, col - 1) * ROWS + row + 1] ?? 0;
        const belowR = heat[Math.min(BAND_COUNT - 1, col + 1) * ROWS + row + 1] ?? 0;
        heat[col * ROWS + row] = ((below + belowL + belowR) / 3) * 0.91;
      }
    }
    const frame = createFrame();
    for (let i = 0; i < BAND_COUNT * ROWS; i++) {
      frame[i] = Math.min(255, Math.round((heat[i] ?? 0) * 255));
    }
    return frame;
  };
}

function sparks(): Renderer {
  // Sparse pixels spawn at the bottom with probability = band energy,
  // then scroll upward one row per frame — like embers rising.
  const grid = new Uint8Array(BAND_COUNT * ROWS);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    // Shift all rows up by one (row 0 is discarded)
    for (let row = 0; row < ROWS - 1; row++) {
      for (let col = 0; col < BAND_COUNT; col++) {
        grid[col * ROWS + row] = grid[col * ROWS + row + 1] ?? 0;
      }
    }
    // Spawn bottom row: pixel lit with probability = band energy
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      grid[col * ROWS + (ROWS - 1)] = Math.random() < energy ? 255 : 0;
    }
    const frame = createFrame();
    for (let i = 0; i < BAND_COUNT * ROWS; i++) frame[i] = grid[i] ?? 0;
    return frame;
  };
}

function flameBars(): Renderer {
  // Smooth envelope (fast attack, slow release) with per-frame random flicker.
  const envelope = new Float32Array(BAND_COUNT);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const t = dbLevel(bands[col] ?? 0, gain, ref);
      envelope[col] = t > (envelope[col] ?? 0)
        ? t
        : (envelope[col] ?? 0) * 0.85 + t * 0.15;
      // Flicker: random height between 70% and 120% of envelope
      const flicker = (envelope[col] ?? 0) * (0.7 + Math.random() * 0.5);
      const height = Math.round(Math.min(1, flicker) * ROWS);
      for (let row = 0; row < ROWS; row++) {
        frame[col * ROWS + row] = row >= ROWS - height ? 255 : 0;
      }
    }
    return frame;
  };
}

const FACTORIES: Record<AudioStyle, () => Renderer> = {
  'eq-bars':         eqBars,
  'spectrum-mirror': spectrumMirror,
  'vu-meter':        vuMeter,
  'bounce':          bounce,
  'waterfall':       waterfall,
  'fire':            fire,
  'sparks':          sparks,
  'flame-bars':      flameBars,
};

export function createRenderer(style: AudioStyle): Renderer {
  return FACTORIES[style]();
}
