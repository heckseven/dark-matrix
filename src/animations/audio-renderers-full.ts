import type { AudioStyle } from './audio-renderers.js';

export type { AudioStyle };

export interface FullCtx {
  bands: number[];   // length === cols; index 0 = lowest frequency
  cols: number;
  rows: number;
  fftSize: number;
  gain: number;
}

// Column-major layout: data[col * rows + row]
type FullRenderer = (ctx: FullCtx) => Uint8Array;

const MIN_DB = -60;

function dbLevel(mag: number, gain: number, ref: number): number {
  const m = mag * gain;
  const db = m > 0 ? 20 * Math.log10(m / ref) : MIN_DB;
  return Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB));
}

// Hardware frequency edges (matches computeBandMagnitudes in audio-eq.ts).
// Maps N fine log-spaced bands to these 9 ranges, then interpolates to cols columns
// so fullscreen styles see the same per-column frequency distribution as the hardware.
const HW_EDGES = [20, 60, 120, 250, 500, 1000, 2000, 6000, 14000, 20000] as const;
const HW_N = 9;
const HW_LOG_MIN = Math.log10(20);
const HW_LOG_RANGE = Math.log10(20000) - HW_LOG_MIN;

// smooth=true: linear interpolation between HW buckets (good for particle renderers)
// smooth=false: nearest-neighbor snap (gives discrete steps matching hardware look)
function colEnergies(bands: number[], gain: number, ref: number, cols: number, reverse = false, smooth = true): Float32Array {
  const n = bands.length;
  const buckets = new Float32Array(HW_N);
  const counts = new Int32Array(HW_N);
  for (let k = 0; k < n; k++) {
    const f = Math.pow(10, HW_LOG_MIN + ((k + 0.5) / n) * HW_LOG_RANGE);
    let b = HW_N - 1;
    for (let i = 0; i < HW_N; i++) {
      if (f >= (HW_EDGES[i] ?? 0) && f < (HW_EDGES[i + 1] ?? Infinity)) { b = i; break; }
    }
    buckets[b] = (buckets[b] ?? 0) + dbLevel(bands[k] ?? 0, gain, ref);
    counts[b] = (counts[b] ?? 0) + 1;
  }
  for (let b = 0; b < HW_N; b++) { const cnt = counts[b] ?? 0; if (cnt > 0) buckets[b] = (buckets[b] ?? 0) / cnt; }
  const result = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    const cc = reverse ? cols - 1 - c : c;
    const frac = (cc / Math.max(1, cols - 1)) * (HW_N - 1);
    if (smooth) {
      const b0 = Math.floor(frac);
      const b1 = Math.min(HW_N - 1, b0 + 1);
      const t = frac - b0;
      result[c] = (buckets[b0] ?? 0) * (1 - t) + (buckets[b1] ?? 0) * t;
    } else {
      result[c] = buckets[Math.round(frac)] ?? 0;
    }
  }
  return result;
}

// Direct mapping: bands → cols columns, skipping sub-bass below 40 Hz where
// FFT resolution is too coarse to contain useful content. The remaining bands
// are resampled (nearest-neighbor) across all cols output columns so the display
// covers 40 Hz – 20 kHz at full resolution. No 9-bucket rebucketing.
const LOG_MIN_DISPLAY = Math.log10(40);
function directEnergies(bands: number[], gain: number, ref: number, cols: number): Float32Array {
  const n = bands.length;
  const startFrac = (LOG_MIN_DISPLAY - HW_LOG_MIN) / HW_LOG_RANGE;
  const startIdx = Math.max(0, Math.min(n - 1, Math.round(startFrac * n - 0.5)));
  const srcCount = n - startIdx;
  const result = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    const k = startIdx + Math.min(srcCount - 1, Math.round((c / Math.max(1, cols - 1)) * (srcCount - 1)));
    result[c] = dbLevel(bands[k] ?? 0, gain, ref);
  }
  return result;
}

// ── Group A: bar/column-per-band (natural scale) ──────────────────────────

function fullSpectrumFall(): FullRenderer {
  let history: Uint8Array[] | null = null;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!history || history.length !== rows || history[0]?.length !== cols)
      history = Array.from({ length: rows }, () => new Uint8Array(cols));
    const ce = directEnergies(bands, gain, ref, cols);
    const center = Math.floor(rows / 2);
    const newRow = new Uint8Array(cols);
    for (let c = 0; c < cols; c++) newRow[c] = Math.round((ce[c] ?? 0) * 255);
    history.shift();
    history.push(newRow);
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const halfH = Math.round((ce[c] ?? 0) * center);
      for (let r = 0; r < rows; r++) {
        if (Math.abs(r - center) <= halfH) data[c * rows + r] = 255 - (history[r]?.[c] ?? 0);
      }
    }
    return data;
  };
}

function fullSpirits(): FullRenderer {
  interface Mark { col: number; row: number; v: number }
  let prev: Float32Array | null = null;
  let marks: Mark[] = [];
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!prev || prev.length !== cols) { prev = new Float32Array(cols); marks = []; }
    const ce = colEnergies(bands, gain, ref, cols);
    // Rising-edge detection: spawn a mark when energy increases > 0.05 (matches hardware blip)
    for (let c = 0; c < cols; c++) {
      const t = ce[c] ?? 0;
      if (t - (prev[c] ?? 0) > 0.05)
        marks.push({ col: c, row: Math.max(0, rows - 1 - Math.round(t * (rows - 1))), v: 1.0 });
      prev[c] = t;
    }
    const data = new Uint8Array(cols * rows);
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]!;
      m.v *= 0.78;
      if (m.v < 0.03) { marks.splice(i, 1); continue; }
      for (let dr = -1; dr <= 1; dr++) {
        const r = m.row + dr;
        if (r >= 0 && r < rows) {
          const idx = m.col * rows + r;
          data[idx] = Math.max(data[idx] ?? 0, Math.round(m.v * (dr === 0 ? 255 : 140)));
        }
      }
    }
    return data;
  };
}

function fullVuGlitch(): FullRenderer {
  let buf: Float32Array | null = null;
  let smoothed = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!buf || buf.length !== rows) buf = new Float32Array(rows);
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const spike = Math.max(0, t - smoothed);
    smoothed = smoothed * 0.85 + t * 0.15;
    for (let r = 0; r < rows; r++) {
      if (Math.random() < spike * 5) buf[r] = Math.min(1, (buf[r] ?? 0) + 0.5 + Math.random() * 0.5);
      buf[r] = (buf[r] ?? 0) * 0.87;
    }
    const ce = colEnergies(bands, gain, ref, cols);
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      for (let r = 0; r < rows; r++) {
        const corr = buf[r] ?? 0;
        if (corr > 0.05 && Math.random() < corr * (0.3 + energy * 0.7))
          data[c * rows + r] = 255;
      }
    }
    return data;
  };
}

function fullKickD(): FullRenderer {
  let y: Float32Array | null = null;
  let vy: Float32Array | null = null;
  let smoothedB: Float32Array | null = null;
  let cooldown = 0, energyRun = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!y || y.length !== cols) { y = new Float32Array(cols); vy = new Float32Array(cols); smoothedB = new Float32Array(cols); }
    const center = (cols - 1) / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const ce = colEnergies(bands, gain, ref, cols);
    let maxDelta = 0;
    for (let i = 0; i < cols; i++) {
      const bLevel = ce[i] ?? 0;
      const bDelta = bLevel - (smoothedB![i] ?? 0);
      smoothedB![i] = bLevel > (smoothedB![i] ?? 0)
        ? (smoothedB![i] ?? 0) * 0.95 + bLevel * 0.05
        : (smoothedB![i] ?? 0) * 0.82 + bLevel * 0.18;
      if (bDelta > maxDelta) maxDelta = bDelta;
    }
    if (cooldown > 0) cooldown--;
    if (t > 0.12 && maxDelta > 0.08 && cooldown === 0) {
      energyRun = t > 0.5 ? energyRun + 1 : 0;
      let boostCol = -1;
      if (energyRun >= 2 && Math.random() < 0.4) {
        const candidates: number[] = [];
        for (let c = 0; c < cols; c++)
          if (c !== Math.round(center) && (y![c] ?? 0) <= 3) candidates.push(c);
        if (candidates.length > 0)
          boostCol = candidates[Math.floor(Math.random() * candidates.length)]!;
      }
      for (let col = 0; col < cols; col++) {
        if ((y![col] ?? 0) <= 3) {
          const normDist = Math.abs(col - center) / (center || 1);
          const factor = 0.4 + 0.6 * Math.pow(1 - normDist, 2);
          const boost = col === boostCol ? 1.3 + Math.random() * 0.4 : 1;
          vy![col] = t * rows * 0.6 * factor * boost;
        }
      }
      cooldown = 1;
    }
    const data = new Uint8Array(cols * rows);
    for (let col = 0; col < cols; col++) {
      vy![col] = (vy![col] ?? 0) - rows * 0.035;
      y![col] = (y![col] ?? 0) + (vy![col] ?? 0);
      if ((y![col] ?? 0) <= 0) { y![col] = 0; const b = -(vy![col] ?? 0) * 0.5; vy![col] = b < 0.4 ? 0 : b; }
      if ((y![col] ?? 0) > rows - 1) { y![col] = rows - 1; vy![col] = -1; }
      const r = rows - 1 - Math.round(y![col] ?? 0);
      if (r >= 0 && r < rows) data[col * rows + r] = 255;
    }
    return data;
  };
}

function fullDarkMatter(): FullRenderer {
  let peaks: Float32Array | null = null;
  let grid: Uint8Array | null = null;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!peaks || !grid || peaks.length !== cols || grid.length !== cols * rows) {
      peaks = new Float32Array(cols);
      grid = new Uint8Array(cols * rows);
    }
    const ce = directEnergies(bands, gain, ref, cols);
    // Rising sparks: shift upward one row, spawn bottom row
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols; c++)
        grid![c * rows + r] = grid![c * rows + r + 1] ?? 0;
    for (let c = 0; c < cols; c++)
      grid![c * rows + (rows - 1)] = Math.random() < (ce[c] ?? 0) ? 255 : 0;
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      const height = Math.round(energy * rows);
      peaks![c] = Math.max(energy, (peaks![c] ?? 0) * 0.98);
      const peakRow = rows - 1 - Math.round((peaks![c] ?? 0) * (rows - 1));
      const barTop = rows - height;
      for (let r = 0; r < rows; r++) {
        if (r === peakRow && (peaks![c] ?? 0) > energy) {
          data[c * rows + r] = 255;
        } else if (r >= barTop) {
          data[c * rows + r] = (grid![c * rows + r] ?? 0) > 0 ? 0 : 255;
        }
      }
    }
    return data;
  };
}

function fullHeat(): FullRenderer {
  let cells: Float32Array | null = null;
  let envelope: Float32Array | null = null;
  let sparks: { col: number; pos: number; v: number }[] = [];
  let lastCols = 0, lastRows = 0;
  let fast = 0, slow = 0, cooldown = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!cells || !envelope || cols !== lastCols || rows !== lastRows) {
      cells = new Float32Array(cols * rows);
      envelope = new Float32Array(cols);
      for (let i = 0; i < cells.length; i++) if (Math.random() < 0.35) cells[i] = 1.0;
      sparks = [];
      fast = 0; slow = 0; cooldown = 0;
      lastCols = cols; lastRows = rows;
    }
    // Heights: reversed (high freq → left column), matching hardware
    const ceRev = colEnergies(bands, gain, ref, cols, true);
    // Kill + seed: non-reversed (low freq → left column), matching hardware
    const ceFwd = colEnergies(bands, gain, ref, cols, false);
    const heights = new Int32Array(cols);
    for (let c = 0; c < cols; c++) {
      const t = ceRev[c] ?? 0;
      envelope![c] = t > (envelope![c] ?? 0) ? t : (envelope![c] ?? 0) * 0.85 + t * 0.15;
      const flicker = (envelope![c] ?? 0) * (0.7 + Math.random() * 0.5);
      heights[c] = Math.round(Math.min(1, flicker) * rows * 0.25);
    }
    // Transient seeding — fires a burst of life cells on beat hits
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const tAvg = dbLevel(avg, gain, ref);
    fast = fast * 0.5 + tAvg * 0.5;
    slow = slow * 0.95 + tAvg * 0.05;
    const delta = fast - slow;
    if (cooldown > 0) cooldown--;
    if (delta > 0.06 && cooldown === 0) {
      for (let c = 0; c < cols; c++) {
        const e = ceFwd[c] ?? 0;
        for (let r = 0; r < rows; r++)
          if (Math.random() < e * 0.15) cells![c * rows + r] = 1.0;
      }
      cooldown = 2;
    }
    // Kill: non-reversed band energy (matching hardware)
    for (let c = 0; c < cols; c++) {
      const killProb = (ceFwd[c] ?? 0) * 0.70;
      for (let r = 0; r < rows; r++)
        if (Math.random() < killProb) cells![c * rows + r] = 0;
    }
    // Conway's Game of Life step
    const alive = new Uint8Array(cols * rows);
    for (let i = 0; i < alive.length; i++) alive[i] = (cells![i] ?? 0) > 0.4 ? 1 : 0;
    const next = new Float32Array(cells!.length);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        let n = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const nc = c + dc, nr = r + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) n += alive[nc * rows + nr] ?? 0;
          }
        }
        const idx = c * rows + r;
        next[idx] = ((alive[idx] === 1) ? (n === 2 || n === 3) : n === 3) ? 1.0 : (cells![idx] ?? 0) * 0.75;
      }
    }
    for (let i = 0; i < cells!.length; i++) cells![i] = next[i] ?? 0;
    // Spawn sparks: 4 attempts per col per frame, rise 0.6+rand*0.6 matching hardware
    for (let c = 0; c < cols; c++) {
      const h = heights[c] ?? 0;
      if (h > 0) {
        for (let s = 0; s < 4; s++) {
          if (sparks.length < cols * 8 && Math.random() < (envelope![c] ?? 0) * 0.5)
            sparks.push({ col: c, pos: rows - h - 0.5, v: 200 + Math.random() * 55 });
        }
      }
    }
    const data = new Uint8Array(cols * rows);
    // Render inverted life within bar area
    for (let c = 0; c < cols; c++)
      for (let r = rows - (heights[c] ?? 0); r < rows; r++)
        data[c * rows + r] = Math.round((1 - (cells![c * rows + r] ?? 0)) * 255);
    // Render sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!;
      s.pos -= 0.6 + Math.random() * 0.6;
      s.v *= 0.93;
      if (s.pos < 0 || s.v < 15) { sparks.splice(i, 1); continue; }
      const r = Math.round(s.pos);
      if (r >= 0 && r < rows) data[s.col * rows + r] = Math.max(data[s.col * rows + r] ?? 0, Math.round(s.v));
    }
    return data;
  };
}

function fullWaterfall(): FullRenderer {
  let history: Uint8Array[] | null = null;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!history || history.length !== rows || history[0]?.length !== cols) history = Array.from({ length: rows }, () => new Uint8Array(cols));
    const ce = colEnergies(bands, gain, ref, cols);
    const newRow = new Uint8Array(cols);
    for (let c = 0; c < cols; c++) newRow[c] = Math.round((ce[c] ?? 0) * 255);
    history.shift();
    history.push(newRow);
    const data = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        data[c * rows + r] = history[r]?.[c] ?? 0;
    return data;
  };
}

function fullScopeDual(): FullRenderer {
  let bufA: Float32Array | null = null;
  let bufB: Float32Array | null = null;
  let hist: Float32Array[] | null = null;
  const DELAY = 7;
  let head = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!bufA || bufA.length !== cols * rows) {
      bufA = new Float32Array(cols * rows);
      bufB = new Float32Array(cols * rows);
      hist = Array.from({ length: DELAY }, () => new Float32Array(cols));
      head = 0;
    }
    for (let i = 0; i < bufA.length; i++) bufA[i] = (bufA[i] ?? 0) * 0.83;
    for (let i = 0; i < bufB!.length; i++) bufB![i] = (bufB![i] ?? 0) * 0.73;
    const ce = colEnergies(bands, gain, ref, cols);
    const cur = new Float32Array(cols);
    for (let c = 0; c < cols; c++) cur[c] = ce[c] ?? 0;
    hist![head]!.set(cur);
    head = (head + 1) % DELAY;
    const delayed = hist![head]!;
    for (let c = 0; c < cols; c++) {
      const rA = Math.max(0, Math.min(rows - 1, rows - 1 - Math.round((cur[c] ?? 0) * (rows - 1))));
      bufA[c * rows + rA] = 255;
      if (rA > 0)       bufA[c * rows + rA - 1] = Math.max(bufA[c * rows + rA - 1] ?? 0, 170);
      if (rA < rows - 1) bufA[c * rows + rA + 1] = Math.max(bufA[c * rows + rA + 1] ?? 0, 170);
      const dc = cols - 1 - c;
      const rB = Math.max(0, Math.min(rows - 1, rows - 1 - Math.round((delayed[dc] ?? 0) * (rows - 1))));
      bufB![c * rows + rB] = 255;
      if (rB > 0)       bufB![c * rows + rB - 1] = Math.max(bufB![c * rows + rB - 1] ?? 0, 150);
      if (rB < rows - 1) bufB![c * rows + rB + 1] = Math.max(bufB![c * rows + rB + 1] ?? 0, 150);
    }
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < data.length; i++) data[i] = Math.min(255, Math.round(Math.max(bufA[i] ?? 0, bufB![i] ?? 0)));
    return data;
  };
}

function fullRhythm(): FullRenderer {
  // Matches makeDripLine(innerTrailWidth=5, trailDecay=0.88):
  // event-triggered horizontal scan lines expanding from center row
  const ripples: number[] = [];
  let trail: Float32Array | null = null;
  let smoothed = 0, cooldown = 0;
  const RING_WIDTH = 1.5;
  const INNER_TRAIL = 5;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!trail || trail.length !== cols * rows) { trail = new Float32Array(cols * rows); smoothed = 0; cooldown = 0; }
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    else if (t > 0.08 && delta > 0.05) { ripples.push(0); cooldown = 2; }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i] = (ripples[i] ?? 0) + 0.6;
      if ((ripples[i] ?? 0) > rows / 2 + RING_WIDTH) ripples.splice(i, 1);
    }
    const decayRate = 0.88 - t * 0.45;
    for (let i = 0; i < trail!.length; i++) trail![i] = (trail![i] ?? 0) * decayRate;
    const ce = colEnergies(bands, gain, ref, cols);
    const CENTER = (rows - 1) / 2;
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      for (let r = 0; r < rows; r++) {
        const idx = c * rows + r;
        let v = 0;
        for (const y of ripples) {
          const rowDist = Math.abs(r - CENTER);
          const dist = Math.min(Math.abs(r - (CENTER - y)), Math.abs(r - (CENTER + y)));
          const rv = Math.max(0, 1 - dist / RING_WIDTH);
          v = Math.max(v, rv);
          if (rowDist < y && y - rowDist <= INNER_TRAIL)
            trail![idx] = Math.max(trail![idx] ?? 0, (1 - (y - rowDist) / INNER_TRAIL) * 0.9);
        }
        if (v > 0 && Math.random() < energy * 0.7) v = 0;
        data[idx] = Math.min(255, Math.round(Math.max(v, trail![idx] ?? 0) * 255));
      }
    }
    return data;
  };
}

function fullSparks(): FullRenderer {
  let grid: Uint8Array | null = null;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!grid || grid.length !== cols * rows) grid = new Uint8Array(cols * rows);
    const ce = colEnergies(bands, gain, ref, cols);
    // Shift all rows up by one
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols; c++)
        grid[c * rows + r] = grid[c * rows + r + 1] ?? 0;
    // Spawn bottom row
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      grid[c * rows + (rows - 1)] = Math.random() < energy ? 255 : 0;
    }
    return new Uint8Array(grid);
  };
}

// ── Group B: particle / fall systems ──────────────────────────────────────

function fullNeo(): FullRenderer {
  interface Drop { pos: number; col: number; speed: number }
  let drops: Drop[] = [];
  const TRAIL = 9;
  const MAX_PER_COL = 3;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    const ce = colEnergies(bands, gain, ref, cols);
    const data = new Uint8Array(cols * rows);
    const colCount = new Uint8Array(cols);
    for (const d of drops) colCount[d.col] = (colCount[d.col] ?? 0) + 1;
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      if ((colCount[c] ?? 0) < MAX_PER_COL && Math.random() < energy * 0.18)
        drops.push({ pos: 0, col: c, speed: 0.4 + energy * 2.0 });
    }
    drops = drops.filter(d => {
      d.pos += d.speed;
      const head = Math.round(d.pos);
      for (let t = 0; t < TRAIL; t++) {
        const r = head - t;
        if (r >= 0 && r < rows) {
          const v = Math.round(255 * Math.pow(0.65, t));
          const idx = d.col * rows + r;
          data[idx] = Math.max(data[idx] ?? 0, v);
        }
      }
      return d.pos < rows + TRAIL;
    });
    return data;
  };
}

function fullHex(): FullRenderer {
  interface Drop { pos: number; col: number; speed: number }
  let drops: Drop[] = [];
  let lastCols = 0, lastRows = 0;
  const TRAIL = 9;
  const MAX_PER_COL = 5;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (cols !== lastCols || rows !== lastRows) { drops = []; lastCols = cols; lastRows = rows; }
    const ce = colEnergies(bands, gain, ref, cols);
    // Count active particles per column
    const colCount = new Uint8Array(cols);
    for (const d of drops) { if (d.col >= 0 && d.col < cols) colCount[d.col] = (colCount[d.col] ?? 0) + 1; }
    // Spawn at bottom, rise upward
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      if ((colCount[c] ?? 0) < MAX_PER_COL && Math.random() < energy * 0.45) {
        drops.push({ pos: rows - 1, col: c, speed: 0.4 + energy * 2.0 });
      }
    }
    const data = new Uint8Array(cols * rows);
    drops = drops.filter(d => {
      d.pos -= d.speed;
      const head = Math.round(d.pos);
      for (let t = 0; t < TRAIL; t++) {
        const r = head + t;  // trail hangs below head (higher row index)
        if (r >= 0 && r < rows) {
          const v = Math.round(255 * Math.pow(0.65, t));
          const idx = d.col * rows + r;
          data[idx] = Math.max(data[idx] ?? 0, v);
        }
      }
      return d.pos > -TRAIL;
    });
    return data;
  };
}

function fullCipher(): FullRenderer {
  let state: Float32Array | null = null;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!state || state.length !== cols * rows) {
      state = new Float32Array(cols * rows);
      for (let i = 0; i < state.length; i++) state[i] = Math.random();
    }
    const ce = colEnergies(bands, gain, ref, cols);
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      const flipRate = energy * 0.35;
      const decay = 0.94 - energy * 0.1;
      for (let r = 0; r < rows; r++) {
        const idx = c * rows + r;
        if (Math.random() < flipRate) {
          state[idx] = Math.random() < energy ? 1 : 0;
        } else {
          state[idx] = (state[idx] ?? 0) * decay;
        }
      }
    }
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < state.length; i++) data[i] = Math.round((state[i] ?? 0) * 255);
    return data;
  };
}

function fullDrop(): FullRenderer {
  interface Ripple { cx: number; cy: number; r: number }
  let ripples: Ripple[] = [];
  let trail: Float32Array | null = null;
  let smoothed = 0, cooldown = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!trail || trail.length !== cols * rows) trail = new Float32Array(cols * rows);
    const maxR = Math.sqrt(((cols - 1) / 2) ** 2 + ((rows - 1) / 2) ** 2) + 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    if (t > 0.08 && delta > 0.05 && cooldown === 0) {
      // cx weighted by band energy (matching hardware), scaled to display columns
      const totalE = bands.reduce((s, e) => s + e, 0);
      const cx = totalE > 0 ? bands.reduce((s, e, i) => s + e * i, 0) / totalE : cols / 2;
      ripples.push({ cx, cy: rows / 2 + (Math.random() - 0.5) * rows * 0.5, r: 0 });
      cooldown = 3;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i]!.r += 0.6;
      if (ripples[i]!.r > maxR) ripples.splice(i, 1);
    }
    const RING_WIDTH = 0.5;
    const INNER_TRAIL = 3;
    for (let i = 0; i < trail!.length; i++) trail![i] = (trail![i] ?? 0) * 0.65;
    const ce = colEnergies(bands, gain, ref, cols);
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      for (let r = 0; r < rows; r++) {
        const idx = c * rows + r;
        let v = 0, atLeadingEdge = false;
        for (const rp of ripples) {
          const dist = Math.sqrt((c - rp.cx) ** 2 + (r - rp.cy) ** 2);
          const rv = Math.max(0, 1 - Math.abs(dist - rp.r) / RING_WIDTH);
          v = Math.max(v, rv);
          if (rv > 0 && dist >= rp.r - 0.5) atLeadingEdge = true;
          if (dist <= rp.r && rp.r - dist <= INNER_TRAIL)
            trail![idx] = Math.max(trail![idx] ?? 0, (1 - (rp.r - dist) / INNER_TRAIL) * 0.9);
        }
        if (v > 0 && !atLeadingEdge && Math.random() < energy * 0.7) v = 0;
        data[idx] = Math.min(255, Math.round(Math.max(v, trail![idx] ?? 0) * 255));
      }
    }
    return data;
  };
}

function fullWake(): FullRenderer {
  let glow: Float32Array | null = null;
  const waves: number[] = [];
  let smoothed = 0, cooldown = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!glow || glow.length !== cols * rows) glow = new Float32Array(cols * rows);
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    if (t > 0.08 && delta > 0.06 && cooldown === 0) {
      waves.push(rows - 1);
      cooldown = 2;
    }
    const ce = colEnergies(bands, gain, ref, cols);
    for (let w = waves.length - 1; w >= 0; w--) {
      waves[w] = (waves[w] ?? 0) - (0.5 + t * 2.0);
      if ((waves[w] ?? 0) < 0) {
        waves.splice(w, 1);
      } else {
        const sr = Math.max(0, Math.min(rows - 1, Math.round(waves[w] ?? 0)));
        for (let c = 0; c < cols; c++)
          glow![c * rows + sr] = ce[c] ?? 0;
      }
    }
    // Decay after writing — matches hardware: wave rows appear at energy * 0.88 on first frame
    for (let i = 0; i < glow!.length; i++) glow![i] = (glow![i] ?? 0) * 0.88;
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < glow!.length; i++) data[i] = Math.min(255, Math.round((glow![i] ?? 0) * 255));
    return data;
  };
}

// ── Group C: complex / abstract ───────────────────────────────────────────

function fullSpiralD(): FullRenderer {
  let buf: Float32Array | null = null;
  let phase = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!buf || buf.length !== cols * rows) buf = new Float32Array(cols * rows);
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) * 0.68;
    phase += 0.03 + t * 0.09;
    const arms = 1 + Math.floor(t * 1.99);
    const CC = (cols - 1) / 2;
    const CR = (rows - 1) / 2;
    const steps = Math.max(cols, rows) * 2;
    for (let arm = 0; arm < arms; arm++) {
      const offset = (arm / arms) * 2 * Math.PI;
      for (let s = 0; s < steps; s++) {
        const frac = s / (steps - 1);
        const theta = phase + offset + frac * 5 * Math.PI;
        const c = Math.round(CC + Math.cos(theta) * CC * frac);
        const r = Math.round(CR + Math.sin(theta) * CR * frac);
        if (c >= 0 && c < cols && r >= 0 && r < rows)
          buf[c * rows + r] = Math.max(buf[c * rows + r] ?? 0, 80 + 175 * frac);
      }
    }
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < buf.length; i++) data[i] = Math.min(255, Math.round(buf[i] ?? 0));
    return data;
  };
}

function fullLifeErode(): FullRenderer {
  let cells: Float32Array | null = null;
  let smoothed = 0, cooldown = 0, thresholdMult = 1.0, blinkerActive = false;
  let lastCols = 0, lastRows = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!cells || lastCols !== cols || lastRows !== rows) {
      cells = new Float32Array(cols * rows);
      for (let i = 0; i < cells.length; i++) cells[i] = Math.random() < 0.35 ? 1.0 : 0;
      smoothed = 0; cooldown = 0; thresholdMult = 1.0; blinkerActive = false;
      lastCols = cols; lastRows = rows;
    }
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = smoothed * 0.85 + t * 0.15;
    if (cooldown > 0) cooldown--;
    const ce = colEnergies(bands, gain, ref, cols);
    // Transient seeding: seedRate=0.16
    if (delta > 0.10 && cooldown === 0) {
      for (let c = 0; c < cols; c++) {
        const e = ce[c] ?? 0;
        for (let r = 0; r < rows; r++) {
          if (Math.random() < e * 0.16) cells![c * rows + r] = 1.0;
        }
      }
      cooldown = 2;
    }
    // Continuous cull: continuousCull=0.66 (kills MORE on loud)
    for (let c = 0; c < cols; c++) {
      const killProb = (ce[c] ?? 0) * 0.66;
      for (let r = 0; r < rows; r++) {
        if (Math.random() < killProb) cells![c * rows + r] = 0;
      }
    }
    // Threshold-based alive determination (threshold=0.4, dippable)
    const effectiveThreshold = 0.4 * thresholdMult;
    const alive = new Uint8Array(cols * rows);
    for (let i = 0; i < alive.length; i++) alive[i] = (cells![i] ?? 0) > effectiveThreshold ? 1 : 0;
    // Conway Life step with decay=0.74
    const next = new Float32Array(cells!.length);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        let n = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const nc = c + dc, nr = r + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) n += alive[nc * rows + nr] ?? 0;
          }
        }
        const idx = c * rows + r;
        const isAlive = (alive[idx] ?? 0) === 1;
        const survives = isAlive ? (n === 2 || n === 3) : n === 3;
        next[idx] = survives ? 1.0 : (cells![idx] ?? 0) * 0.74;
      }
    }
    for (let i = 0; i < cells!.length; i++) cells![i] = next[i] ?? 0;
    // Revival: threshold-dip-blinker(dipRate=0.7)
    let aliveCount = 0;
    for (let i = 0; i < alive.length; i++) aliveCount += alive[i] ?? 0;
    if (aliveCount === 0) {
      thresholdMult = Math.max(0.01, thresholdMult * 0.7);
      if (thresholdMult <= 0.1 && !blinkerActive) {
        const bc = 1 + Math.floor(Math.random() * Math.max(1, cols - 3));
        const br = 1 + Math.floor(Math.random() * Math.max(1, rows - 2));
        cells![bc * rows + br] = 1.0;
        if (bc + 1 < cols) cells![(bc + 1) * rows + br] = 1.0;
        if (bc + 2 < cols) cells![(bc + 2) * rows + br] = 1.0;
        blinkerActive = true; thresholdMult = 1.0;
      }
    } else {
      thresholdMult = Math.min(1.0, thresholdMult / 0.7);
      blinkerActive = false;
    }
    const data = new Uint8Array(cells!.length);
    for (let i = 0; i < cells!.length; i++) data[i] = Math.round((cells![i] ?? 0) * 255);
    return data;
  };
}

function fullGlitchCorrupt(): FullRenderer {
  let buf: Float32Array | null = null;
  let smoothed = 0, cooldown = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!buf || buf.length !== cols * rows) { buf = new Float32Array(cols * rows); smoothed = 0; cooldown = 0; }
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    // Asymmetric smoothing: fast attack (0.05), fast fall (0.18) — matches hardware
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) * 0.9;
    if (t > 0.08 && delta > 0.04 && cooldown === 0) {
      const blocks = 1 + Math.floor(t * 4);
      for (let b = 0; b < blocks; b++) {
        // Block size scaled proportionally from hardware (1-3 cols on 9-wide, 2-10 rows on 34-tall)
        const bw = 1 + Math.floor(Math.random() * Math.max(1, Math.round(cols / 3)));
        const bh = 2 + Math.floor(Math.random() * Math.max(1, Math.round(rows * 10 / 34)));
        const bc = Math.floor(Math.random() * cols);
        const br = Math.floor(Math.random() * rows);
        for (let dc = 0; dc < bw; dc++)
          for (let dr = 0; dr < bh; dr++) {
            const c = (bc + dc) % cols;
            const r = br + dr;
            if (r < rows) buf[c * rows + r] = Math.max(buf[c * rows + r] ?? 0, 0.6 + Math.random() * 0.4);
          }
      }
      cooldown = 2;
    }
    // Stochastic binary render matching hardware (per-pixel random threshold each frame)
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < buf.length; i++)
      data[i] = Math.random() < (buf[i] ?? 0) ? 255 : 0;
    return data;
  };
}

function fullGlitchSortB(): FullRenderer {
  let colBufs: Float32Array[] | null = null;
  let offsets: Int16Array | null = null;
  let smoothed = 0, cooldown = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!colBufs || colBufs.length !== cols) {
      colBufs = Array.from({ length: cols }, () => new Float32Array(rows));
      offsets = new Int16Array(cols);
    }
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = Math.max(0, t - smoothed);
    smoothed = smoothed * 0.88 + t * 0.12;
    if (cooldown > 0) cooldown--;
    if (t > 0.08 && delta > 0.08 && cooldown === 0) {
      const maxShift = 2;
      for (let c = 0; c < cols; c++) offsets![c] = Math.round((Math.random() - 0.5) * maxShift * 2);
      cooldown = 10;
    } else {
      for (let c = 0; c < cols; c++) offsets![c] = Math.round((offsets![c] ?? 0) * 0.7);
    }
    const ce = colEnergies(bands, gain, ref, cols);
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      for (let r = 0; r < rows; r++) {
        colBufs![c]![r] = (colBufs![c]![r] ?? 0) * 0.86;
        if (Math.random() < energy * energy) colBufs![c]![r] = Math.max(colBufs![c]![r] ?? 0, 0.5 + Math.random() * 0.5);
      }
      // Bubble sort one step
      for (let r = 1; r < rows; r++) {
        if ((colBufs![c]![r] ?? 0) > (colBufs![c]![r - 1] ?? 0)) {
          const tmp = colBufs![c]![r] ?? 0; colBufs![c]![r] = colBufs![c]![r - 1] ?? 0; colBufs![c]![r - 1] = tmp;
        }
      }
    }
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const src = ((c - (offsets![c] ?? 0)) % cols + cols) % cols;
      for (let r = 0; r < rows; r++)
        data[c * rows + r] = Math.round((colBufs![src]![r] ?? 0) * 255);
    }
    return data;
  };
}

function fullStrobe(): FullRenderer {
  interface Bar { c: number; w: number }
  let bars: Bar[] = [];
  let splitBars: Bar[] = [];
  let smoothed = 0, cooldown = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    if (t > 0.08 && delta > 0.04 && cooldown === 0) {
      bars = []; splitBars = [];
      const n = 1 + Math.floor(t * 3.5);
      const barW = Math.max(1, Math.round(cols / 9));  // scale bar width with cols
      const occupied = new Uint8Array(cols);
      for (let i = 0; i < n; i++) {
        const avail: number[] = [];
        for (let c = 0; c < cols; c++) if (!occupied[c]) avail.push(c);
        if (avail.length === 0) {
          const wide = bars.filter(b => b.w >= 2);
          if (wide.length > 0) {
            const wb = wide[Math.floor(Math.random() * wide.length)]!;
            splitBars.push({ c: wb.c + Math.floor(Math.random() * wb.w), w: 1 });
          }
          break;
        }
        const c = avail[Math.floor(Math.random() * avail.length)]!;
        const w = c + barW * 2 <= cols && !occupied[c + 1] && Math.random() > 0.55 ? barW * 2 : barW;
        bars.push({ c, w });
        for (let dc = Math.max(0, c - 1); dc <= Math.min(cols - 1, c + w); dc++) occupied[dc] = 1;
      }
      cooldown = 1;
    }
    const data = new Uint8Array(cols * rows);
    for (const { c, w } of bars)
      for (let dc = 0; dc < w; dc++)
        if (c + dc < cols)
          for (let r = 0; r < rows; r++)
            data[(c + dc) * rows + r] = 255;
    for (const { c, w } of splitBars)
      for (let dc = 0; dc < w; dc++)
        if (c + dc < cols)
          for (let r = 0; r < rows; r++) {
            const idx = (c + dc) * rows + r;
            data[idx] = (data[idx] ?? 0) ^ 255;
          }
    return data;
  };
}

function fullSpecter(): FullRenderer {
  // Inward particles with kaleidoscopic mirrors — matches hardware makeSparksKaleidoH
  const MAX_P = 800;
  const pcf = new Float32Array(MAX_P); // particle col (float)
  const prr = new Float32Array(MAX_P); // particle row (float)
  const pdc = new Float32Array(MAX_P); // col drift per row step
  let count = 0;
  let tick = 0;
  let lastCols = 0, lastRows = 0;
  const TRAIL = 4;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (cols !== lastCols || rows !== lastRows) { count = 0; lastCols = cols; lastRows = rows; }
    const CC = (cols - 1) / 2;
    const CR = (rows - 1) / 2;
    // TRAVEL = rows from outer edge to center row
    const TRAVEL = Math.max(1, rows - 1 - Math.floor(rows / 2));
    // Advance particles (move toward center / upward)
    let write = 0;
    for (let i = 0; i < count; i++) {
      const ri = (prr[i] ?? 0) - 1;
      const ci = (pcf[i] ?? 0) + (pdc[i] ?? 0);
      if (ri >= 0) { prr[write] = ri; pcf[write] = ci; pdc[write] = pdc[i] ?? 0; write++; }
    }
    count = write;
    // Spawn new particles from the outer row, drifting toward center column
    const ce = colEnergies(bands, gain, ref, cols);
    for (let c = 0; c < cols; c++) {
      const energy = ce[c] ?? 0;
      if (Math.random() < energy * 0.12 && count < MAX_P) {
        pcf[count] = c;
        prr[count] = rows - 1;
        pdc[count] = (CC - c) / TRAVEL;
        count++;
      }
    }
    const buf = new Float32Array(cols * rows);
    const a1 = tick * 0.015;
    const a2 = tick * 0.0091;
    const paint = (c: number, r: number, v: number) => {
      if (c < 0 || c >= cols || r < 0 || r >= rows || v <= 0) return;
      const idx = c * rows + r;
      if (v <= (buf[idx] ?? 0)) return;
      buf[idx] = v;
      // Two rotating mirror transforms
      const nx = (c - CC) / (CC || 1);
      const ny = (r - CR) / (CR || 1);
      for (const a of [a1, a2]) {
        const c2a = Math.cos(2 * a), s2a = Math.sin(2 * a);
        const mc = Math.round((nx * c2a + ny * s2a) * CC + CC);
        const mr = Math.round((nx * s2a - ny * c2a) * CR + CR);
        if (mc >= 0 && mc < cols && mr >= 0 && mr < rows)
          buf[mc * rows + mr] = Math.max(buf[mc * rows + mr] ?? 0, v);
      }
    };
    for (let i = 0; i < count; i++) {
      paint(Math.round(pcf[i] ?? 0), Math.round(prr[i] ?? 0), 255);
      for (let ti = 1; ti < TRAIL; ti++) {
        const tc = Math.round((pcf[i] ?? 0) - (pdc[i] ?? 0) * ti);
        const tr = Math.round((prr[i] ?? 0) + ti);
        paint(tc, tr, Math.round(255 * Math.pow(0.55, ti)));
      }
    }
    tick++;
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < buf.length; i++) data[i] = Math.round(buf[i] ?? 0);
    return data;
  };
}

function fullCircuit(): FullRenderer {
  let blockCorrupt: Float32Array | null = null;
  let blockAge: Uint8Array | null = null;
  let lastCols = 0, lastRows = 0, lastNH = 0, lastNV = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    const BW = Math.max(2, Math.round(cols / 6));
    const BH = Math.max(2, Math.round(rows / 9));
    const NH = Math.ceil(cols / BW);
    const NV = Math.ceil(rows / BH);
    if (cols !== lastCols || rows !== lastRows || NH !== lastNH || NV !== lastNV) {
      blockCorrupt = new Float32Array(NH * NV);
      blockAge = new Uint8Array(NH * NV);
      lastCols = cols; lastRows = rows; lastNH = NH; lastNV = NV;
    }
    const ce = colEnergies(bands, gain, ref, cols);
    for (let bh = 0; bh < NH; bh++) {
      let energy = 0, cnt = 0;
      for (let c = bh * BW; c < Math.min((bh + 1) * BW, cols); c++) { energy += ce[c] ?? 0; cnt++; }
      energy /= Math.max(1, cnt);
      for (let bv = 0; bv < NV; bv++) {
        const idx = bh * NV + bv;
        blockAge![idx] = ((blockAge![idx] ?? 0) + 1) % (2 + bv % 5);
        if (blockAge![idx] === 0)
          blockCorrupt![idx] = energy > 0.20 && Math.random() < energy * 0.7
            ? Math.random()
            : (blockCorrupt![idx] ?? 0) * 0.45;
      }
    }
    const data = new Uint8Array(cols * rows);
    for (let bh = 0; bh < NH; bh++) {
      for (let bv = 0; bv < NV; bv++) {
        const corr = blockCorrupt![bh * NV + bv] ?? 0;
        for (let c = bh * BW; c < Math.min((bh + 1) * BW, cols); c++)
          for (let r = bv * BH; r < Math.min((bv + 1) * BH, rows); r++)
            data[c * rows + r] = corr > 0.08 ? (Math.random() < corr ? 255 : 0) : 0;
      }
    }
    return data;
  };
}

// ── Factory ───────────────────────────────────────────────────────────────

const RENDERERS: Record<AudioStyle, () => FullRenderer> = {
  'spectrum-fall':  fullSpectrumFall,
  'spirits':        fullSpirits,
  'vu-glitch':      fullVuGlitch,
  'kick-d':         fullKickD,
  'dark-matter':    fullDarkMatter,
  'heat':           fullHeat,
  'waterfall':      fullWaterfall,
  'scope-dual':     fullScopeDual,
  'rhythm':         fullRhythm,
  'sparks':         fullSparks,
  'neo':            fullNeo,
  'hex':            fullHex,
  'cipher':         fullCipher,
  'drop':           fullDrop,
  'wake':           fullWake,
  'spiral-d':       fullSpiralD,
  'life-erode-4':   fullLifeErode,
  'glitch-corrupt': fullGlitchCorrupt,
  'glitch-sort-b':  fullGlitchSortB,
  'strobe':         fullStrobe,
  'specter':        fullSpecter,
  'circuit':        fullCircuit,
};

export function createFullRenderer(style: AudioStyle): FullRenderer {
  const factory = RENDERERS[style];
  if (!factory) return fullDarkMatter();
  return factory();
}
