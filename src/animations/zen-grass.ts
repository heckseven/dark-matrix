import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenGrassStyle = 'grass-1' | 'grass-2' | 'grass-3' | 'grass-4' | 'grass-5' | 'grass-6';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value to [0, 255] and return an integer. */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Draw a blade rooted at the bottom of `col` with height `h` (integer rows).
 * The main body occupies rows [34-h .. 33] at `brightness`.
 * An optional fractional tip spills into adjacent column `tipCol` at `tipBrightness`.
 */
function drawBlade(
  frame: Frame,
  col: number,
  h: number,
  brightness: number,
  tipCol: number | null,
  tipBrightness: number,
): void {
  const top = FRAME_ROWS - h;
  for (let row = top; row < FRAME_ROWS; row++) {
    const idx = col * FRAME_ROWS + row;
    frame[idx] = clamp255(brightness);
  }
  if (tipCol !== null && tipCol >= 0 && tipCol < FRAME_COLS) {
    // Draw tip pixel at the topmost row
    const row = top;
    const idx = tipCol * FRAME_ROWS + row;
    frame[idx] = clamp255(Math.max(frame[idx] ?? 0, tipBrightness));
  }
}

// ---------------------------------------------------------------------------
// grass-1: Sine sway
// ---------------------------------------------------------------------------

function createGrass1(): ZenRendererApi {
  let stopped = false;
  const start = Date.now();

  // Each blade has a fixed height and phase offset
  const bladeHeights = [18, 20, 22, 19, 21, 23, 20, 18, 22];
  const phaseOffsets = Array.from({ length: FRAME_COLS }, (_, i) => i * 0.7);

  return {
    render(): Frame {
      const frame = createFrame();
      if (stopped) return frame;

      const t = (Date.now() - start) / 1000;
      // Wind period ~6s
      const windFreq = (2 * Math.PI) / 6;

      for (let col = 0; col < FRAME_COLS; col++) {
        const h = bladeHeights[col] ?? 20;
        const phase = phaseOffsets[col] ?? 0;
        // Displacement ranges -1.0 .. +1.0
        const disp = Math.sin(windFreq * t + phase);

        // Main blade brightness slightly dimmed when leaning
        const brightness = 220 - Math.abs(disp) * 30;

        // Tip spills to adjacent column when |disp| > 0.5
        let tipCol: number | null = null;
        let tipBrightness = 0;
        if (Math.abs(disp) > 0.5) {
          const frac = (Math.abs(disp) - 0.5) / 0.5;
          tipCol = disp > 0 ? col + 1 : col - 1;
          tipBrightness = clamp255(brightness * frac * 0.7);
        }

        drawBlade(frame, col, h, brightness, tipCol, tipBrightness);
      }

      return frame;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// grass-2: Spring physics blades
// ---------------------------------------------------------------------------

function createGrass2(): ZenRendererApi {
  let stopped = false;
  const start = Date.now();

  const BLADE_HEIGHT = 20;
  // Spring constants — slightly different per blade for natural feel
  const stiffness = Array.from({ length: FRAME_COLS }, (_, i) => 3.5 + i * 0.15);
  const damping = Array.from({ length: FRAME_COLS }, (_, i) => 0.6 + i * 0.02);

  // State: displacement and velocity for each blade tip (in fractional columns)
  const disp = new Float64Array(FRAME_COLS);
  const vel = new Float64Array(FRAME_COLS);

  // Gust state
  let gustActive = false;
  let gustStart = 0;
  let gustDuration = 0;
  let nextGust = 3.0; // seconds from start
  let lastT = 0;

  return {
    render(): Frame {
      const frame = createFrame();
      if (stopped) return frame;

      const t = (Date.now() - start) / 1000;
      const dt = Math.min(t - lastT, 0.1); // cap dt to avoid instability
      lastT = t;

      // Schedule and apply gusts
      if (!gustActive && t >= nextGust) {
        gustActive = true;
        gustStart = t;
        gustDuration = 0.4 + Math.random() * 0.3;
        // Apply impulse to all blades
        for (let col = 0; col < FRAME_COLS; col++) {
          vel[col] = (vel[col] ?? 0) + 1.8 + Math.random() * 0.4;
        }
      }
      if (gustActive && t - gustStart > gustDuration) {
        gustActive = false;
        nextGust = t + 4.0 + Math.random() * 4.0;
      }

      // Integrate spring physics
      for (let col = 0; col < FRAME_COLS; col++) {
        const k = stiffness[col] ?? 3.5;
        const d = damping[col] ?? 0.6;
        const x = disp[col] ?? 0;
        const v = vel[col] ?? 0;
        const acc = -k * x - d * v;
        vel[col] = v + acc * dt;
        disp[col] = x + (vel[col] ?? 0) * dt;
      }

      // Draw blades
      for (let col = 0; col < FRAME_COLS; col++) {
        const x = disp[col] ?? 0;
        const brightness = 220 - Math.abs(x) * 20;

        let tipCol: number | null = null;
        let tipBrightness = 0;
        if (Math.abs(x) > 0.5) {
          const frac = Math.min(1, (Math.abs(x) - 0.5) / 0.5);
          tipCol = x > 0 ? col + 1 : col - 1;
          tipBrightness = clamp255(brightness * frac * 0.6);
        }

        drawBlade(frame, col, BLADE_HEIGHT, brightness, tipCol, tipBrightness);
      }

      return frame;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// grass-3: Staggered wave gust
// ---------------------------------------------------------------------------

function createGrass3(): ZenRendererApi {
  let stopped = false;
  const start = Date.now();

  const BLADE_HEIGHT = 22;
  // Per-blade state
  const bladeDisp = new Float64Array(FRAME_COLS); // current displacement
  const bladeVel = new Float64Array(FRAME_COLS);

  // Gust travels left-to-right; gust reaches blade i at gustStart + i * 0.2s
  let gustStart = -100.0;
  let nextGust = 2.5;
  let lastT = 0;

  const BLADE_DELAY = 0.2; // seconds between adjacent blades
  const SPRING_K = 4.0;
  const SPRING_D = 0.5;
  const MAX_DISP = 1.8; // tip displacement in fractional columns at peak

  return {
    render(): Frame {
      const frame = createFrame();
      if (stopped) return frame;

      const t = (Date.now() - start) / 1000;
      const dt = Math.min(t - lastT, 0.1);
      lastT = t;

      // Schedule new gust
      if (t >= nextGust) {
        gustStart = t;
        nextGust = t + 5.0 + Math.random() * 3.0;
      }

      // Apply gust impulse and integrate per blade
      for (let col = 0; col < FRAME_COLS; col++) {
        const bladeT = t - (gustStart + col * BLADE_DELAY);
        // The gust is a short pulse that hits the blade
        if (bladeT >= 0 && bladeT < dt * 2) {
          // Blade just reached by gust — apply rightward push
          bladeVel[col] = (bladeVel[col] ?? 0) + MAX_DISP * 8.0;
        }

        const x = bladeDisp[col] ?? 0;
        const v = bladeVel[col] ?? 0;
        const acc = -SPRING_K * x - SPRING_D * v;
        bladeVel[col] = v + acc * dt;
        bladeDisp[col] = x + (bladeVel[col] ?? 0) * dt;
      }

      // Draw blades
      for (let col = 0; col < FRAME_COLS; col++) {
        const x = bladeDisp[col] ?? 0;
        const brightness = 220 - Math.min(30, Math.abs(x) * 15);

        let tipCol: number | null = null;
        let tipBrightness = 0;
        if (Math.abs(x) > 0.5) {
          const frac = Math.min(1, (Math.abs(x) - 0.5) / 0.5);
          tipCol = x > 0 ? col + 1 : col - 1;
          tipBrightness = clamp255(brightness * frac * 0.65);
        }

        drawBlade(frame, col, BLADE_HEIGHT, brightness, tipCol, tipBrightness);
      }

      return frame;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// grass-4: Particle grass
// ---------------------------------------------------------------------------

interface Particle {
  col: number;
  row: number;       // fractional row (0 = top, 33 = bottom)
  speed: number;     // rows/s upward
  drift: number;     // fractional col drift per row
}

function spawnParticle(col: number, initialRowFrac?: number): Particle {
  // Start at bottom; give each particle a random initial row so they stagger
  const row = FRAME_ROWS - 1 - (initialRowFrac !== undefined
    ? Math.floor(initialRowFrac * (FRAME_ROWS - 1) * 0.7)
    : 0);
  return {
    col,
    row,
    speed: 4.0 + Math.random() * 3.0, // rows/s upward
    drift: (Math.random() - 0.3) * 0.04, // slight rightward bias
  };
}

function createGrass4(): ZenRendererApi {
  let stopped = false;
  const start = Date.now();

  const PARTICLES_PER_COL = 5;
  const particles: Particle[] = [];

  // Initialise staggered particles
  for (let col = 0; col < FRAME_COLS; col++) {
    for (let p = 0; p < PARTICLES_PER_COL; p++) {
      particles.push(spawnParticle(col, p / PARTICLES_PER_COL));
    }
  }

  let lastT = 0;

  return {
    render(): Frame {
      const frame = createFrame();
      if (stopped) return frame;

      const t = (Date.now() - start) / 1000;
      const dt = Math.min(t - lastT, 0.1);
      lastT = t;

      // Move particles upward
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p === undefined) continue;
        p.row -= p.speed * dt;
        if (p.row < 0) {
          particles[i] = spawnParticle(p.col);
        }
      }

      // Draw particles
      for (const p of particles) {
        const row = Math.round(p.row);
        if (row < 0 || row >= FRAME_ROWS) continue;

        // Brightness fades as particle rises (bright at bottom, dim at top)
        const frac = row / (FRAME_ROWS - 1); // 0=top, 1=bottom
        const brightness = clamp255(60 + frac * 180);

        // Fractional col drift based on travel distance from bottom
        const traveled = FRAME_ROWS - 1 - row;
        const colOffset = p.drift * traveled;
        const mainCol = p.col + Math.floor(colOffset);
        const fracPart = colOffset - Math.floor(colOffset);

        if (mainCol >= 0 && mainCol < FRAME_COLS) {
          const idx = mainCol * FRAME_ROWS + row;
          frame[idx] = clamp255(Math.max(frame[idx] ?? 0, brightness * (1 - fracPart)));
        }
        const nextCol = mainCol + 1;
        if (fracPart > 0 && nextCol >= 0 && nextCol < FRAME_COLS) {
          const idx = nextCol * FRAME_ROWS + row;
          frame[idx] = clamp255(Math.max(frame[idx] ?? 0, brightness * fracPart * 0.6));
        }
      }

      return frame;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// grass-5: Noise-field grass
// ---------------------------------------------------------------------------

/**
 * 1D Perlin-like noise: sum of several sine waves at different frequencies.
 * Returns a value in approximately [-1, 1].
 */
function noiseField(x: number, t: number): number {
  return (
    Math.sin(x * 1.3 + t * 0.5) * 0.5 +
    Math.sin(x * 2.7 + t * 0.3) * 0.3 +
    Math.sin(x * 0.6 + t * 0.7) * 0.2
  );
}

function createGrass5(): ZenRendererApi {
  let stopped = false;
  const start = Date.now();

  // Varying heights per blade
  const bladeHeights = [19, 21, 23, 20, 22, 24, 21, 19, 23];
  // Each column samples noise at a different spatial position
  const spatialPos = Array.from({ length: FRAME_COLS }, (_, i) => i * 1.1);

  return {
    render(): Frame {
      const frame = createFrame();
      if (stopped) return frame;

      const t = (Date.now() - start) / 1000;

      for (let col = 0; col < FRAME_COLS; col++) {
        const h = bladeHeights[col] ?? 21;
        const x = spatialPos[col] ?? col * 1.1;
        const noise = noiseField(x, t);

        // Map noise [-1,1] to displacement [-1.5, 1.5]
        const disp = noise * 1.5;
        const brightness = 210 - Math.abs(disp) * 20;

        let tipCol: number | null = null;
        let tipBrightness = 0;
        if (Math.abs(disp) > 0.5) {
          const frac = Math.min(1, (Math.abs(disp) - 0.5) / 1.0);
          tipCol = disp > 0 ? col + 1 : col - 1;
          tipBrightness = clamp255(brightness * frac * 0.65);
        }

        drawBlade(frame, col, h, brightness, tipCol, tipBrightness);
      }

      return frame;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// grass-6: Tall-short meadow
// ---------------------------------------------------------------------------

function createGrass6(): ZenRendererApi {
  let stopped = false;
  const start = Date.now();

  // Irregular tall/short pattern — tall at even columns, short at odd
  const isTall = [true, false, true, false, true, false, true, false, true];
  const TALL_HEIGHT = 28;
  const SHORT_HEIGHT = 14;
  const TALL_BRIGHTNESS = 230;
  const SHORT_BRIGHTNESS = 150;

  return {
    render(): Frame {
      const frame = createFrame();
      if (stopped) return frame;

      const t = (Date.now() - start) / 1000;
      const windFreq = (2 * Math.PI) / 7; // ~7s period
      const windBase = Math.sin(windFreq * t);

      for (let col = 0; col < FRAME_COLS; col++) {
        const tall = isTall[col] ?? false;
        const h = tall ? TALL_HEIGHT : SHORT_HEIGHT;
        const brightness = tall ? TALL_BRIGHTNESS : SHORT_BRIGHTNESS;

        // Tall blades sway more (amplitude 1.4) than short ones (amplitude 0.5)
        const swayAmp = tall ? 1.4 : 0.5;
        // Phase offset per column
        const phase = col * 0.6;
        const disp = Math.sin(windFreq * t + phase) * swayAmp + windBase * swayAmp * 0.3;

        let tipCol: number | null = null;
        let tipBrightness = 0;
        if (Math.abs(disp) > 0.5) {
          const frac = Math.min(1, (Math.abs(disp) - 0.5) / 0.9);
          tipCol = disp > 0 ? col + 1 : col - 1;
          tipBrightness = clamp255(brightness * frac * 0.6);
        }

        drawBlade(frame, col, h, brightness - Math.abs(disp) * 10, tipCol, tipBrightness);
      }

      return frame;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createZenGrassRenderer(style: ZenGrassStyle): ZenRendererApi {
  switch (style) {
    case 'grass-1': return createGrass1();
    case 'grass-2': return createGrass2();
    case 'grass-3': return createGrass3();
    case 'grass-4': return createGrass4();
    case 'grass-5': return createGrass5();
    case 'grass-6': return createGrass6();
  }
}
