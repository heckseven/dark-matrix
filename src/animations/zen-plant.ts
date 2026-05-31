import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenPlantStyle = 'pine' | 'seeds';

export function createZenPlantRenderer(style: ZenPlantStyle): ZenRendererApi {
  switch (style) {
    case 'pine':  return createPlant2Renderer();
    case 'seeds': return createPlant3Renderer();
  }
}

// ---------------------------------------------------------------------------
// Shared types and helpers
// ---------------------------------------------------------------------------

type Phase = 'growing' | 'swaying' | 'snowing';

interface SnowParticle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  brightness: number;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function setPixel(f: Frame, col: number, row: number, brightness: number): void {
  const c = Math.round(col);
  const r = Math.round(row);
  if (c < 0 || c >= FRAME_COLS || r < 0 || r >= FRAME_ROWS) return;
  const idx = c * FRAME_ROWS + r;
  f[idx] = clamp255(Math.max(f[idx] ?? 0, brightness));
}

function setPixelAdd(f: Frame, col: number, row: number, brightness: number): void {
  const c = Math.round(col);
  const r = Math.round(row);
  if (c < 0 || c >= FRAME_COLS || r < 0 || r >= FRAME_ROWS) return;
  const idx = c * FRAME_ROWS + r;
  f[idx] = clamp255((f[idx] ?? 0) + brightness);
}

/** Bresenham line on frame, storing lit pixels into an array if provided. */
function drawLinePx(
  f: Frame,
  x0: number, y0: number,
  x1: number, y1: number,
  value: number,
  litPixels?: Array<[number, number]>,
): void {
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - cx);
  const dy = Math.abs(ey - cy);
  const sx = cx < ex ? 1 : -1;
  const sy = cy < ey ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    setPixel(f, cx, cy, value);
    if (litPixels) litPixels.push([cx, cy]);
    if (cx === ex && cy === ey) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

/**
 * Apply horizontal sway displacement at render time.
 * Displacement scales linearly from 0 at bottom to max at top.
 * Returns a new sway-adjusted copy of the pixel list.
 */
function applySwayToPixels(
  pixels: Array<[number, number]>,
  swayOffset: number, // max sway at top in cols
): Array<[number, number, number]> { // [col, row, orig_col]
  return pixels.map(([c, r]) => {
    const heightFrac = 1 - r / FRAME_ROWS; // 0 at bottom, 1 at top
    const displaced = c + swayOffset * heightFrac;
    return [displaced, r, c] as [number, number, number];
  });
}

// ---------------------------------------------------------------------------
// plant-1: Branching tree
// ---------------------------------------------------------------------------
function createPlant1Renderer(side?: 'left' | 'right'): ZenRendererApi {
  const colOffset = side === 'right' ? FRAME_COLS : 0;
  const totalCols = side !== undefined ? FRAME_COLS * 2 : FRAME_COLS;
  const centerCol = Math.round((totalCols - 1) / 2) - colOffset;

  const GROW_DURATION = 18_000;
  const SWAY_DURATION = 8_000;
  const SNOW_DURATION = 5_000;
  const SWAY_FREQ = (2 * Math.PI) / 4000; // full cycle in 4s
  const SWAY_AMP = 1.5;

  // Branch definitions: [trunkRow, direction, length]
  const branches: Array<{ atRow: number; dir: number; len: number }> = [
    { atRow: 24, dir: -1, len: 5 },
    { atRow: 24, dir: 1, len: 5 },
    { atRow: 18, dir: -1, len: 5 },
    { atRow: 18, dir: 1, len: 5 },
    { atRow: 12, dir: -1, len: 4 },
    { atRow: 12, dir: 1, len: 4 },
  ];

  // Trunk goes from row 33 up to row 4
  const TRUNK_TOP = 4;
  const TRUNK_BOTTOM = FRAME_ROWS - 1;
  const TRUNK_HEIGHT = TRUNK_BOTTOM - TRUNK_TOP;
  // Trunk growth: 2 rows/s → 9s for full trunk
  const TRUNK_GROW_RATE = TRUNK_HEIGHT / 9000; // rows per ms

  let phase: Phase = 'growing';
  let phaseStartTime = Date.now();
  let particles: SnowParticle[] = [];

  // Build canonical pixel list for the fully grown plant
  function buildCanonicalPixels(): Array<[number, number]> {
    const pixels: Array<[number, number]> = [];
    // Trunk: 2 pixels wide
    for (let row = TRUNK_TOP; row <= TRUNK_BOTTOM; row++) {
      pixels.push([centerCol, row]);
      if (centerCol + 1 < FRAME_COLS) pixels.push([centerCol + 1, row]);
    }
    // Branches
    for (const br of branches) {
      for (let d = 1; d <= br.len; d++) {
        const bc = centerCol + br.dir * d;
        const br_row = br.atRow + d; // 45°
        pixels.push([bc, br_row]);
        // Bud at tip
        if (d === br.len) {
          pixels.push([bc, br_row - 1]);
          if (bc + 1 < FRAME_COLS) pixels.push([bc + 1, br_row]);
        }
      }
    }
    return pixels;
  }

  const canonicalPixels = buildCanonicalPixels();

  function reset(): void {
    phase = 'growing';
    phaseStartTime = Date.now();
    particles = [];
  }

  let stopped = false;

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const now = Date.now();
      const phaseElapsed = now - phaseStartTime;

      // Phase transitions
      if (phase === 'growing' && phaseElapsed >= GROW_DURATION) {
        phase = 'swaying';
        phaseStartTime = now;
      } else if (phase === 'swaying' && phaseElapsed >= SWAY_DURATION) {
        phase = 'snowing';
        phaseStartTime = now;
        // Convert canonical pixels to snow particles
        particles = canonicalPixels.map(([c, r]) => ({
          x: c,
          y: r,
          dx: (Math.random() - 0.5) * 0.3,
          dy: 0.2,
          brightness: 220,
        }));
      } else if (phase === 'snowing' && phaseElapsed >= SNOW_DURATION) {
        reset();
        return f;
      }

      if (phase === 'growing') {
        const elapsed = phaseElapsed;
        // Draw trunk up to current growth
        const currentRows = Math.min(TRUNK_HEIGHT, elapsed * TRUNK_GROW_RATE);
        const trunkTopNow = Math.round(TRUNK_BOTTOM - currentRows);
        for (let row = trunkTopNow; row <= TRUNK_BOTTOM; row++) {
          setPixel(f, centerCol, row, 220);
          setPixel(f, centerCol + 1, row, 200);
        }
        const trunkProgress = currentRows / TRUNK_HEIGHT;

        // Draw branches as trunk passes their heights
        for (const br of branches) {
          if (br.atRow < trunkTopNow) continue; // trunk not there yet
          const branchProgress = Math.max(
            0,
            Math.min(1, (trunkProgress - (TRUNK_BOTTOM - br.atRow) / TRUNK_HEIGHT) * 5),
          );
          const growLen = Math.round(branchProgress * br.len);
          for (let d = 1; d <= growLen; d++) {
            const bc = centerCol + br.dir * d;
            const brow = br.atRow + d;
            setPixel(f, bc, brow, 180);
            if (d === growLen && growLen === br.len) {
              // Bud twinkle
              const twinkle = 180 + Math.round(75 * Math.abs(Math.sin(now / 400 + br.atRow)));
              setPixel(f, bc, brow - 1, twinkle);
              setPixel(f, bc + 1, brow, twinkle);
            }
          }
        }
      } else if (phase === 'swaying') {
        const swayOffset = SWAY_AMP * Math.sin(phaseElapsed * SWAY_FREQ);
        const swaydPixels = applySwayToPixels(canonicalPixels, swayOffset);
        for (const [c, r] of swaydPixels) {
          setPixel(f, c, r, 210);
        }
      } else if (phase === 'snowing') {
        const fadeRate = 255 / (60 * (SNOW_DURATION / 1000));
        const dtMs = Math.min(50, 33); // approx frame delta
        const nextParticles: SnowParticle[] = [];
        for (const p of particles) {
          const np: SnowParticle = {
            x: p.x + p.dx,
            y: p.y + p.dy,
            dx: p.dx,
            dy: p.dy,
            brightness: p.brightness - fadeRate * (dtMs / 1000) * 30,
          };
          if (np.brightness > 0 && np.y < FRAME_ROWS) {
            nextParticles.push(np);
            setPixel(f, np.x, np.y, Math.round(np.brightness));
          }
        }
        particles = nextParticles;
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// plant-2: Fern frond
// ---------------------------------------------------------------------------
function createPlant2Renderer(): ZenRendererApi {
  const centerCol = Math.round((FRAME_COLS - 1) / 2);

  const GROW_DURATION = 18_000;
  const SWAY_DURATION = 3_000; // stand still for 3s before snow
  const SNOW_DURATION = 5_000;

  // Stem grows from row 33 up to row 3
  const STEM_TOP = 3;
  const STEM_BOTTOM = FRAME_ROWS - 1;
  const STEM_HEIGHT = STEM_BOTTOM - STEM_TOP;
  const PINNA_INTERVAL = 3; // every 3 rows
  const PINNA_ANGLE = 70 * (Math.PI / 180); // 70° from vertical

  // Build canonical pixel list (full fern)
  function buildCanonicalPixels(): Array<[number, number]> {
    const pixels: Array<[number, number]> = [];
    for (let row = STEM_TOP; row <= STEM_BOTTOM; row++) {
      pixels.push([centerCol, row]);
    }
    let pinnaPairIndex = 0;
    for (let row = STEM_BOTTOM - PINNA_INTERVAL; row >= STEM_TOP; row -= PINNA_INTERVAL) {
      const pinnLen = Math.max(2, 4 - Math.floor(pinnaPairIndex / 2));
      for (let s = -1; s <= 1; s += 2) {
        for (let d = 1; d <= pinnLen; d++) {
          const pc = centerCol + s * Math.round(d * Math.sin(PINNA_ANGLE));
          const pr = row - Math.round(d * Math.cos(PINNA_ANGLE));
          pixels.push([pc, pr]);
        }
      }
      pinnaPairIndex++;
    }
    return pixels;
  }

  const canonicalPixels = buildCanonicalPixels();
  let phase: Phase = 'growing';
  let phaseStartTime = Date.now();
  let particles: SnowParticle[] = [];
  let stopped = false;

  function reset(): void {
    phase = 'growing';
    phaseStartTime = Date.now();
    particles = [];
  }

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const now = Date.now();
      const phaseElapsed = now - phaseStartTime;

      if (phase === 'growing' && phaseElapsed >= GROW_DURATION) {
        phase = 'swaying';
        phaseStartTime = now;
      } else if (phase === 'swaying' && phaseElapsed >= SWAY_DURATION) {
        phase = 'snowing';
        phaseStartTime = now;
        particles = canonicalPixels.map(([c, r]) => ({
          x: c,
          y: r,
          dx: (Math.random() - 0.5) * 0.25,
          dy: 0.18,
          brightness: 215,
        }));
      } else if (phase === 'snowing' && phaseElapsed >= SNOW_DURATION) {
        reset();
        return f;
      }

      if (phase === 'growing') {
        // Stem growth
        const stemProgress = Math.min(1, phaseElapsed / GROW_DURATION);
        const currentStemLen = stemProgress * STEM_HEIGHT;
        const stemTopNow = Math.round(STEM_BOTTOM - currentStemLen);
        for (let row = stemTopNow; row <= STEM_BOTTOM; row++) {
          setPixel(f, centerCol, row, 200);
        }

        // Pinnae appear as stem grows past each interval
        let pinnaPairIndex = 0;
        for (let row = STEM_BOTTOM - PINNA_INTERVAL; row >= STEM_TOP; row -= PINNA_INTERVAL) {
          if (row < stemTopNow) { pinnaPairIndex++; continue; }
          const stemAt = (STEM_BOTTOM - row) / STEM_HEIGHT;
          const pinnaProgress = Math.max(0, Math.min(1, (stemProgress - stemAt) * 6));
          const pinnLen = Math.max(2, 4 - Math.floor(pinnaPairIndex / 2));
          const growLen = Math.round(pinnaProgress * pinnLen);

          for (let s = -1; s <= 1; s += 2) {
            for (let d = 1; d <= growLen; d++) {
              const pc = centerCol + s * Math.round(d * Math.sin(PINNA_ANGLE));
              const pr = row - Math.round(d * Math.cos(PINNA_ANGLE));
              setPixel(f, pc, pr, 170);
              // Bud at topmost tip
              if (d === growLen && growLen === pinnLen && row === stemTopNow) {
                const bud = 170 + Math.round(85 * Math.abs(Math.sin(now / 350)));
                setPixel(f, pc, pr - 1, bud);
              }
            }
          }
          pinnaPairIndex++;
        }
      } else if (phase === 'swaying') {
        // Stand still for a few seconds before snow
        for (const [c, r] of canonicalPixels) {
          setPixel(f, c, r, 200);
        }
      } else if (phase === 'snowing') {
        const fadeRate = 255 / (60 * (SNOW_DURATION / 1000));
        const dtMs = 33;
        const nextParticles: SnowParticle[] = [];
        for (const p of particles) {
          const np: SnowParticle = {
            x: p.x + p.dx,
            y: p.y + p.dy,
            dx: p.dx,
            dy: p.dy,
            brightness: p.brightness - fadeRate * (dtMs / 1000) * 30,
          };
          if (np.brightness > 0 && np.y < FRAME_ROWS) {
            nextParticles.push(np);
            setPixel(f, np.x, np.y, Math.round(np.brightness));
          }
        }
        particles = nextParticles;
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// plant-3: Wild grass / reed
// ---------------------------------------------------------------------------
function createPlant3Renderer(): ZenRendererApi {
  const centerCol = Math.round((FRAME_COLS - 1) / 2);

  const GROW_DURATION = 18_000;
  const SWAY_DURATION = 8_000;
  const SNOW_DURATION = 5_000;
  const SWAY_FREQ = (2 * Math.PI) / 3500;
  const SWAY_AMP = 2.2; // reeds sway more

  // 3 stems at different positions/heights
  const stems = [
    { relCol: -2, height: 26, growRate: 1.0, swayPhase: 0 },
    { relCol:  0, height: 30, growRate: 0.85, swayPhase: 0.8 },
    { relCol:  2, height: 22, growRate: 1.1, swayPhase: 1.6 },
  ];

  // Slight curve: each stem bends slightly left or right at top
  const curvatures = [0.15, -0.1, 0.2];

  // Build canonical pixels for the fully grown plant
  function buildCanonicalPixels(): Array<[number, number]> {
    const pixels: Array<[number, number]> = [];
    for (let si = 0; si < stems.length; si++) {
      const stem = stems[si]!;
      const curv = curvatures[si] ?? 0;
      const stemBase = FRAME_ROWS - 1;
      const stemTopRow = stemBase - stem.height;

      for (let i = 0; i <= stem.height; i++) {
        const row = stemBase - i;
        const heightFrac = i / stem.height;
        const col = centerCol + stem.relCol + Math.round(curv * heightFrac * stem.height * 0.3);
        pixels.push([col, row]);
      }

      // Tassel: fan of short pixels at tip
      const tipRow = stemTopRow;
      const tipCol = centerCol + stem.relCol + Math.round(curv * 0.3 * stem.height);
      for (let a = -2; a <= 2; a++) {
        pixels.push([tipCol + a, tipRow - 1]);
        if (Math.abs(a) <= 1) pixels.push([tipCol + a, tipRow - 2]);
      }
    }
    return pixels;
  }

  const canonicalPixels = buildCanonicalPixels();
  let phase: Phase = 'growing';
  let phaseStartTime = Date.now();
  let particles: SnowParticle[] = [];
  let stopped = false;

  function reset(): void {
    phase = 'growing';
    phaseStartTime = Date.now();
    particles = [];
  }

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const now = Date.now();
      const phaseElapsed = now - phaseStartTime;

      if (phase === 'growing' && phaseElapsed >= GROW_DURATION) {
        phase = 'swaying';
        phaseStartTime = now;
      } else if (phase === 'swaying' && phaseElapsed >= SWAY_DURATION) {
        phase = 'snowing';
        phaseStartTime = now;
        // Wind drift: more horizontal for reeds
        particles = canonicalPixels.map(([c, r]) => ({
          x: c,
          y: r,
          dx: (Math.random() - 0.3) * 0.5, // bias rightward drift
          dy: 0.15 + Math.random() * 0.1,
          brightness: 200 + Math.round(Math.random() * 40),
        }));
      } else if (phase === 'snowing' && phaseElapsed >= SNOW_DURATION) {
        reset();
        return f;
      }

      if (phase === 'growing') {
        for (let si = 0; si < stems.length; si++) {
          const stem = stems[si]!;
          const curv = curvatures[si] ?? 0;
          const stemBase = FRAME_ROWS - 1;
          const totalGrowMs = GROW_DURATION * stem.growRate;
          const currentLen = Math.min(stem.height, (phaseElapsed / totalGrowMs) * stem.height);
          const currentRows = Math.round(currentLen);

          for (let i = 0; i <= currentRows; i++) {
            const row = stemBase - i;
            const heightFrac = i / stem.height;
            const col = centerCol + stem.relCol + Math.round(curv * heightFrac * stem.height * 0.3);
            setPixel(f, col, row, 190);
          }

          // Tassel grows over last 2s of grow phase for each stem
          const tassleStartMs = totalGrowMs - 2000;
          if (phaseElapsed >= tassleStartMs) {
            const tassleProgress = Math.min(1, (phaseElapsed - tassleStartMs) / 2000);
            const tassleLen = Math.round(tassleProgress * 3);
            const tipRow = stemBase - currentRows;
            const tipCol = centerCol + stem.relCol + Math.round(curv * 0.3 * stem.height);
            for (let a = -tassleLen; a <= tassleLen; a++) {
              setPixelAdd(f, tipCol + a, tipRow - 1, Math.round(190 * tassleProgress));
              if (Math.abs(a) <= Math.round(tassleLen * 0.6)) {
                setPixelAdd(f, tipCol + a, tipRow - 2, Math.round(160 * tassleProgress));
              }
            }
          }
        }
      } else if (phase === 'swaying') {
        const tMs = phaseElapsed;
        // Each stem has its own sway phase
        const allPixels: Array<[number, number]> = [];
        for (let si = 0; si < stems.length; si++) {
          const stem = stems[si]!;
          const curv = curvatures[si] ?? 0;
          const stemBase = FRAME_ROWS - 1;
          const stemPhase = stem.swayPhase;

          for (let i = 0; i <= stem.height; i++) {
            const row = stemBase - i;
            const heightFrac = i / stem.height;
            const baseCol = centerCol + stem.relCol + Math.round(curv * heightFrac * stem.height * 0.3);
            const swayDisp = SWAY_AMP * Math.sin(tMs * SWAY_FREQ + stemPhase) * heightFrac;
            allPixels.push([Math.round(baseCol + swayDisp), row]);
          }

          // Tassels sway with tip
          const tipHeightFrac = 1.0;
          const swayDisp = SWAY_AMP * Math.sin(tMs * SWAY_FREQ + stem.swayPhase) * tipHeightFrac;
          const tipRow = stemBase - stem.height;
          const tipCol = centerCol + stem.relCol + Math.round(curv * 0.3 * stem.height) + Math.round(swayDisp);
          for (let a = -2; a <= 2; a++) {
            allPixels.push([tipCol + a, tipRow - 1]);
            if (Math.abs(a) <= 1) allPixels.push([tipCol + a, tipRow - 2]);
          }
        }
        for (const [c, r] of allPixels) {
          setPixel(f, c, r, 195);
        }
      } else if (phase === 'snowing') {
        const fadeRate = 255 / (60 * (SNOW_DURATION / 1000));
        const dtMs = 33;
        const nextParticles: SnowParticle[] = [];
        for (const p of particles) {
          const np: SnowParticle = {
            x: p.x + p.dx,
            y: p.y + p.dy,
            dx: p.dx,
            dy: p.dy,
            brightness: p.brightness - fadeRate * (dtMs / 1000) * 30,
          };
          if (np.brightness > 0 && np.y < FRAME_ROWS) {
            nextParticles.push(np);
            setPixel(f, np.x, np.y, Math.round(np.brightness));
          }
        }
        particles = nextParticles;
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// Silence unused warning — drawLinePx is available for future use
void (drawLinePx as unknown);
