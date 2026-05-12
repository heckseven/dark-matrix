import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type AudioStyle = 'eq-bars' | 'vu-meter' | 'bounce' | 'waterfall' | 'sparks' | 'flame-bars' | 'vu-sparks' | 'dark-matter' | 'spectrum-fall' | 'cascade' | 'cipher' | 'wake' | 'wake-transient' | 'wake-multi';

export const AUDIO_STYLES: { id: AudioStyle; label: string }[] = [
  { id: 'dark-matter',     label: 'dark matter' },
  { id: 'cascade',         label: 'cascade' },
  { id: 'cipher',          label: 'cipher' },
  { id: 'wake',            label: 'wake' },
  { id: 'wake-transient',  label: 'wake transient' },
  { id: 'wake-multi',      label: 'wake multi' },
  { id: 'eq-bars',         label: 'eq bars' },
  { id: 'spectrum-fall',   label: 'spectrum fall' },
  { id: 'vu-meter',        label: 'vu meter' },
  { id: 'vu-sparks',       label: 'vu sparks' },
  { id: 'bounce',          label: 'bounce' },
  { id: 'waterfall',       label: 'waterfall' },
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
      const t = dbLevel(bands[BAND_COUNT - 1 - col] ?? 0, gain, ref);
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

function vuSparks(): Renderer {
  let peak = 0;
  const grid = new Uint8Array(BAND_COUNT * ROWS);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const height = Math.round(t * ROWS);
    peak = Math.max(t, peak * 0.98);
    const peakRow = ROWS - 1 - Math.round(peak * (ROWS - 1));
    for (let row = 0; row < ROWS - 1; row++) {
      for (let col = 0; col < BAND_COUNT; col++) {
        grid[col * ROWS + row] = grid[col * ROWS + row + 1] ?? 0;
      }
    }
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      grid[col * ROWS + (ROWS - 1)] = Math.random() < energy ? 255 : 0;
    }
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      for (let row = 0; row < ROWS; row++) {
        if (row === peakRow && peak > t) { frame[col * ROWS + row] = 255; continue; }
        if (row >= ROWS - height) {
          frame[col * ROWS + row] = (grid[col * ROWS + row] ?? 0) > 0 ? 0 : 255;
        }
      }
    }
    return frame;
  };
}

function eqSparks(): Renderer {
  const peaks = new Float32Array(BAND_COUNT);
  const grid = new Uint8Array(BAND_COUNT * ROWS);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    for (let row = 0; row < ROWS - 1; row++) {
      for (let col = 0; col < BAND_COUNT; col++) {
        grid[col * ROWS + row] = grid[col * ROWS + row + 1] ?? 0;
      }
    }
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      grid[col * ROWS + (ROWS - 1)] = Math.random() < energy ? 255 : 0;
    }
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const t = dbLevel(bands[col] ?? 0, gain, ref);
      const height = Math.round(t * ROWS);
      peaks[col] = Math.max(t, (peaks[col] ?? 0) * 0.98);
      const peakRow = ROWS - 1 - Math.round((peaks[col] ?? 0) * (ROWS - 1));
      for (let row = 0; row < ROWS; row++) {
        if (row === peakRow && (peaks[col] ?? 0) > t) { frame[col * ROWS + row] = 255; continue; }
        if (row >= ROWS - height) {
          frame[col * ROWS + row] = (grid[col * ROWS + row] ?? 0) > 0 ? 0 : 255;
        }
      }
    }
    return frame;
  };
}

function spectrumFall(): Renderer {
  const history: Uint8Array[] = Array.from({ length: ROWS }, () => new Uint8Array(BAND_COUNT));
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const center = Math.floor(ROWS / 2);
    const newRow = new Uint8Array(BAND_COUNT);
    for (let b = 0; b < BAND_COUNT; b++) {
      newRow[b] = Math.round(dbLevel(bands[b] ?? 0, gain, ref) * 255);
    }
    history.shift();
    history.push(newRow);
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const t = dbLevel(bands[col] ?? 0, gain, ref);
      const halfH = Math.round(t * center);
      for (let row = 0; row < ROWS; row++) {
        if (Math.abs(row - center) <= halfH) {
          frame[col * ROWS + row] = 255 - (history[row]?.[col] ?? 0);
        }
      }
    }
    return frame;
  };
}

type Drop = { pos: number; speed: number };

function cascade(): Renderer {
  const drops: Drop[][] = Array.from({ length: BAND_COUNT }, () => []);
  const TRAIL = 9;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      if ((drops[col]?.length ?? 0) < 3 && Math.random() < energy * 0.18) {
        drops[col]!.push({ pos: 0, speed: 0.4 + energy * 2.0 });
      }
      drops[col] = (drops[col] ?? []).filter(drop => {
        drop.pos += drop.speed;
        const head = Math.round(drop.pos);
        for (let t = 0; t < TRAIL; t++) {
          const r = head - t;
          if (r >= 0 && r < ROWS) {
            const v = Math.round(255 * Math.pow(0.65, t));
            const idx = col * ROWS + r;
            frame[idx] = Math.max(frame[idx] ?? 0, v);
          }
        }
        return drop.pos < ROWS + TRAIL;
      });
    }
    return frame;
  };
}

function cipher(): Renderer {
  const state = new Float32Array(BAND_COUNT * ROWS);
  for (let i = 0; i < state.length; i++) state[i] = Math.random();
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      const flipRate = energy * 0.35;
      const decay = 0.94 - energy * 0.1;
      for (let row = 0; row < ROWS; row++) {
        const idx = col * ROWS + row;
        if (Math.random() < flipRate) {
          state[idx] = Math.random() < energy ? 1 : 0;
        } else {
          state[idx] = (state[idx] ?? 0) * decay;
        }
        frame[idx] = Math.round((state[idx] ?? 0) * 255);
      }
    }
    return frame;
  };
}

function wake(): Renderer {
  let scanPos = 0;
  let holdFrames = 0;
  const glow = new Float32Array(BAND_COUNT * ROWS);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    if (holdFrames > 0) {
      holdFrames--;
    } else {
      scanPos += 0.3 + t * 2.5;
      if (scanPos >= ROWS) { scanPos = 0; holdFrames = 15; }
      const sr = Math.min(ROWS - 1, Math.round(scanPos));
      for (let col = 0; col < BAND_COUNT; col++) {
        glow[col * ROWS + sr] = dbLevel(bands[col] ?? 0, gain, ref);
      }
    }
    for (let i = 0; i < BAND_COUNT * ROWS; i++) glow[i] = (glow[i] ?? 0) * 0.88;
    const frame = createFrame();
    for (let i = 0; i < BAND_COUNT * ROWS; i++) {
      frame[i] = Math.min(255, Math.round((glow[i] ?? 0) * 255));
    }
    return frame;
  };
}

function wakeTransient(): Renderer {
  let scanPos: number | null = null;
  let smoothed = 0;
  const glow = new Float32Array(BAND_COUNT * ROWS);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = smoothed * 0.85 + t * 0.15;
    if (scanPos === null && delta > 0.12) scanPos = 0;
    if (scanPos !== null) {
      scanPos += 0.5 + t * 2.0;
      if (scanPos >= ROWS) {
        scanPos = null;
      } else {
        const sr = Math.round(scanPos);
        for (let col = 0; col < BAND_COUNT; col++) {
          glow[col * ROWS + sr] = dbLevel(bands[col] ?? 0, gain, ref);
        }
      }
    }
    for (let i = 0; i < BAND_COUNT * ROWS; i++) glow[i] = (glow[i] ?? 0) * 0.88;
    const frame = createFrame();
    for (let i = 0; i < BAND_COUNT * ROWS; i++) {
      frame[i] = Math.min(255, Math.round((glow[i] ?? 0) * 255));
    }
    return frame;
  };
}

function wakeMulti(): Renderer {
  const waves: number[] = [];
  let smoothed = 0;
  let cooldown = 0;
  const glow = new Float32Array(BAND_COUNT * ROWS);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = smoothed * 0.85 + t * 0.15;
    if (cooldown > 0) cooldown--;
    if (delta > 0.12 && cooldown === 0) { waves.push(0); cooldown = 8; }
    for (let w = waves.length - 1; w >= 0; w--) {
      waves[w]! += 0.5 + t * 2.0;
      if (waves[w]! >= ROWS) {
        waves.splice(w, 1);
      } else {
        const sr = Math.round(waves[w]!);
        for (let col = 0; col < BAND_COUNT; col++) {
          glow[col * ROWS + sr] = dbLevel(bands[col] ?? 0, gain, ref);
        }
      }
    }
    for (let i = 0; i < BAND_COUNT * ROWS; i++) glow[i] = (glow[i] ?? 0) * 0.88;
    const frame = createFrame();
    for (let i = 0; i < BAND_COUNT * ROWS; i++) {
      frame[i] = Math.min(255, Math.round((glow[i] ?? 0) * 255));
    }
    return frame;
  };
}

const FACTORIES: Record<AudioStyle, () => Renderer> = {
  'eq-bars':         eqBars,
  'spectrum-fall':   spectrumFall,
  'vu-meter':        vuMeter,
  'vu-sparks':       vuSparks,
  'dark-matter':     eqSparks,
  'cascade':         cascade,
  'cipher':          cipher,
  'wake':            wake,
  'wake-transient':  wakeTransient,
  'wake-multi':      wakeMulti,
  'bounce':          bounce,
  'waterfall':       waterfall,
  'sparks':          sparks,
  'flame-bars':      flameBars,
};

export function createRenderer(style: AudioStyle): Renderer {
  return FACTORIES[style]();
}
