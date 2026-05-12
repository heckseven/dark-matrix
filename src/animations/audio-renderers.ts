import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type AudioStyle = 'eq-bars' | 'vu-meter' | 'kick' | 'waterfall' | 'sparks' | 'hex' | 'specter' | 'heat' | 'dark-matter' | 'spectrum-fall' | 'neo' | 'cipher' | 'wake' | 'rhythm' | 'drop' | 'life-erode-4';

export const AUDIO_STYLES: { id: AudioStyle; label: string }[] = [
  { id: 'dark-matter',         label: 'dark matter' },
  { id: 'neo',                 label: 'neo' },
  { id: 'cipher',              label: 'cipher' },
  { id: 'wake',                label: 'wake' },
  { id: 'heat',                label: 'heat' },
  { id: 'rhythm',              label: 'rhythm' },
  { id: 'drop',                label: 'drop' },
  { id: 'spectrum-fall',       label: 'spectrum fall' },
  { id: 'life-erode-4',        label: 'replicants' },
  { id: 'kick',                label: 'kick' },
  { id: 'waterfall',           label: 'waterfall' },
  { id: 'sparks',              label: 'sparks' },
  { id: 'hex',                 label: 'hex' },
  { id: 'specter',             label: 'specter' },
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

function kick(): Renderer {
  const y  = new Float32Array(BAND_COUNT).fill(0);
  const vy = new Float32Array(BAND_COUNT).fill(0);
  let smoothed = 0, cooldown = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = smoothed * 0.88 + t * 0.12;
    if (cooldown > 0) cooldown--;
    if (delta > 0.06 && cooldown === 0) {
      for (let col = 0; col < BAND_COUNT; col++) {
        const e = dbLevel(bands[col] ?? 0, gain, ref);
        vy[col]! += e * (ROWS - 1) * 0.85;
      }
      cooldown = 8;
    }
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      vy[col]! -= 0.7;
      y[col]!  += vy[col]!;
      if (y[col]! <= 0) {
        y[col]!  = 0;
        const b  = -vy[col]! * 0.65;
        vy[col]! = b < 0.5 ? 0 : b;
      }
      if (y[col]! >= ROWS - 1) { y[col]! = ROWS - 1; vy[col]! = -Math.abs(vy[col]!) * 0.4; }
      const r = ROWS - 1 - Math.round(Math.min(ROWS - 1, Math.max(0, y[col]!)));
      frame[col * ROWS + r] = 255;
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


function makeSparksNeo(spawnRate: number, maxPerCol: number): Renderer {
  interface Rise { pos: number; col: number; speed: number; }
  const TRAIL = 9;
  const colCount = new Uint8Array(BAND_COUNT);
  let particles: Rise[] = [];
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const frame = createFrame();
    colCount.fill(0);
    for (const p of particles) { colCount[p.col] = (colCount[p.col] ?? 0) + 1; }
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      if ((colCount[col] ?? 0) < maxPerCol && Math.random() < energy * spawnRate) {
        particles.push({ pos: ROWS - 1, col, speed: 0.4 + energy * 2.0 });
      }
    }
    particles = particles.filter(p => {
      p.pos -= p.speed;
      const head = Math.round(p.pos);
      for (let t = 0; t < TRAIL; t++) {
        const r = head + t;
        if (r >= 0 && r < ROWS) {
          const v = Math.round(255 * Math.pow(0.65, t));
          const idx = p.col * ROWS + r;
          frame[idx] = Math.max(frame[idx] ?? 0, v);
        }
      }
      return p.pos > -TRAIL;
    });
    return frame;
  };
}
function sparksNeoB(): Renderer { return makeSparksNeo(0.45, 5); }





// inward sparks with a directional comet tail + 2 rotating mirrors.
// Each particle carries a tail pointing back toward where it came from,
// so motion toward center is visible without accumulation.
// keep: fraction of columns that can spawn per frame; trailLen: pixels behind head
function makeSparksKaleidoH(keep: number, trailLen: number): Renderer {
  const TRAVEL = ROWS - 1 - Math.floor(ROWS / 2);
  const MAX_P = 300;
  const pcf = new Float32Array(MAX_P);
  const prr = new Float32Array(MAX_P);
  const pdc = new Float32Array(MAX_P);
  let count = 0;
  const CC = (BAND_COUNT - 1) / 2;
  const CR = (ROWS - 1) / 2;
  let tick = 0;

  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    let write = 0;
    for (let i = 0; i < count; i++) {
      const ri = (prr[i] ?? 0) - 1;
      const ci = (pcf[i] ?? 0) + (pdc[i] ?? 0);
      if (ri >= 0) { prr[write] = ri; pcf[write] = ci; pdc[write] = pdc[i] ?? 0; write++; }
    }
    count = write;
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      if (Math.random() < energy * keep && count < MAX_P) {
        pcf[count] = col; prr[count] = ROWS - 1; pdc[count] = (CC - col) / TRAVEL; count++;
      }
    }

    const buf = new Float32Array(BAND_COUNT * ROWS);
    const a1 = tick * 0.015;
    const a2 = tick * 0.0091;

    const paint = (c: number, r: number, v: number) => {
      if (c < 0 || c >= BAND_COUNT || r < 0 || r >= ROWS || v <= 0) return;
      if (v <= (buf[c * ROWS + r] ?? 0)) return;
      buf[c * ROWS + r] = v;
      const nx = (c - CC) / CC, ny = (r - CR) / CR;
      for (const a of [a1, a2]) {
        const c2a = Math.cos(2 * a), s2a = Math.sin(2 * a);
        const mc = Math.round((nx * c2a + ny * s2a) * CC + CC);
        const mr = Math.round((nx * s2a - ny * c2a) * CR + CR);
        if (mc >= 0 && mc < BAND_COUNT && mr >= 0 && mr < ROWS)
          buf[mc * ROWS + mr] = Math.max(buf[mc * ROWS + mr] ?? 0, v);
      }
    };

    for (let i = 0; i < count; i++) {
      paint(Math.round(pcf[i] ?? 0), Math.round(prr[i] ?? 0), 255);
      for (let t = 1; t < trailLen; t++) {
        const tc = Math.round((pcf[i] ?? 0) - (pdc[i] ?? 0) * t);
        const tr = Math.round((prr[i] ?? 0) + t);
        paint(tc, tr, Math.round(255 * Math.pow(0.55, t)));
      }
    }

    tick++;
    const frame = createFrame();
    for (let i = 0; i < buf.length; i++) frame[i] = Math.round(buf[i] ?? 0);
    return frame;
  };
}
function specter(): Renderer { return makeSparksKaleidoH(0.12, 4); }



type Spark = { col: number; pos: number; v: number };

function makeFlameSparks(spawnsPerFrame: number, sparkDecay = 0.85, riseBase = 0.4, sparksOnly = false): Renderer {
  const envelope = new Float32Array(BAND_COUNT);
  const sparks: Spark[] = [];
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const t = dbLevel(bands[BAND_COUNT - 1 - col] ?? 0, gain, ref);
      envelope[col] = t > (envelope[col] ?? 0)
        ? t
        : (envelope[col] ?? 0) * 0.85 + t * 0.15;
      const flicker = (envelope[col] ?? 0) * (0.7 + Math.random() * 0.5);
      const height = Math.round(Math.min(1, flicker) * ROWS);
      if (!sparksOnly) {
        for (let row = 0; row < ROWS; row++)
          frame[col * ROWS + row] = row >= ROWS - height ? 255 : 0;
      }
      if (height > 0) {
        for (let s = 0; s < spawnsPerFrame; s++) {
          if (Math.random() < (envelope[col] ?? 0) * 0.5)
            sparks.push({ col, pos: ROWS - height - 0.5, v: 200 + Math.random() * 55 });
        }
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!;
      s.pos -= riseBase + Math.random() * riseBase;
      s.v *= sparkDecay;
      if (s.pos < 0 || s.v < 15) { sparks.splice(i, 1); continue; }
      const r = Math.round(s.pos);
      if (r >= 0 && r < ROWS) frame[s.col * ROWS + r] = Math.max(frame[s.col * ROWS + r] ?? 0, Math.round(s.v));
    }
    return frame;
  };
}
function makeFlameLifeSparks(cull: number, centerSeed: boolean, heightScale: number): Renderer {
  const lifeR   = makeFlameLife(cull, centerSeed, heightScale);
  const sparksR = makeFlameSparks(4, 0.93, 0.6, true);
  return (ctx) => {
    const lifeFrame   = lifeR(ctx);
    const sparksFrame = sparksR(ctx);
    for (let i = 0; i < lifeFrame.length; i++)
      lifeFrame[i] = Math.max(lifeFrame[i] ?? 0, sparksFrame[i] ?? 0);
    return lifeFrame;
  };
}
function flameLifeSparksB(): Renderer { return makeFlameLifeSparks(0.70, false, 0.25); }

function makeFlameLife(cull: number, centerSeed = false, heightScale = 1.0): Renderer {
  const envelope = new Float32Array(BAND_COUNT);
  const cells = new Float32Array(BAND_COUNT * ROWS);
  for (let i = 0; i < cells.length; i++) if (Math.random() < 0.35) cells[i] = 1.0;
  let fast = 0, slow = 0, cooldown = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const heights = new Int32Array(BAND_COUNT);
    for (let col = 0; col < BAND_COUNT; col++) {
      const t = dbLevel(bands[BAND_COUNT - 1 - col] ?? 0, gain, ref);
      envelope[col] = t > (envelope[col] ?? 0) ? t : (envelope[col] ?? 0) * 0.85 + t * 0.15;
      const flicker = (envelope[col] ?? 0) * (0.7 + Math.random() * 0.5);
      heights[col] = Math.round(Math.min(1, flicker) * ROWS * heightScale);
    }
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const tAvg = dbLevel(avg, gain, ref);
    fast = fast * 0.5 + tAvg * 0.5;
    slow = slow * 0.95 + tAvg * 0.05;
    const delta = fast - slow;
    if (cooldown > 0) cooldown--;
    if (delta > 0.06 && cooldown === 0) {
      if (centerSeed) {
        for (let col = 3; col <= 5; col++) {
          const h = heights[col] ?? 0;
          const e = dbLevel(bands[col] ?? 0, gain, ref);
          for (let row = Math.floor(ROWS - h * 0.5); row < ROWS; row++)
            if (Math.random() < e * 0.15) cells[col * ROWS + row] = 1.0;
        }
      } else {
        for (let col = 0; col < BAND_COUNT; col++) {
          const e = dbLevel(bands[col] ?? 0, gain, ref);
          for (let row = 0; row < ROWS; row++)
            if (Math.random() < e * 0.15) cells[col * ROWS + row] = 1.0;
        }
      }
      cooldown = 5;
    }
    for (let col = 0; col < BAND_COUNT; col++) {
      const killProb = dbLevel(bands[col] ?? 0, gain, ref) * cull;
      for (let row = 0; row < ROWS; row++)
        if (Math.random() < killProb) cells[col * ROWS + row] = 0;
    }
    const alive = new Uint8Array(BAND_COUNT * ROWS);
    for (let i = 0; i < alive.length; i++) alive[i] = (cells[i] ?? 0) > 0.4 ? 1 : 0;
    const next = new Float32Array(cells.length);
    for (let col = 0; col < BAND_COUNT; col++) {
      for (let row = 0; row < ROWS; row++) {
        let n = 0;
        for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
          if (dc === 0 && dr === 0) continue;
          const nc = col + dc, nr = row + dr;
          if (nc >= 0 && nc < BAND_COUNT && nr >= 0 && nr < ROWS) n += alive[nc * ROWS + nr] ?? 0;
        }
        const idx = col * ROWS + row;
        next[idx] = ((alive[idx] === 1) ? (n === 2 || n === 3) : n === 3)
          ? 1.0 : (cells[idx] ?? 0) * 0.75;
      }
    }
    for (let i = 0; i < cells.length; i++) cells[i] = next[i] ?? 0;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++)
      for (let row = ROWS - (heights[col] ?? 0); row < ROWS; row++)
        frame[col * ROWS + row] = Math.round((1 - (cells[col * ROWS + row] ?? 0)) * 255);
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
    smoothed = smoothed * 0.88 + t * 0.12;
    if (cooldown > 0) cooldown--;
    if (delta > 0.06 && cooldown === 0) { waves.push(ROWS - 1); cooldown = 8; }
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

function tickRipples(ripples: Ripple[], bands: number[], gain: number, ref: number, smoothed: { v: number }, cooldown: { v: number }) {
  const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
  const t = dbLevel(avg, gain, ref);
  const delta = t - smoothed.v;
  smoothed.v = smoothed.v * 0.88 + t * 0.12;
  if (cooldown.v > 0) { cooldown.v--; } else if (delta > 0.05) {
    const totalE = bands.reduce((s, e) => s + e, 0);
    const cx = totalE > 0 ? bands.reduce((s, e, i) => s + e * i, 0) / totalE : BAND_COUNT / 2;
    ripples.push({ cx, cy: ROWS / 2 + (Math.random() - 0.5) * ROWS * 0.5, r: 0 });
    cooldown.v = 6;
  }
  const maxR = Math.sqrt(BAND_COUNT ** 2 + ROWS ** 2);
  for (let i = ripples.length - 1; i >= 0; i--) {
    ripples[i]!.r += 0.6;
    if (ripples[i]!.r > maxR) ripples.splice(i, 1);
  }
}

function makeDrip(innerTrailWidth: number, trailDecay: number, ringWidth = 1.5, solidEdge = false): Renderer {
  const ripples: Ripple[] = [];
  const smoothed = { v: 0 }, cooldown = { v: 0 };
  const trail = new Float32Array(BAND_COUNT * ROWS);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    tickRipples(ripples, bands, gain, ref, smoothed, cooldown);
    for (let i = 0; i < trail.length; i++) trail[i] = (trail[i] ?? 0) * trailDecay;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      for (let row = 0; row < ROWS; row++) {
        const idx = col * ROWS + row;
        let v = 0, atLeadingEdge = false;
        for (const rp of ripples) {
          const dist = Math.sqrt((col - rp.cx) ** 2 + (row - rp.cy) ** 2);
          const rv = Math.max(0, 1 - Math.abs(dist - rp.r) / ringWidth);
          v = Math.max(v, rv);
          if (solidEdge && rv > 0 && dist >= rp.r - 0.5) atLeadingEdge = true;
          if (dist <= rp.r && rp.r - dist <= innerTrailWidth) {
            trail[idx] = Math.max(trail[idx] ?? 0, (1 - (rp.r - dist) / innerTrailWidth) * 0.9);
          }
        }
        if (v > 0 && !atLeadingEdge && Math.random() < energy * 0.7) v = 0;
        frame[idx] = Math.min(255, Math.round(Math.max(v, trail[idx] ?? 0) * 255));
      }
    }
    return frame;
  };
}
function dripE(): Renderer { return makeDrip(3, 0.65, 0.5, true); }

function makeDripLine(innerTrailWidth: number, trailDecay: number, ringWidth = 1.5, solidEdge = false): Renderer {
  const ripples: { y: number }[] = [];
  const smoothed = { v: 0 }, cooldown = { v: 0 };
  const trail = new Float32Array(BAND_COUNT * ROWS);
  const CENTER = Math.floor(ROWS / 2);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed.v;
    smoothed.v = smoothed.v * 0.88 + t * 0.12;
    if (cooldown.v > 0) { cooldown.v--; } else if (delta > 0.05) {
      ripples.push({ y: 0 });
      cooldown.v = 6;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i]!.y += 0.6;
      if (ripples[i]!.y > ROWS / 2 + ringWidth) ripples.splice(i, 1);
    }
    for (let i = 0; i < trail.length; i++) trail[i] = (trail[i] ?? 0) * trailDecay;
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      const energy = dbLevel(bands[col] ?? 0, gain, ref);
      for (let row = 0; row < ROWS; row++) {
        const idx = col * ROWS + row;
        let v = 0, atLeadingEdge = false;
        for (const rp of ripples) {
          const rowDist = Math.abs(row - CENTER);
          const distUp   = Math.abs(row - (CENTER - rp.y));
          const distDown = Math.abs(row - (CENTER + rp.y));
          const dist = Math.min(distUp, distDown);
          const rv = Math.max(0, 1 - dist / ringWidth);
          v = Math.max(v, rv);
          if (solidEdge && rv > 0 && (row <= CENTER - rp.y + 0.5 || row >= CENTER + rp.y - 0.5)) atLeadingEdge = true;
          if (rowDist < rp.y && rp.y - rowDist <= innerTrailWidth) {
            trail[idx] = Math.max(trail[idx] ?? 0, (1 - (rp.y - rowDist) / innerTrailWidth) * 0.9);
          }
        }
        if (v > 0 && !atLeadingEdge && Math.random() < energy * 0.7) v = 0;
        frame[idx] = Math.min(255, Math.round(Math.max(v, trail[idx] ?? 0) * 255));
      }
    }
    return frame;
  };
}
function dripB(): Renderer { return makeDripLine(5, 0.88); }

type LifeOpts = { seedRate: number; threshold: number; decay: number; survive: (n: number) => boolean; born: (n: number) => boolean; transientWipe?: number; transientCull?: number; continuousCull?: number };

function makeLife(opts: LifeOpts): Renderer {
  const cells = new Float32Array(BAND_COUNT * ROWS);
  for (let i = 0; i < cells.length; i++) {
    if (Math.random() < 0.35) cells[i] = 1.0;
  }
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
      if (opts.transientCull !== undefined) {
        const killProb = Math.min(1, delta * opts.transientCull);
        for (let i = 0; i < cells.length; i++) {
          if (Math.random() < killProb) cells[i] = 0;
        }
      }
      for (let col = 0; col < BAND_COUNT; col++) {
        const e = dbLevel(bands[col] ?? 0, gain, ref);
        for (let row = 0; row < ROWS; row++) {
          if (Math.random() < e * opts.seedRate) cells[col * ROWS + row] = 1.0;
        }
      }
      cooldown = 5;
    }
    if (opts.continuousCull !== undefined) {
      for (let col = 0; col < BAND_COUNT; col++) {
        const killProb = dbLevel(bands[col] ?? 0, gain, ref) * opts.continuousCull;
        for (let row = 0; row < ROWS; row++) {
          if (Math.random() < killProb) cells[col * ROWS + row] = 0;
        }
      }
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

// Per-column continuous kill proportional to band energy — loud bands erode their columns every frame
function lifeErode4(): Renderer {
  return makeLife({ seedRate: 0.15, threshold: 0.4, decay: 0.75, survive: n => n === 2 || n === 3, born: n => n === 3, continuousCull: 0.70 });
}
const FACTORIES: Record<AudioStyle, () => Renderer> = {
  'eq-bars':             eqBars,
  'spectrum-fall':       spectrumFall,
  'vu-meter':            vuMeter,
  'dark-matter':         eqSparks,
  'neo':                 neo,
  'cipher':              cipher,
  'wake':                wake,
  'rhythm':              dripB,
  'drop':                dripE,
  'life-erode-4':        lifeErode4,
  'kick':                kick,
  'waterfall':           waterfall,
  'sparks':              sparks,
  'hex':                 sparksNeoB,
  'specter':             specter,
  'heat':                flameLifeSparksB,
};

export function createRenderer(style: AudioStyle): Renderer {
  return FACTORIES[style]();
}
