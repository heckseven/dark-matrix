import { createFrame, FRAME_COLS, FRAME_ROWS, FRAME_SIZE } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenFluidStyle =
  | 'fluid-1'
  | 'fluid-5'
  | 'fluid-9';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp255(v: number): number {
  return clamp(Math.round(v), 0, 255);
}

// Simple pseudo-random seeded hash: returns value in [0,1)
function hash21(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// ---------------------------------------------------------------------------
// fluid-1: Sine wave scrolling vertically
// A bright sine wave (varying by column) that scrolls downward. Phase and
// amplitude drift slowly for organic feel.
// ---------------------------------------------------------------------------

function createFluid1Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;

  return {
    render(): Frame {
      const f = createFrame();
      const t = tick * 0.04;

      // Slowly drifting amplitude and speed
      const amp = 3.5 + 2.5 * Math.sin(t * 0.13);
      const phaseDrift = t * 0.7;

      for (let col = 0; col < FRAME_COLS; col++) {
        const colPhase = (col / (FRAME_COLS - 1)) * Math.PI * 0.8;
        for (let row = 0; row < FRAME_ROWS; row++) {
          // Wave brightness: bright band centered on a sine-derived position
          const waveCentre = (FRAME_ROWS / 2) + amp * Math.sin(colPhase + phaseDrift);
          const dist = Math.abs(row - waveCentre);
          const spread = 2.5 + 1.5 * Math.sin(t * 0.09 + col);
          const brightness = 255 * Math.exp(-(dist * dist) / (2 * spread * spread));
          f[col * FRAME_ROWS + row] = clamp255(brightness);
        }
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// fluid-2: Radial ripples from center
// Concentric ripples expand from (col 4, row 17). New ripples spawn every
// ~60 frames; each is a bright ring that fades as it expands.
// ---------------------------------------------------------------------------

type Ripple = { spawnTick: number; speed: number };

function createFluid2Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;
  const ripples: Ripple[] = [{ spawnTick: 0, speed: 0.18 }];
  const CX = 4;
  const CY = 17;
  const MAX_RADIUS = Math.sqrt(CX * CX + CY * CY) + 5;

  return {
    render(): Frame {
      const f = createFrame();

      // Spawn a new ripple every ~60 ticks
      if (tick % 60 === 0) {
        ripples.push({ spawnTick: tick, speed: 0.14 + 0.06 * Math.random() });
      }

      // Remove fully-faded ripples
      while (ripples.length > 6) ripples.shift();

      for (let col = 0; col < FRAME_COLS; col++) {
        const dx = col - CX;
        for (let row = 0; row < FRAME_ROWS; row++) {
          const dy = row - CY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          let brightness = 0;

          for (const r of ripples) {
            const age = tick - r.spawnTick;
            const radius = age * r.speed;
            if (radius > MAX_RADIUS) continue;

            // Thin bright ring with Gaussian falloff
            const delta = dist - radius;
            const ringWidth = 1.8;
            const rawBrightness = Math.exp(-(delta * delta) / (2 * ringWidth * ringWidth));
            // Fade out as ripple expands
            const fade = 1 - radius / MAX_RADIUS;
            brightness += rawBrightness * fade * 255;
          }

          f[col * FRAME_ROWS + row] = clamp255(brightness);
        }
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// fluid-3: Perlin-noise flow field (sum-of-sines approximation)
// Each pixel's brightness follows a slowly-evolving smooth noise field.
// ---------------------------------------------------------------------------

function createFluid3Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;

  // Sum-of-sines noise: stacks several octaves to approximate Perlin noise
  function smoothNoise(x: number, y: number, t: number): number {
    let v = 0;
    v += Math.sin(x * 0.8 + t * 0.3 + y * 0.4) * 0.5;
    v += Math.sin(x * 1.6 - y * 0.9 + t * 0.17) * 0.25;
    v += Math.sin(x * 0.3 + y * 1.4 - t * 0.22) * 0.125;
    v += Math.sin(x * 2.1 + y * 0.6 + t * 0.09) * 0.0625;
    // Normalize from [-1,1] to [0,1]
    return (v + 1) / 2;
  }

  return {
    render(): Frame {
      const f = createFrame();
      const t = tick * 0.025;

      for (let col = 0; col < FRAME_COLS; col++) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          const nx = col / FRAME_COLS * 4;
          const ny = row / FRAME_ROWS * 8;
          const n = smoothNoise(nx, ny, t);
          f[col * FRAME_ROWS + row] = clamp255(n * 255);
        }
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// fluid-4: Cellular automaton wave propagation
// Rule-based 1D CA rows evolving over time; each row displayed as a full-
// column stripe. Slow tick rate gives a calming scrolling-wave feel.
// ---------------------------------------------------------------------------

function createFluid4Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;

  // Use Rule 30 (XOR-based): produces chaotic but bounded waves
  // We track FRAME_ROWS rows, each of FRAME_COLS cells
  const state: Uint8Array = new Uint8Array(FRAME_ROWS * FRAME_COLS);

  // Seed: single bright cell in the center of the top row
  state[0 * FRAME_COLS + Math.floor(FRAME_COLS / 2)] = 1;

  let caTicksPerFrame = 3; // slow evolution
  let caCounter = 0;

  return {
    render(): Frame {
      caCounter++;
      if (caCounter >= caTicksPerFrame) {
        caCounter = 0;

        // Scroll all rows down by 1, freeing row 0 for next generation
        for (let row = FRAME_ROWS - 1; row > 0; row--) {
          for (let col = 0; col < FRAME_COLS; col++) {
            state[row * FRAME_COLS + col] = state[(row - 1) * FRAME_COLS + col] ?? 0;
          }
        }

        // Generate new top row from Rule 30 applied to previous top row
        const prevTopRow = new Uint8Array(FRAME_COLS);
        for (let col = 0; col < FRAME_COLS; col++) {
          prevTopRow[col] = state[1 * FRAME_COLS + col] ?? 0;
        }

        for (let col = 0; col < FRAME_COLS; col++) {
          const left = prevTopRow[(col - 1 + FRAME_COLS) % FRAME_COLS] ?? 0;
          const center = prevTopRow[col] ?? 0;
          const right = prevTopRow[(col + 1) % FRAME_COLS] ?? 0;
          // Rule 30: new = left XOR (center OR right)
          state[col] = left ^ (center | right);
        }

        // Every few cycles, seed a new cell to keep it alive
        if (tick % 120 === 0) {
          state[Math.floor(FRAME_COLS / 2)] = 1;
        }
      }

      const f = createFrame();
      for (let col = 0; col < FRAME_COLS; col++) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          const cell = state[row * FRAME_COLS + col] ?? 0;
          f[col * FRAME_ROWS + row] = cell ? 220 : 0;
        }
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// fluid-5: Voronoi tide
// 3 seed points drift in gentle circular paths. Each pixel's brightness is
// based on inverse distance to the nearest seed (closer = brighter).
// ---------------------------------------------------------------------------

function createFluid5Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;

  const seeds = [
    { cx: 2, cy: 8,  rx: 1.5, ry: 5, phaseX: 0,    phaseY: 0,    speedX: 0.011, speedY: 0.009 },
    { cx: 6, cy: 25, rx: 1.8, ry: 4, phaseX: 2.1,  phaseY: 1.1,  speedX: 0.008, speedY: 0.013 },
    { cx: 4, cy: 17, rx: 2.0, ry: 6, phaseX: 4.2,  phaseY: 3.5,  speedX: 0.013, speedY: 0.007 },
  ];

  return {
    render(): Frame {
      const f = createFrame();
      const t = tick;

      // Compute current seed positions
      const positions = seeds.map(s => ({
        x: s.cx + s.rx * Math.sin(t * s.speedX + s.phaseX),
        y: s.cy + s.ry * Math.sin(t * s.speedY + s.phaseY),
      }));

      for (let col = 0; col < FRAME_COLS; col++) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          // Distance to nearest seed
          let minDist = Infinity;
          for (const p of positions) {
            const dx = col - p.x;
            const dy = row - p.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) minDist = d;
          }
          // Smooth falloff: bright at seed, dark far away
          const brightness = 255 * Math.exp(-minDist * 0.35);
          f[col * FRAME_ROWS + row] = clamp255(brightness);
        }
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// fluid-6: Reaction-diffusion (simplified Gray-Scott)
// Two chemicals A (activator) and B (inhibitor) diffuse and react, producing
// organic spot/blob patterns. B concentration is displayed as brightness.
// Grid is 9×34. Initialized with low random noise.
// ---------------------------------------------------------------------------

const RD_COLS = FRAME_COLS;
const RD_ROWS = FRAME_ROWS;

function createFluid6Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;

  // Gray-Scott parameters (F=feed, k=kill) — "spots" regime
  const F = 0.035;
  const k = 0.065;
  const Da = 1.0;   // diffusion rate A
  const Db = 0.5;   // diffusion rate B
  const dt = 1.0;

  const size = RD_COLS * RD_ROWS;
  let A = new Float32Array(size);
  let B = new Float32Array(size);
  let Anext = new Float32Array(size);
  let Bnext = new Float32Array(size);

  // Initialize: A=1 everywhere, B=small random blobs
  for (let i = 0; i < size; i++) {
    A[i] = 1.0;
    B[i] = 0.0;
  }
  // Seed some B blobs in center region
  for (let col = 3; col <= 5; col++) {
    for (let row = 14; row <= 20; row++) {
      A[col * RD_ROWS + row] = 0.5;
      B[col * RD_ROWS + row] = 0.25 + 0.1 * hash21(col, row);
    }
  }

  // Re-seed periodically to keep it alive
  let lastReseed = 0;

  function laplacian(grid: Float32Array, col: number, row: number): number {
    const c = col * RD_ROWS + row;
    const l = ((col - 1 + RD_COLS) % RD_COLS) * RD_ROWS + row;
    const r = ((col + 1) % RD_COLS) * RD_ROWS + row;
    const u = col * RD_ROWS + ((row - 1 + RD_ROWS) % RD_ROWS);
    const d = col * RD_ROWS + ((row + 1) % RD_ROWS);
    // Cross-shaped Laplacian weights: -1*center + 0.25*each neighbor
    return (
      (grid[l] ?? 0) + (grid[r] ?? 0) + (grid[u] ?? 0) + (grid[d] ?? 0) -
      4 * (grid[c] ?? 0)
    );
  }

  return {
    render(): Frame {
      // Run several RD steps per frame for faster evolution
      const stepsPerFrame = 8;
      for (let _s = 0; _s < stepsPerFrame; _s++) {
        for (let col = 0; col < RD_COLS; col++) {
          for (let row = 0; row < RD_ROWS; row++) {
            const i = col * RD_ROWS + row;
            const a = A[i] ?? 0;
            const b = B[i] ?? 0;
            const abb = a * b * b;
            const lapA = laplacian(A, col, row);
            const lapB = laplacian(B, col, row);
            Anext[i] = clamp(a + dt * (Da * lapA - abb + F * (1 - a)), 0, 1);
            Bnext[i] = clamp(b + dt * (Db * lapB + abb - (F + k) * b), 0, 1);
          }
        }
        // Swap buffers
        const tmpA = A; A = Anext; Anext = tmpA;
        const tmpB = B; B = Bnext; Bnext = tmpB;
      }

      // Periodically re-seed to prevent stagnation
      if (tick - lastReseed > 300) {
        lastReseed = tick;
        const sc = Math.floor(Math.random() * RD_COLS);
        const sr = Math.floor(Math.random() * RD_ROWS);
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const nc = (sc + dc + RD_COLS) % RD_COLS;
            const nr = (sr + dr + RD_ROWS) % RD_ROWS;
            const idx = nc * RD_ROWS + nr;
            A[idx] = 0.5;
            B[idx] = 0.25;
          }
        }
      }

      const f = createFrame();
      for (let col = 0; col < FRAME_COLS; col++) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          const b = B[col * FRAME_ROWS + row] ?? 0;
          f[col * FRAME_ROWS + row] = clamp255(b * 4 * 255);
        }
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// fluid-7: Rope/chain physics
// ~10 nodes hang from a slowly oscillating anchor. Spring forces connect each
// node. The chain is rendered as bright pixels along the connected path.
// ---------------------------------------------------------------------------

type Vec2 = { x: number; y: number };

function createFluid7Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;

  const NUM_NODES = 12;
  const GRAVITY = 0.08;
  const SPRING_K = 0.35;
  const DAMPING = 0.92;
  const REST_LEN = (FRAME_ROWS - 2) / (NUM_NODES - 1);

  // Initialize nodes hanging vertically from center
  const pos: Vec2[] = [];
  const vel: Vec2[] = [];
  const anchorX = FRAME_COLS / 2;

  for (let i = 0; i < NUM_NODES; i++) {
    pos.push({ x: anchorX, y: 1 + i * REST_LEN });
    vel.push({ x: 0, y: 0 });
  }

  return {
    render(): Frame {
      const t = tick * 0.02;

      // Slowly oscillating anchor position
      const ax = anchorX + 3.5 * Math.sin(t * 0.6) * Math.cos(t * 0.23);

      // Update physics
      for (let i = NUM_NODES - 1; i >= 0; i--) {
        const p = pos[i]!;
        const v = vel[i]!;

        if (i === 0) {
          // Anchor: snap to oscillating position, zero velocity
          p.x = ax;
          p.y = 1;
          v.x = 0;
          v.y = 0;
          continue;
        }

        const prev = pos[i - 1]!;
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Spring force toward previous node
        const stretch = dist - REST_LEN;
        const nx = dist > 0.001 ? dx / dist : 0;
        const ny = dist > 0.001 ? dy / dist : 1;

        v.x += (-SPRING_K * stretch * nx);
        v.y += (-SPRING_K * stretch * ny + GRAVITY);

        v.x *= DAMPING;
        v.y *= DAMPING;

        p.x += v.x;
        p.y += v.y;
      }

      const f = createFrame();

      // Draw chain: draw line segments between consecutive nodes
      for (let i = 0; i < NUM_NODES - 1; i++) {
        const p0 = pos[i]!;
        const p1 = pos[i + 1]!;

        // Bresenham-style segment using parametric interpolation
        const steps = Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y), 1) * 3;
        for (let s = 0; s <= steps; s++) {
          const t2 = s / steps;
          const px = p0.x + (p1.x - p0.x) * t2;
          const py = p0.y + (p1.y - p0.y) * t2;
          const col = Math.round(px);
          const row = Math.round(py);
          if (col >= 0 && col < FRAME_COLS && row >= 0 && row < FRAME_ROWS) {
            const idx = col * FRAME_ROWS + row;
            f[idx] = 255;
          }
        }
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// fluid-8: Soft-body blob
// ~8 spring-connected particles form a blob that deforms gently. The blob
// center drifts slowly around the display. Rendered as a bright filled region.
// ---------------------------------------------------------------------------

function createFluid8Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;

  const NUM_PARTICLES = 8;
  const BLOB_RADIUS = 4.5;
  const SPRING_K8 = 0.25;
  const DAMPING8 = 0.88;

  // Initialize particles in a circle
  const pos8: Vec2[] = [];
  const vel8: Vec2[] = [];
  const restAngles: number[] = [];

  const initCX = FRAME_COLS / 2;
  const initCY = FRAME_ROWS / 2;

  for (let i = 0; i < NUM_PARTICLES; i++) {
    const angle = (i / NUM_PARTICLES) * Math.PI * 2;
    restAngles.push(angle);
    pos8.push({ x: initCX + BLOB_RADIUS * Math.cos(angle), y: initCY + BLOB_RADIUS * Math.sin(angle) });
    vel8.push({ x: 0, y: 0 });
  }

  return {
    render(): Frame {
      const t = tick * 0.018;

      // Slowly drifting blob center
      const cx = FRAME_COLS / 2 + 2.5 * Math.sin(t * 0.4);
      const cy = FRAME_ROWS / 2 + 7 * Math.sin(t * 0.27 + 1.2);

      // Update particles: spring toward rest positions + center drift
      for (let i = 0; i < NUM_PARTICLES; i++) {
        const p = pos8[i]!;
        const v = vel8[i]!;
        const angle = restAngles[i]!;

        // Rest position follows blob center
        const rx = cx + BLOB_RADIUS * Math.cos(angle);
        const ry = cy + BLOB_RADIUS * Math.sin(angle);

        // Spring toward rest
        v.x += SPRING_K8 * (rx - p.x);
        v.y += SPRING_K8 * (ry - p.y);
        v.x *= DAMPING8;
        v.y *= DAMPING8;
        p.x += v.x;
        p.y += v.y;
      }

      const f = createFrame();

      // Render: for each pixel, compute if inside the blob polygon
      // Use Gaussian distance to nearest particle surface
      for (let col = 0; col < FRAME_COLS; col++) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          // Distance from pixel to blob center
          const dcx = col - cx;
          const dcy = row - cy;
          const distCenter = Math.sqrt(dcx * dcx + dcy * dcy);

          // Expected radius in this direction (angle)
          const angle = Math.atan2(dcy, dcx);

          // Find nearest two particles and interpolate radius
          let minAngDiff = Infinity;
          let nearRadius = BLOB_RADIUS;
          for (let i = 0; i < NUM_PARTICLES; i++) {
            const p = pos8[i]!;
            const pa = Math.atan2(p.y - cy, p.x - cx);
            let da = angle - pa;
            // Normalize to [-π, π]
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            const absDa = Math.abs(da);
            if (absDa < minAngDiff) {
              minAngDiff = absDa;
              nearRadius = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
            }
          }

          // Inside if distCenter < nearRadius, soft edge
          const edgeSoftness = 1.5;
          const inside = nearRadius - distCenter;
          const brightness = 255 * (1 / (1 + Math.exp(-inside / edgeSoftness)));
          f[col * FRAME_ROWS + row] = clamp255(brightness - 128); // threshold center
        }
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// fluid-9: Double-pendulum trail
// A double pendulum leaves a fading brightness trail. The chaotic motion
// creates hypnotic patterns within the display bounds.
// ---------------------------------------------------------------------------

function createFluid9Renderer(): ZenRendererApi {
  let tick = 0;
  let stopped = false;

  // Double pendulum parameters
  const m1 = 1.0;
  const m2 = 1.0;
  const L1 = 8;   // arm lengths in pixel units
  const L2 = 8;
  const g = 0.5;

  // State: angles and angular velocities
  let theta1 = Math.PI * 0.6;
  let theta2 = Math.PI * 0.9;
  let omega1 = 0.0;
  let omega2 = 0.0;

  // Pivot at top-center of display
  const pivotX = 4;
  const pivotY = 4;

  // Trail buffer: brightness values for each pixel
  const trail = new Float32Array(FRAME_SIZE);
  const TRAIL_DECAY = 0.935;

  return {
    render(): Frame {
      // Integrate double pendulum equations (RK4-lite, just 4 Euler substeps)
      const dt = 0.06;
      const substeps = 4;

      for (let _s = 0; _s < substeps; _s++) {
        // Classic double pendulum equations
        const cos12 = Math.cos(theta1 - theta2);
        const sin12 = Math.sin(theta1 - theta2);
        const den = 2 * m1 + m2 - m2 * Math.cos(2 * (theta1 - theta2));

        const alpha1 =
          (-g * (2 * m1 + m2) * Math.sin(theta1) -
            m2 * g * Math.sin(theta1 - 2 * theta2) -
            2 * sin12 * m2 * (omega2 * omega2 * L2 + omega1 * omega1 * L1 * cos12)) /
          (L1 * den);

        const alpha2 =
          (2 * sin12 *
            (omega1 * omega1 * L1 * (m1 + m2) +
              g * (m1 + m2) * Math.cos(theta1) +
              omega2 * omega2 * L2 * m2 * cos12)) /
          (L2 * den);

        omega1 += alpha1 * dt;
        omega2 += alpha2 * dt;
        theta1 += omega1 * dt;
        theta2 += omega2 * dt;
      }

      // Compute bob positions
      const x1 = pivotX + L1 * Math.sin(theta1);
      const y1 = pivotY + L1 * Math.cos(theta1);
      const x2 = x1 + L2 * Math.sin(theta2);
      const y2 = y1 + L2 * Math.cos(theta2);

      // Decay trail
      for (let i = 0; i < FRAME_SIZE; i++) {
        trail[i] = (trail[i] ?? 0) * TRAIL_DECAY;
      }

      // Paint bob2 position (the chaotic end) brightly
      const col2 = Math.round(x2);
      const row2 = Math.round(y2);
      if (col2 >= 0 && col2 < FRAME_COLS && row2 >= 0 && row2 < FRAME_ROWS) {
        trail[col2 * FRAME_ROWS + row2] = 255;
        // Also paint neighboring pixels for thicker trail
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const nc = col2 + dc;
            const nr = row2 + dr;
            if (nc >= 0 && nc < FRAME_COLS && nr >= 0 && nr < FRAME_ROWS) {
              const idx = nc * FRAME_ROWS + nr;
              const existing = trail[idx] ?? 0;
              trail[idx] = Math.max(existing, 180 * (1 - Math.sqrt(dc * dc + dr * dr) * 0.5));
            }
          }
        }
      }

      // Also paint bob1 (inner bob) more dimly
      const col1 = Math.round(x1);
      const row1 = Math.round(y1);
      if (col1 >= 0 && col1 < FRAME_COLS && row1 >= 0 && row1 < FRAME_ROWS) {
        const idx1 = col1 * FRAME_ROWS + row1;
        const existing = trail[idx1] ?? 0;
        trail[idx1] = Math.max(existing, 120);
      }

      const f = createFrame();
      for (let i = 0; i < FRAME_SIZE; i++) {
        f[i] = clamp255(trail[i] ?? 0);
      }

      if (!stopped) tick++;
      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function createZenFluidRenderer(style: ZenFluidStyle): ZenRendererApi {
  switch (style) {
    case 'fluid-1': return createFluid1Renderer();
    case 'fluid-5': return createFluid5Renderer();
    case 'fluid-9': return createFluid9Renderer();
  }
}
