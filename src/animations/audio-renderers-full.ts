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

// ── Group A: bar/column-per-band (natural scale) ──────────────────────────

function fullSpectrumFall(): FullRenderer {
  let history: Uint8Array[] | null = null;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!history || history.length !== rows || history[0]?.length !== cols)
      history = Array.from({ length: rows }, () => new Uint8Array(cols));
    const center = Math.floor(rows / 2);
    const newRow = new Uint8Array(cols);
    for (let c = 0; c < cols; c++) newRow[c] = Math.round(dbLevel(bands[c] ?? 0, gain, ref) * 255);
    history.shift();
    history.push(newRow);
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const halfH = Math.round(((newRow[c] ?? 0) / 255) * center);
      for (let r = 0; r < rows; r++) {
        if (Math.abs(r - center) <= halfH) data[c * rows + r] = 255 - (history[r]?.[c] ?? 0);
      }
    }
    return data;
  };
}

function fullSpirits(): FullRenderer {
  const ghosts: Float32Array[] = [];
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (ghosts.length !== cols) {
      ghosts.length = 0;
      for (let c = 0; c < cols; c++) ghosts.push(new Float32Array(rows));
    }
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
      const g = ghosts[c]!;
      for (let r = 0; r < rows; r++) g[r] = (g[r] ?? 0) * 0.82;
      const targetRow = Math.max(0, rows - 1 - Math.round(energy * (rows - 1)));
      g[targetRow] = Math.max(g[targetRow] ?? 0, 1.0);
      if (targetRow > 0)        g[targetRow - 1] = Math.max(g[targetRow - 1] ?? 0, 0.6);
      if (targetRow < rows - 1) g[targetRow + 1] = Math.max(g[targetRow + 1] ?? 0, 0.6);
      for (let r = 0; r < rows; r++) data[c * rows + r] = Math.round((g[r] ?? 0) * 255);
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
      if (Math.random() < spike * 4) buf[r] = Math.min(1, (buf[r] ?? 0) + 0.4 + Math.random() * 0.5);
      buf[r] = (buf[r] ?? 0) * 0.88;
    }
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
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
  let cooldown = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!y || y.length !== cols) { y = new Float32Array(cols); vy = new Float32Array(cols); smoothedB = new Float32Array(cols); }
    const center = (cols - 1) / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    let maxDelta = 0;
    for (let i = 0; i < cols; i++) {
      const bLevel = dbLevel(bands[i] ?? 0, gain, ref);
      const bDelta = bLevel - (smoothedB![i] ?? 0);
      smoothedB![i] = bLevel > (smoothedB![i] ?? 0)
        ? (smoothedB![i] ?? 0) * 0.95 + bLevel * 0.05
        : (smoothedB![i] ?? 0) * 0.82 + bLevel * 0.18;
      if (bDelta > maxDelta) maxDelta = bDelta;
    }
    if (cooldown > 0) cooldown--;
    if (t > 0.12 && maxDelta > 0.08 && cooldown === 0) {
      for (let col = 0; col < cols; col++) {
        if ((y![col] ?? 0) <= 2) {
          const normDist = Math.abs(col - center) / (center || 1);
          const factor = 0.4 + 0.6 * Math.pow(1 - normDist, 2);
          vy![col] = t * rows * 0.6 * factor;
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
    // Aggregate many fine-grained log-spaced bands into 9 hardware-equivalent buckets,
    // then smoothly interpolate back to cols display columns. This matches the hardware
    // 9-band visual (wide frequency buckets) regardless of how many bands were requested.
    const NUM_BUCKETS = Math.min(9, cols);
    const buckets = new Float32Array(NUM_BUCKETS);
    for (let b = 0; b < NUM_BUCKETS; b++) {
      const start = Math.floor((b / NUM_BUCKETS) * cols);
      const end = Math.max(start + 1, Math.floor(((b + 1) / NUM_BUCKETS) * cols));
      let sum = 0;
      for (let c = start; c < end; c++) sum += dbLevel(bands[c] ?? 0, gain, ref);
      buckets[b] = sum / (end - start);
    }
    const energies = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      const frac = (c / Math.max(1, cols - 1)) * (NUM_BUCKETS - 1);
      const b0 = Math.floor(frac);
      const b1 = Math.min(NUM_BUCKETS - 1, b0 + 1);
      const lerp = frac - b0;
      energies[c] = (buckets[b0] ?? 0) * (1 - lerp) + (buckets[b1] ?? 0) * lerp;
    }
    // Rising sparks: shift upward one row, spawn bottom row
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols; c++)
        grid![c * rows + r] = grid![c * rows + r + 1] ?? 0;
    for (let c = 0; c < cols; c++)
      grid![c * rows + (rows - 1)] = Math.random() < (energies[c] ?? 0) ? 255 : 0;
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = energies[c] ?? 0;
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
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!cells || !envelope || cols !== lastCols || rows !== lastRows) {
      cells = new Float32Array(cols * rows);
      envelope = new Float32Array(cols);
      for (let i = 0; i < cells.length; i++) if (Math.random() < 0.35) cells[i] = 1.0;
      sparks = [];
      lastCols = cols; lastRows = rows;
    }
    // Hardware reads bands in reverse (high freq → left column)
    const heights = new Int32Array(cols);
    for (let c = 0; c < cols; c++) {
      const t = dbLevel(bands[cols - 1 - c] ?? 0, gain, ref);
      envelope![c] = t > (envelope![c] ?? 0) ? t : (envelope![c] ?? 0) * 0.85 + t * 0.15;
      const flicker = (envelope![c] ?? 0) * (0.7 + Math.random() * 0.5);
      heights[c] = Math.round(Math.min(1, flicker) * rows * 0.25);
    }
    // Continuous cull (from band energy)
    for (let c = 0; c < cols; c++) {
      const killProb = dbLevel(bands[cols - 1 - c] ?? 0, gain, ref) * 0.70;
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
    // Spawn rising sparks above bar tops (cap to avoid unbounded growth)
    for (let c = 0; c < cols; c++) {
      const h = heights[c] ?? 0;
      if (h > 0 && sparks.length < cols * 4 && Math.random() < (envelope![c] ?? 0) * 0.5)
        sparks.push({ col: c, pos: rows - h - 0.5, v: 200 + Math.random() * 55 });
    }
    const data = new Uint8Array(cols * rows);
    // Render inverted life within bar area
    for (let c = 0; c < cols; c++)
      for (let r = rows - (heights[c] ?? 0); r < rows; r++)
        data[c * rows + r] = Math.round((1 - (cells![c * rows + r] ?? 0)) * 255);
    // Render sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!;
      s.pos -= 0.4 + Math.random() * 0.4;
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
    const newRow = new Uint8Array(cols);
    for (let c = 0; c < cols; c++) newRow[c] = Math.round(dbLevel(bands[c] ?? 0, gain, ref) * 255);
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
    const cur = new Float32Array(cols);
    for (let c = 0; c < cols; c++) cur[c] = dbLevel(bands[c] ?? 0, gain, ref);
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
  const CC_FRAC = 0.5;
  const CR_FRAC = 0.5;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const cx = (cols - 1) * CC_FRAC;
    const cy = (rows - 1) * CR_FRAC;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const numRings = Math.max(2, Math.round(t * 6) + 2);
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const dist = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
        const norm = dist / maxR;
        // Multiple rings spaced evenly
        let maxV = 0;
        for (let ring = 0; ring < numRings; ring++) {
          const ringFrac = (ring + 0.5) / numRings;
          const delta = Math.abs(norm - ringFrac);
          const v = Math.max(0, 1 - delta * numRings * 1.5) * (1 - ring / numRings) * (0.4 + t * 0.6);
          maxV = Math.max(maxV, v);
        }
        data[c * rows + r] = Math.round(maxV * 255);
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
    // Shift all rows up by one
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols; c++)
        grid[c * rows + r] = grid[c * rows + r + 1] ?? 0;
    // Spawn bottom row
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
      grid[c * rows + (rows - 1)] = Math.random() < energy ? 255 : 0;
    }
    return new Uint8Array(grid);
  };
}

// ── Group B: particle / fall systems ──────────────────────────────────────

function fullNeo(): FullRenderer {
  interface Drop { pos: number; col: number; speed: number }
  let drops: Drop[] = [];
  const TRAIL = 12;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    const data = new Uint8Array(cols * rows);
    const colCount = new Uint8Array(cols);
    for (const d of drops) colCount[d.col] = (colCount[d.col] ?? 0) + 1;
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
      const maxDrops = Math.max(1, Math.round(cols / 8));
      if ((colCount[c] ?? 0) < maxDrops && Math.random() < energy * 0.5)
        drops.push({ pos: 0, col: c, speed: 0.5 + energy * 2.5 });
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
  const TRAIL = 10;
  const HEADS_PER_COL = 3;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
      if (Math.random() < energy * 0.3) {
        drops.push({ pos: Math.random() * rows * 0.5, col: c, speed: 0.3 + energy * 1.5 });
      }
    }
    drops = drops.filter(d => {
      d.pos += d.speed;
      const head = Math.round(d.pos);
      for (let t = 0; t < TRAIL; t++) {
        const r = head - t;
        if (r >= 0 && r < rows) {
          const v = Math.round(255 * Math.pow(0.68, t));
          const idx = d.col * rows + r;
          data[idx] = Math.max(data[idx] ?? 0, v);
        }
      }
      return d.pos < rows + TRAIL;
    });
    if (drops.length > cols * HEADS_PER_COL * 2) drops.splice(0, drops.length - cols * HEADS_PER_COL);
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
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
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
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
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
    // Decay before writing so newly written wave rows appear at full brightness
    for (let i = 0; i < glow!.length; i++) glow![i] = (glow![i] ?? 0) * 0.88;
    for (let w = waves.length - 1; w >= 0; w--) {
      waves[w] = (waves[w] ?? 0) - (0.5 + t * 2.0);
      if ((waves[w] ?? 0) < 0) {
        waves.splice(w, 1);
      } else {
        const sr = Math.max(0, Math.min(rows - 1, Math.round(waves[w] ?? 0)));
        for (let c = 0; c < cols; c++)
          glow![c * rows + sr] = dbLevel(bands[c] ?? 0, gain, ref);
      }
    }
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
    for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) * 0.72;
    phase += 0.025 + t * 0.08;
    const arms = 1 + Math.floor(t * 2.99);
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
  let cells: Uint8Array | null = null;
  let lastCols = 0, lastRows = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!cells || lastCols !== cols || lastRows !== rows) {
      cells = new Uint8Array(cols * rows);
      // Random seed
      for (let i = 0; i < cells.length; i++) cells[i] = Math.random() < 0.2 ? 255 : 0;
      lastCols = cols; lastRows = rows;
    }
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const next = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
      // Re-seed columns from band energy
      if (Math.random() < energy * 0.12) {
        const r = Math.floor(Math.random() * rows);
        cells[c * rows + r] = 255;
      }
      for (let r = 0; r < rows; r++) {
        let alive = 0;
        for (let dc = -1; dc <= 1; dc++)
          for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const nc = (c + dc + cols) % cols;
            const nr = (r + dr + rows) % rows;
            if ((cells[nc * rows + nr] ?? 0) > 0) alive++;
          }
        const isAlive = (cells[c * rows + r] ?? 0) > 0;
        // Conway's Game of Life rules + continuous decay
        if (isAlive) {
          next[c * rows + r] = (alive === 2 || alive === 3) ? Math.max(60, Math.round((cells[c * rows + r] ?? 0) * (0.7 + t * 0.25))) : 0;
        } else {
          next[c * rows + r] = alive === 3 ? 255 : 0;
        }
      }
    }
    cells = next;
    return new Uint8Array(cells);
  };
}

function fullGlitchCorrupt(): FullRenderer {
  let noise: Float32Array | null = null;
  let prevT = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!noise || noise.length !== cols * rows) noise = new Float32Array(cols * rows);
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const spike = Math.max(0, t - prevT);
    prevT = prevT * 0.88 + t * 0.12;
    // Corrupt random rectangular blocks on transients
    if (spike > 0.05) {
      const blockW = Math.max(2, Math.round(cols * 0.2));
      const blockH = Math.max(2, Math.round(rows * 0.25));
      const numBlocks = 1 + Math.floor(spike * 5);
      for (let b = 0; b < numBlocks; b++) {
        const bc = Math.floor(Math.random() * cols);
        const br = Math.floor(Math.random() * rows);
        for (let dc = 0; dc < blockW; dc++)
          for (let dr = 0; dr < blockH; dr++) {
            const c = (bc + dc) % cols;
            const r = (br + dr) % rows;
            noise[c * rows + r] = Math.random() < 0.6 ? 1.0 : 0;
          }
      }
    }
    // Decay
    for (let i = 0; i < noise.length; i++) noise[i] = (noise[i] ?? 0) * 0.85;
    const data = new Uint8Array(cols * rows);
    for (let i = 0; i < noise.length; i++) {
      const v = noise[i] ?? 0;
      if (v > 0.08) data[i] = Math.round(v * 255);
    }
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
    if (t > 0.08 && delta > 0.07 && cooldown === 0) {
      const maxShift = 2; // matches hardware: hardware offset is ±2 columns (Int8Array ±2)
      for (let c = 0; c < cols; c++) offsets![c] = Math.round((Math.random() - 0.5) * maxShift * 2);
      cooldown = 8;
    } else {
      for (let c = 0; c < cols; c++) offsets![c] = Math.round((offsets![c] ?? 0) * 0.7);
    }
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
      for (let r = 0; r < rows; r++) {
        colBufs![c]![r] = (colBufs![c]![r] ?? 0) * 0.86;
        if (Math.random() < energy * energy) colBufs![c]![r] = Math.max(colBufs![c]![r] ?? 0, 0.5 + Math.random() * 0.5);
      }
      // Bubble sort one step
      for (let r = 1; r < rows; r++) {
        if ((colBufs![c]![r] ?? 0) > (colBufs![c]![r - 1] ?? 0)) {
          const tmp = colBufs![c]![r]; colBufs![c]![r] = colBufs![c]![r - 1]; colBufs![c]![r - 1] = tmp;
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
  let smoothed = 0, cooldown = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    const delta = t - smoothed;
    smoothed = t > smoothed ? smoothed * 0.95 + t * 0.05 : smoothed * 0.82 + t * 0.18;
    if (cooldown > 0) cooldown--;
    if (t > 0.08 && delta > 0.04 && cooldown === 0) {
      bars = [];
      const n = 1 + Math.floor(t * 3.5);
      const occupied = new Uint8Array(cols);
      for (let i = 0; i < n; i++) {
        const avail: number[] = [];
        for (let c = 0; c < cols; c++) if (!occupied[c]) avail.push(c);
        if (avail.length === 0) break;
        const c = avail[Math.floor(Math.random() * avail.length)]!;
        const maxW = Math.max(1, Math.round(cols * 0.1));
        const w = c + maxW <= cols && !occupied[c + 1] && Math.random() > 0.5 ? Math.min(maxW, 2) : 1;
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
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
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
  let buf: Float32Array | null = null;
  let tick = 0;
  return ({ bands, cols, rows, gain, fftSize }) => {
    const ref = fftSize / 2;
    if (!buf || buf.length !== cols * rows) buf = new Float32Array(cols * rows);
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    const t = dbLevel(avg, gain, ref);
    tick++;
    const bw = Math.max(3, Math.round(cols / 6));
    const bh = Math.max(3, Math.round(rows / 6));
    const data = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) {
      const energy = dbLevel(bands[c] ?? 0, gain, ref);
      for (let r = 0; r < rows; r++) {
        const bv = Math.floor(r / bh), bx = Math.floor(c / bw);
        const inBlock = (bv + bx + tick) % 3 !== 0 && (c * 7 + r * 11 + tick) % 5 < 3;
        buf[c * rows + r] = (buf[c * rows + r] ?? 0) * 0.88;
        if (inBlock && Math.random() < energy * 0.3 + t * 0.05) buf[c * rows + r] = Math.min(1.0, (buf[c * rows + r] ?? 0) + 0.4);
        data[c * rows + r] = Math.round((buf[c * rows + r] ?? 0) * 255);
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
