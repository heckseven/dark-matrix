import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type AudioStyle = 'glitch' | 'circuit' | 'spirits' | 'scope-dual' | 'kick-d' | 'waterfall' | 'sparks' | 'hex' | 'specter' | 'heat' | 'dark-matter' | 'spectrum-fall' | 'neo' | 'cipher' | 'wake' | 'rhythm' | 'drop' | 'life-erode-4' | 'glitch-sort-b' | 'spiral-d' | 'strobe' | 'glitch-corrupt';

export const AUDIO_STYLES: { id: AudioStyle; label: string }[] = [
  { id: 'dark-matter',         label: 'dark matter' },
  { id: 'glitch-corrupt',      label: 'summon' },
  { id: 'glitch',              label: 'glitch' },
  { id: 'specter',             label: 'specter' },
  { id: 'circuit',             label: 'circuit' },
  { id: 'scope-dual',          label: 'ward' },
  { id: 'heat',                label: 'heat' },
  { id: 'kick-d',              label: 'kick' },
  { id: 'waterfall',           label: 'waterfall' },
  { id: 'hex',                 label: 'hex' },
  { id: 'life-erode-4',        label: 'replicants' },
  { id: 'wake',                label: 'wake' },
  { id: 'drop',                label: 'drop' },
  { id: 'spirits',             label: 'spirits' },
  { id: 'spectrum-fall',       label: 'timeline' },
  { id: 'cipher',              label: 'cipher' },
  { id: 'spiral-d',            label: 'hypno' },
  { id: 'rhythm',              label: 'rhythm' },
  { id: 'neo',                 label: 'neo' },
  { id: 'glitch-sort-b',       label: 'rift' },
  { id: 'strobe',              label: 'beam' },
];

export type LabParam = { key: string; label: string; min: number; max: number; step: number; default: number };
export const LAB_PARAMS: Partial<Record<AudioStyle, LabParam[]>> = {
  'life-erode-4': [
    { key: 'seedRate',       label: 'seed rate',  min: 0,    max: 0.5,  step: 0.005, default: 0.16 },
    { key: 'continuousCull', label: 'cull',        min: 0,    max: 1,    step: 0.01,  default: 0.66 },
    { key: 'decay',          label: 'decay',       min: 0.5,  max: 0.99, step: 0.01,  default: 0.74 },
    { key: 'dipRate',        label: 'dip rate',    min: 0.1,  max: 0.99, step: 0.01,  default: 0.70 },
  ],
};

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



function glitch(): Renderer {
  const rowCorrupt = new Float32Array(ROWS);
  let smoothed = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const spike = Math.max(0, t - smoothed);
    smoothed = smoothed * 0.85 + t * 0.15;
    for (let r = 0; r < ROWS; r++) {
      if (Math.random() < spike * 5) rowCorrupt[r] = Math.min(1, (rowCorrupt[r] ?? 0) + 0.5 + Math.random() * 0.5);
      rowCorrupt[r] = (rowCorrupt[r] ?? 0) * 0.87;
    }
    const frame = createFrame();
    for (let c = 0; c < BAND_COUNT; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
      for (let r = 0; r < ROWS; r++) {
        const corr = rowCorrupt[r] ?? 0;
        if (corr > 0.05) frame[c * ROWS + r] = Math.random() < corr * (0.3 + energy * 0.7) ? 255 : 0;
      }
    }
    return frame;
  };
}


function vuBlock(): Renderer {
  const BW = 3, BH = 4;
  const NH = Math.ceil(BAND_COUNT / BW);
  const NV = Math.ceil(ROWS / BH);
  const blockCorrupt = new Float32Array(NH * NV);
  const blockAge     = new Uint8Array(NH * NV);
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    for (let bh = 0; bh < NH; bh++) {
      let energy = 0;
      for (let c = bh * BW; c < Math.min((bh + 1) * BW, BAND_COUNT); c++)
        energy += dbLevel(bands[c] ?? 0, gain, ref);
      energy /= BW;
      for (let bv = 0; bv < NV; bv++) {
        const idx = bh * NV + bv;
        blockAge[idx] = ((blockAge[idx] ?? 0) + 1) % (2 + bv % 5);
        if (blockAge[idx] === 0)
          blockCorrupt[idx] = energy > 0.20 && Math.random() < energy * 0.7
            ? Math.random()
            : (blockCorrupt[idx] ?? 0) * 0.45;
      }
    }
    const frame = createFrame();
    for (let bh = 0; bh < NH; bh++) {
      for (let bv = 0; bv < NV; bv++) {
        const corr = blockCorrupt[bh * NV + bv] ?? 0;
        for (let c = bh * BW; c < Math.min((bh + 1) * BW, BAND_COUNT); c++)
          for (let r = bv * BH; r < Math.min((bv + 1) * BH, ROWS); r++)
            frame[c * ROWS + r] = corr > 0.08 ? (Math.random() < corr ? 255 : 0) : 0;
      }
    }
    return frame;
  };
}



function scopeDual(): Renderer {
  const bufA = new Float32Array(BAND_COUNT * ROWS);
  const bufB = new Float32Array(BAND_COUNT * ROWS);
  const DELAY = 7;
  const hist  = Array.from({ length: DELAY }, () => new Float32Array(BAND_COUNT));
  let head = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    for (let i = 0; i < bufA.length; i++) bufA[i] = (bufA[i] ?? 0) * 0.83;
    for (let i = 0; i < bufB.length; i++) bufB[i] = (bufB[i] ?? 0) * 0.73;
    const cur = new Float32Array(BAND_COUNT);
    for (let c = 0; c < BAND_COUNT; c++) cur[c] = dbLevel(bands[c] ?? 0, gain, ref);
    hist[head]!.set(cur);
    head = (head + 1) % DELAY;
    const delayed = hist[head]!;
    for (let c = 0; c < BAND_COUNT; c++) {
      const rA = Math.max(0, Math.min(ROWS - 1, ROWS - 1 - Math.round((cur[c] ?? 0) * (ROWS - 1))));
      bufA[c * ROWS + rA] = 255;
      if (rA > 0)        bufA[c * ROWS + rA - 1] = Math.max(bufA[c * ROWS + rA - 1] ?? 0, 170);
      if (rA < ROWS - 1) bufA[c * ROWS + rA + 1] = Math.max(bufA[c * ROWS + rA + 1] ?? 0, 170);
      const dc = BAND_COUNT - 1 - c;
      const rB = Math.max(0, Math.min(ROWS - 1, ROWS - 1 - Math.round((delayed[dc] ?? 0) * (ROWS - 1))));
      bufB[c * ROWS + rB] = 255;
      if (rB > 0)        bufB[c * ROWS + rB - 1] = Math.max(bufB[c * ROWS + rB - 1] ?? 0, 150);
      if (rB < ROWS - 1) bufB[c * ROWS + rB + 1] = Math.max(bufB[c * ROWS + rB + 1] ?? 0, 150);
    }
    const frame = createFrame();
    for (let i = 0; i < frame.length; i++)
      frame[i] = Math.min(255, Math.round(Math.max(bufA[i] ?? 0, bufB[i] ?? 0)));
    return frame;
  };
}

function glitchSortB(): Renderer {
  const cols = Array.from({ length: BAND_COUNT }, () => new Float32Array(ROWS));
  const shifted = new Float32Array(BAND_COUNT * ROWS);
  const offsets = new Int8Array(BAND_COUNT);
  let smoothed = 0, cooldown = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = Math.max(0, t - smoothed);
    smoothed = smoothed * 0.88 + t * 0.12;
    if (cooldown > 0) cooldown--;
    if (t > 0.08 && delta > 0.08 && cooldown === 0) {
      for (let c = 0; c < BAND_COUNT; c++) offsets[c] = Math.round((Math.random() - 0.5) * 4);
      cooldown = 10;
    } else {
      for (let c = 0; c < BAND_COUNT; c++) offsets[c] = Math.round((offsets[c] ?? 0) * 0.7);
    }
    for (let c = 0; c < BAND_COUNT; c++) {
      const tc = dbLevel(bands[c] ?? 0, gain, ref);
      for (let r = 0; r < ROWS; r++) {
        cols[c]![r] = (cols[c]![r] ?? 0) * 0.86;
        if (Math.random() < tc * tc) cols[c]![r] = Math.max(cols[c]![r] ?? 0, 0.5 + Math.random() * 0.5);
      }
      for (let r = 1; r < ROWS; r++) {
        if ((cols[c]![r] ?? 0) > (cols[c]![r - 1] ?? 0)) {
          const tmp = cols[c]![r]!; cols[c]![r] = cols[c]![r - 1]!; cols[c]![r - 1] = tmp;
        }
      }
    }
    for (let c = 0; c < BAND_COUNT; c++) {
      const src = ((c - (offsets[c] ?? 0)) % BAND_COUNT + BAND_COUNT) % BAND_COUNT;
      for (let r = 0; r < ROWS; r++)
        shifted[c * ROWS + r] = cols[src]![r] ?? 0;
    }
    const frame = createFrame();
    for (let i = 0; i < shifted.length; i++) frame[i] = Math.round(shifted[i]! * 255);
    return frame;
  };
}

function spiralD(): Renderer {
  const buf = new Float32Array(BAND_COUNT * ROWS);
  let phase = 0;
  const CC = (BAND_COUNT - 1) / 2;
  const CR = (ROWS - 1) / 2;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) * 0.68;
    phase += 0.03 + t * 0.09;
    const arms = 1 + Math.floor(t * 1.99);
    for (let arm = 0; arm < arms; arm++) {
      const offset = (arm / arms) * 2 * Math.PI;
      for (let s = 0; s < 45; s++) {
        const frac = s / 44;
        const theta = phase + offset + frac * 5 * Math.PI;
        const c = Math.round(CC + Math.cos(theta) * CC * frac);
        const r = Math.round(CR + Math.sin(theta) * CR * frac);
        if (c >= 0 && c < BAND_COUNT && r >= 0 && r < ROWS)
          buf[c * ROWS + r] = Math.max(buf[c * ROWS + r] ?? 0, Math.round(80 + 175 * frac));
      }
    }
    const frame = createFrame();
    for (let i = 0; i < buf.length; i++) frame[i] = Math.round(buf[i] ?? 0);
    return frame;
  };
}


function strobe(): Renderer {
  type Bar = { c: number; w: number };
  let bars: Bar[] = [];
  let splitBars: Bar[] = [];
  let smoothed = 0, cooldown = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    if (t > 0.08 && delta > 0.04 && cooldown === 0) {
      bars = [];
      splitBars = [];
      const n = 1 + Math.floor(t * 3.5);
      const occupied = new Uint8Array(BAND_COUNT);
      for (let i = 0; i < n; i++) {
        const avail: number[] = [];
        for (let c = 0; c < BAND_COUNT; c++) if (!occupied[c]) avail.push(c);
        if (avail.length === 0) {
          const wide = bars.filter(b => b.w >= 2);
          if (wide.length > 0) {
            const wb = wide[Math.floor(Math.random() * wide.length)]!;
            splitBars.push({ c: wb.c + Math.floor(Math.random() * wb.w), w: 1 });
          }
          break;
        }
        const c = avail[Math.floor(Math.random() * avail.length)]!;
        const w = c + 2 <= BAND_COUNT && !occupied[c + 1] && Math.random() > 0.55 ? 2 : 1;
        bars.push({ c, w });
        for (let dc = Math.max(0, c - 1); dc <= Math.min(BAND_COUNT - 1, c + w); dc++) occupied[dc] = 1;
      }
      cooldown = 1;
    }
    const frame = createFrame();
    for (const { c, w } of bars)
      for (let dc = 0; dc < w; dc++)
        for (let r = 0; r < ROWS; r++)
          frame[(c + dc) * ROWS + r] = 255;
    for (const { c, w } of splitBars)
      for (let dc = 0; dc < w; dc++)
        for (let r = 0; r < ROWS; r++) {
          const idx = (c + dc) * ROWS + r;
          frame[idx] = (frame[idx] ?? 0) ^ 255;
        }
    return frame;
  };
}



function blip(): Renderer {
  type Mark = { col: number; row: number; v: number };
  const prev = new Float32Array(BAND_COUNT);
  const marks: Mark[] = [];
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    for (let c = 0; c < BAND_COUNT; c++) {
      const t = dbLevel(bands[c] ?? 0, gain, ref);
      if (t - (prev[c] ?? 0) > 0.05) marks.push({ col: c, row: ROWS - 1 - Math.round(t * (ROWS - 1)), v: 1.0 });
      prev[c] = t;
    }
    const frame = createFrame();
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]!;
      m.v *= 0.78;
      if (m.v < 0.03) { marks.splice(i, 1); continue; }
      for (let dr = -1; dr <= 1; dr++) {
        const r = m.row + dr;
        if (r >= 0 && r < ROWS)
          frame[m.col * ROWS + r] = Math.max(frame[m.col * ROWS + r] ?? 0, Math.round(m.v * (dr === 0 ? 255 : 140)));
      }
    }
    return frame;
  };
}



function kickD(): Renderer {
  const y         = new Float32Array(BAND_COUNT).fill(0);
  const vy        = new Float32Array(BAND_COUNT).fill(0);
  const smoothedB = new Float32Array(BAND_COUNT).fill(0);
  let cooldown = 0, energyRun = 0;
  const center = (BAND_COUNT - 1) / 2;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    let maxDelta = 0;
    for (let i = 0; i < BAND_COUNT; i++) {
      const bLevel = dbLevel(bands[i] ?? 0, gain, ref);
      const bDelta = bLevel - (smoothedB[i] ?? 0);
      smoothedB[i] = bLevel > (smoothedB[i] ?? 0)
        ? (smoothedB[i] ?? 0) * 0.95 + bLevel * 0.05
        : (smoothedB[i] ?? 0) * 0.82 + bLevel * 0.18;
      if (bDelta > maxDelta) maxDelta = bDelta;
    }
    if (cooldown > 0) cooldown--;
    if (t > 0.12 && maxDelta > 0.08 && cooldown === 0) {
      energyRun = t > 0.5 ? energyRun + 1 : 0;
      let boostCol = -1;
      if (energyRun >= 2 && Math.random() < 0.4) {
        const candidates: number[] = [];
        for (let c = 0; c < BAND_COUNT; c++)
          if (c !== Math.round(center) && (y[c] ?? 0) <= 3) candidates.push(c);
        if (candidates.length > 0)
          boostCol = candidates[Math.floor(Math.random() * candidates.length)]!;
      }
      for (let col = 0; col < BAND_COUNT; col++) {
        if ((y[col] ?? 0) <= 3) {
          const normDist = Math.abs(col - center) / center;
          const factor = 0.4 + 0.6 * Math.pow(1 - normDist, 2);
          const boost = col === boostCol ? 1.3 + Math.random() * 0.4 : 1;
          vy[col]! = t * 20 * factor * boost;
        }
      }
      cooldown = 1;
    }
    const frame = createFrame();
    for (let col = 0; col < BAND_COUNT; col++) {
      vy[col]! -= 1.2;
      y[col]!  += vy[col]!;
      if (y[col]! <= 0) {
        y[col]! = 0;
        const b = -(vy[col] ?? 0) * 0.5;
        vy[col]! = b < 0.4 ? 0 : b;
      }
      if (y[col]! > ROWS - 1) { y[col]! = ROWS - 1; vy[col]! = -1; }
      const r = ROWS - 1 - Math.round(y[col]!);
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
      cooldown = 2;
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
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    if (t > 0.08 && delta > 0.06 && cooldown === 0) { waves.push(ROWS - 1); cooldown = 2; }
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
  smoothed.v = t > smoothed.v ? smoothed.v * 0.95 + t * 0.05 : smoothed.v * 0.82 + t * 0.18;
  if (cooldown.v > 0) { cooldown.v--; } else if (t > 0.08 && delta > 0.05) {
    const totalE = bands.reduce((s, e) => s + e, 0);
    const cx = totalE > 0 ? bands.reduce((s, e, i) => s + e * i, 0) / totalE : BAND_COUNT / 2;
    ripples.push({ cx, cy: ROWS / 2 + (Math.random() - 0.5) * ROWS * 0.5, r: 0 });
    cooldown.v = 3;
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
    smoothed.v = t > smoothed.v ? smoothed.v * 0.95 + t * 0.05 : smoothed.v * 0.82 + t * 0.18;
    if (cooldown.v > 0) { cooldown.v--; } else if (t > 0.08 && delta > 0.05) {
      ripples.push({ y: 0 });
      cooldown.v = 2;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i]!.y += 0.6;
      if (ripples[i]!.y > ROWS / 2 + ringWidth) ripples.splice(i, 1);
    }
    const decay = trailDecay - t * 0.45;
    for (let i = 0; i < trail.length; i++) trail[i] = (trail[i] ?? 0) * decay;
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

type LifeRevival =
  | { mode: 'stochastic'; birthRate: number }
  | { mode: 'blinker' }
  | { mode: 'threshold-dip'; dipRate: number }
  | { mode: 'threshold-dip-blinker'; dipRate: number };

type LifeOpts = { seedRate: number; threshold: number; decay: number; survive: (n: number) => boolean; born: (n: number) => boolean; transientWipe?: number; transientCull?: number; continuousCull?: number; revival?: LifeRevival };

function makeLife(opts: LifeOpts): Renderer {
  const cells = new Float32Array(BAND_COUNT * ROWS);
  for (let i = 0; i < cells.length; i++) {
    if (Math.random() < 0.35) cells[i] = 1.0;
  }
  let smoothed = 0;
  let cooldown = 0;
  let thresholdMult = 1.0;
  let blinkerActive = false;
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
      cooldown = 2;
    }
    if (opts.continuousCull !== undefined) {
      for (let col = 0; col < BAND_COUNT; col++) {
        const killProb = dbLevel(bands[col] ?? 0, gain, ref) * opts.continuousCull;
        for (let row = 0; row < ROWS; row++) {
          if (Math.random() < killProb) cells[col * ROWS + row] = 0;
        }
      }
    }
    const effectiveThreshold = opts.revival?.mode === 'threshold-dip' ? opts.threshold * thresholdMult : opts.threshold;
    const alive = new Uint8Array(BAND_COUNT * ROWS);
    for (let i = 0; i < alive.length; i++) alive[i] = (cells[i] ?? 0) > effectiveThreshold ? 1 : 0;
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
    const revival = opts.revival;
    if (revival) {
      let aliveCount = 0;
      for (let i = 0; i < alive.length; i++) aliveCount += alive[i] ?? 0;
      if (revival.mode === 'stochastic') {
        if (aliveCount === 0) {
          for (let i = 0; i < cells.length; i++) {
            if (Math.random() < revival.birthRate) cells[i] = 1.0;
          }
        }
      } else if (revival.mode === 'blinker') {
        if (aliveCount > 0) {
          blinkerActive = false;
        } else if (!blinkerActive) {
          const col = 1 + Math.floor(Math.random() * (BAND_COUNT - 3));
          const row = 1 + Math.floor(Math.random() * (ROWS - 2));
          cells[col * ROWS + row] = 1.0;
          cells[(col + 1) * ROWS + row] = 1.0;
          cells[(col + 2) * ROWS + row] = 1.0;
          blinkerActive = true;
        }
      } else if (revival.mode === 'threshold-dip') {
        if (aliveCount === 0) {
          thresholdMult = Math.max(0.01, thresholdMult * revival.dipRate);
        } else {
          thresholdMult = Math.min(1.0, thresholdMult / revival.dipRate);
        }
      } else if (revival.mode === 'threshold-dip-blinker') {
        if (aliveCount === 0) {
          thresholdMult = Math.max(0.01, thresholdMult * revival.dipRate);
          if (thresholdMult <= 0.1 && !blinkerActive) {
            const col = 1 + Math.floor(Math.random() * (BAND_COUNT - 3));
            const row = 1 + Math.floor(Math.random() * (ROWS - 2));
            cells[col * ROWS + row] = 1.0;
            cells[(col + 1) * ROWS + row] = 1.0;
            cells[(col + 2) * ROWS + row] = 1.0;
            blinkerActive = true;
            thresholdMult = 1.0;
          }
        } else {
          thresholdMult = Math.min(1.0, thresholdMult / revival.dipRate);
          blinkerActive = false;
        }
      }
    }
    const frame = createFrame();
    for (let i = 0; i < cells.length; i++) frame[i] = Math.round((cells[i] ?? 0) * 255);
    return frame;
  };
}

function lifeErode4(p?: Record<string, number>): Renderer {
  return makeLife({ seedRate: p?.['seedRate'] ?? 0.16, threshold: p?.['threshold'] ?? 0.4, decay: p?.['decay'] ?? 0.74, survive: n => n === 2 || n === 3, born: n => n === 3, continuousCull: p?.['continuousCull'] ?? 0.66, revival: { mode: 'threshold-dip-blinker', dipRate: p?.['dipRate'] ?? 0.7 } });
}

function glitchCorrupt(): Renderer {
  const buf = new Float32Array(BAND_COUNT * ROWS);
  let smoothed = 0, cooldown = 0;
  return ({ bands, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) * 0.9;
    if (t > 0.08 && delta > 0.04 && cooldown === 0) {
      const blocks = 1 + Math.floor(t * 4);
      for (let b = 0; b < blocks; b++) {
        const bw = 1 + Math.floor(Math.random() * 3);
        const bh = 2 + Math.floor(Math.random() * 10);
        const bc = Math.floor(Math.random() * BAND_COUNT);
        const br = Math.floor(Math.random() * ROWS);
        for (let dc = 0; dc < bw; dc++)
          for (let dr = 0; dr < bh; dr++) {
            const c = (bc + dc) % BAND_COUNT;
            const r = br + dr;
            if (r < ROWS) buf[c * ROWS + r] = Math.max(buf[c * ROWS + r] ?? 0, 0.6 + Math.random() * 0.4);
          }
      }
      cooldown = 2;
    }
    const frame = createFrame();
    for (let i = 0; i < buf.length; i++)
      frame[i] = Math.random() < (buf[i] ?? 0) ? 255 : 0;
    return frame;
  };
}

const FACTORIES: Record<AudioStyle, (params?: Record<string, number>) => Renderer> = {
  'spectrum-fall':       spectrumFall,
  'glitch':              glitch,
  'circuit':             vuBlock,
  'spirits':             blip,
  'scope-dual':          scopeDual,
  'glitch-sort-b':       glitchSortB,
  'spiral-d':            spiralD,
  'strobe':              strobe,
  'dark-matter':         eqSparks,
  'neo':                 neo,
  'cipher':              cipher,
  'wake':                wake,
  'rhythm':              dripB,
  'drop':                dripE,
  'life-erode-4':        lifeErode4,
  'kick-d':              kickD,
  'waterfall':           waterfall,
  'sparks':              sparks,
  'hex':                 sparksNeoB,
  'specter':             specter,
  'heat':                flameLifeSparksB,
  'glitch-corrupt':      glitchCorrupt,
};

export function createRenderer(style: AudioStyle): Renderer {
  return FACTORIES[style]();
}

export function createAudioRenderer(style: AudioStyle, params?: Record<string, number>): Renderer {
  return FACTORIES[style](params);
}
