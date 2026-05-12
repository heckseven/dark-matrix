import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type AudioStyle = 'eq-bars' | 'vu-meter' | 'bounce' | 'waterfall' | 'sparks' | 'flame-bars' | 'vu-sparks' | 'dark-matter' | 'spectrum-fall' | 'neo' | 'cipher' | 'wake' | 'ripple' | 'life' | 'life-strict' | 'life-pulse' | 'life-wave';

export const AUDIO_STYLES: { id: AudioStyle; label: string }[] = [
  { id: 'dark-matter',     label: 'dark matter' },
  { id: 'neo',             label: 'neo' },
  { id: 'cipher',          label: 'cipher' },
  { id: 'wake',            label: 'wake' },
  { id: 'ripple',          label: 'ripple' },
  { id: 'life',            label: 'life' },
  { id: 'life-strict',     label: 'life strict' },
  { id: 'life-pulse',      label: 'life pulse' },
  { id: 'life-wave',       label: 'life wave' },
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

function neo(): Renderer {
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
    if (delta > 0.12 && cooldown === 0) { waves.push(ROWS - 1); cooldown = 8; }
    for (let w = waves.length - 1; w >= 0; w--) {
      waves[w]! -= 0.5 + t * 2.0;
      if (waves[w]! < 0) {
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

type Ripple = { cx: number; cy: number; r: number };

function ripple(): Renderer {
  const ripples: Ripple[] = [];
  let smoothed = 0;
  let cooldown = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = smoothed * 0.85 + t * 0.15;
    if (cooldown > 0) cooldown--;
    if (delta > 0.10 && cooldown === 0) {
      const totalE = bands.reduce((s, e) => s + e, 0);
      const cx = totalE > 0
        ? bands.reduce((s, e, i) => s + e * i, 0) / totalE
        : BAND_COUNT / 2;
      const cy = ROWS / 2 + (Math.random() - 0.5) * ROWS * 0.5;
      ripples.push({ cx, cy, r: 0 });
      cooldown = 6;
    }
    const maxR = Math.sqrt(BAND_COUNT ** 2 + ROWS ** 2);
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i]!.r += 0.6;
      if (ripples[i]!.r > maxR) ripples.splice(i, 1);
    }
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      for (let row = 0; row < ROWS; row++) {
        let v = 0;
        for (const rp of ripples) {
          const dist = Math.sqrt((col - rp.cx) ** 2 + (row - rp.cy) ** 2);
          v = Math.max(v, Math.max(0, 1 - Math.abs(dist - rp.r) / 1.5));
        }
        frame[col * ROWS + row] = Math.round(v * 255);
      }
    }
    return frame;
  };
}

type LifeOpts = { seedRate: number; threshold: number; decay: number; survive: (n: number) => boolean; born: (n: number) => boolean; transientWipe?: number };

function makeLife(opts: LifeOpts): Renderer {
  const cells = new Float32Array(BAND_COUNT * ROWS);
  let smoothed = 0;
  let cooldown = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = smoothed * 0.85 + t * 0.15;
    if (cooldown > 0) cooldown--;
    if (delta > 0.10 && cooldown === 0) {
      if (opts.transientWipe !== undefined) {
        for (let i = 0; i < cells.length; i++) cells[i] = (cells[i] ?? 0) * opts.transientWipe;
      }
      for (let col = 0; col < BAND_COUNT; col++) {
        const e = dbLevel(bands[col] ?? 0, gain, ref);
        for (let row = 0; row < ROWS; row++) {
          if (Math.random() < e * opts.seedRate) cells[col * ROWS + row] = 1.0;
        }
      }
      cooldown = 5;
    }
    const alive = new Uint8Array(BAND_COUNT * ROWS);
    for (let i = 0; i < alive.length; i++) alive[i] = (cells[i] ?? 0) > opts.threshold ? 1 : 0;
    const next = new Float32Array(cells.length);
    for (let col = 0; col < BAND_COUNT; col++) {
      for (let row = 0; row < ROWS; row++) {
        let n = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const nc = col + dc, nr = row + dr;
            if (nc >= 0 && nc < BAND_COUNT && nr >= 0 && nr < ROWS)
              n += alive[nc * ROWS + nr] ?? 0;
          }
        }
        const idx = col * ROWS + row;
        const isAlive = (alive[idx] ?? 0) === 1;
        const survives = isAlive ? opts.survive(n) : opts.born(n);
        next[idx] = survives ? 1.0 : (cells[idx] ?? 0) * opts.decay;
      }
    }
    for (let i = 0; i < cells.length; i++) cells[i] = next[i] ?? 0;
    const frame = createFrame();
    for (let i = 0; i < cells.length; i++) frame[i] = Math.round((cells[i] ?? 0) * 255);
    return frame;
  };
}

// Standard GoL rules, seeding toned down from original
function life(): Renderer {
  return makeLife({ seedRate: 0.12, threshold: 0.4, decay: 0.75, survive: n => n === 2 || n === 3, born: n => n === 3 });
}

// Dual-generation: transient seeds "new" cells that can birth; existing cells age to "old" (survive only, no births).
// On each transient, all current cells become old; new cells are injected proportional to transient peak.
function lifeWave(): Renderer {
  const cells = new Float32Array(BAND_COUNT * ROWS);
  const isNew = new Uint8Array(BAND_COUNT * ROWS);
  let smoothed = 0;
  let cooldown = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = smoothed * 0.85 + t * 0.15;
    if (cooldown > 0) cooldown--;
    if (delta > 0.10 && cooldown === 0) {
      isNew.fill(0); // existing cells lose birth rights
      const count = Math.round(delta * BAND_COUNT * ROWS * 0.20);
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * BAND_COUNT * ROWS);
        cells[idx] = 1.0;
        isNew[idx] = 1;
      }
      cooldown = 5;
    }
    const aliveAll = new Uint8Array(BAND_COUNT * ROWS);
    const aliveNew = new Uint8Array(BAND_COUNT * ROWS);
    for (let i = 0; i < cells.length; i++) {
      if ((cells[i] ?? 0) > 0.4) {
        aliveAll[i] = 1;
        if (isNew[i]) aliveNew[i] = 1;
      }
    }
    const nextCells = new Float32Array(cells.length);
    const nextIsNew = new Uint8Array(cells.length);
    for (let col = 0; col < BAND_COUNT; col++) {
      for (let row = 0; row < ROWS; row++) {
        let nAll = 0, nNew = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const nc = col + dc, nr = row + dr;
            if (nc >= 0 && nc < BAND_COUNT && nr >= 0 && nr < ROWS) {
              nAll += aliveAll[nc * ROWS + nr] ?? 0;
              nNew += aliveNew[nc * ROWS + nr] ?? 0;
            }
          }
        }
        const idx = col * ROWS + row;
        const alive = aliveAll[idx] === 1;
        if (alive) {
          if (nAll === 2 || nAll === 3) {
            nextCells[idx] = 1.0;
            nextIsNew[idx] = isNew[idx] ?? 0;
          } else {
            nextCells[idx] = (cells[idx] ?? 0) * 0.65;
          }
        } else {
          if (nNew === 3) { // born only from new-cell neighbors
            nextCells[idx] = 1.0;
            nextIsNew[idx] = 1;
          } else {
            nextCells[idx] = (cells[idx] ?? 0) * 0.65;
          }
        }
      }
    }
    for (let i = 0; i < cells.length; i++) {
      cells[i] = nextCells[i] ?? 0;
      isNew[i] = nextIsNew[i] ?? 0;
    }
    const frame = createFrame();
    for (let i = 0; i < cells.length; i++) frame[i] = Math.round((cells[i] ?? 0) * 255);
    return frame;
  };
}

// Grid hard-cleared on each transient — every beat is a fresh sparse GoL run, no accumulation between beats
function lifeStrict(): Renderer {
  return makeLife({ seedRate: 0.10, threshold: 0.4, decay: 0.65, survive: n => n === 2 || n === 3, born: n => n === 3, transientWipe: 0 });
}

// Like life-strict but transient multiplies cells toward zero instead of hard-clearing — softer flash between beats
function lifePulse(): Renderer {
  return makeLife({ seedRate: 0.10, threshold: 0.4, decay: 0.65, survive: n => n === 2 || n === 3, born: n => n === 3, transientWipe: 0.15 });
}

const FACTORIES: Record<AudioStyle, () => Renderer> = {
  'eq-bars':         eqBars,
  'spectrum-fall':   spectrumFall,
  'vu-meter':        vuMeter,
  'vu-sparks':       vuSparks,
  'dark-matter':     eqSparks,
  'neo':             neo,
  'cipher':          cipher,
  'wake':            wake,
  'ripple':          ripple,
  'life':            life,
  'life-strict':     lifeStrict,
  'life-pulse':      lifePulse,
  'life-wave':       lifeWave,
  'bounce':          bounce,
  'waterfall':       waterfall,
  'sparks':          sparks,
  'flame-bars':      flameBars,
};

export function createRenderer(style: AudioStyle): Renderer {
  return FACTORIES[style]();
}
