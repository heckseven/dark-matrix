import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenFaceStyle = 'face-3';

export function createZenFaceRenderer(style: ZenFaceStyle, side?: 'left' | 'right'): ZenRendererApi {
  switch (style) {
    case 'face-3': return createFace3Renderer(side);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function getCenter(side?: 'left' | 'right'): { colOffset: number; centerCol: number; totalCols: number } {
  const totalCols = side !== undefined ? FRAME_COLS * 2 : FRAME_COLS;
  const colOffset = side === 'right' ? FRAME_COLS : 0;
  const centerCol = (totalCols - 1) / 2;
  return { colOffset, centerCol, totalCols };
}

// ---------------------------------------------------------------------------
// face-1: Rotating petal form
// Flower with oscillating petal count (4–7) that slowly rotates.
// ---------------------------------------------------------------------------
function createFace1Renderer(side?: 'left' | 'right'): ZenRendererApi {
  const startTime = Date.now();
  let stopped = false;
  const { colOffset, centerCol } = getCenter(side);
  const centerRow = FRAME_ROWS / 2;
  const petalLen = 9.0;
  const petalSharpness = 6;

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const t = (Date.now() - startTime) / 1000; // seconds

      // Oscillate petal count 4–7 over a ~20s cycle
      const N = Math.round(Math.max(4, Math.min(7, 4.5 + 2.5 * Math.sin(t * Math.PI / 10))));
      // Global slow rotation
      const rotation = t * 0.15;

      for (let col = 0; col < FRAME_COLS; col++) {
        const vc = col + colOffset; // virtual col
        for (let row = 0; row < FRAME_ROWS; row++) {
          const dc = vc - centerCol;
          const dr = row - centerRow;
          const r = Math.sqrt(dc * dc + dr * dr);
          const alpha = Math.atan2(dr, dc);

          // Center disc
          if (r <= 1.5) {
            f[col * FRAME_ROWS + row] = 255;
            continue;
          }

          // Sum petal contributions
          let totalBrightness = 0;
          for (let k = 0; k < N; k++) {
            const petalAngle = (2 * Math.PI * k) / N + rotation;
            // Standard petal brightness: directional * radial falloff
            const cosA = Math.cos(alpha - petalAngle);
            if (cosA <= 0) continue;
            const directional = Math.pow(cosA, petalSharpness);
            const radialFalloff = Math.exp(-(r / petalLen) * (r / petalLen));
            totalBrightness += directional * radialFalloff;
          }

          const brightness = Math.min(1.0, totalBrightness);
          if (brightness > 0.01) {
            f[col * FRAME_ROWS + row] = clamp255(brightness * 230);
          }
        }
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// face-2: Mandala rings
// Concentric rings with rotating radial segments per ring.
// ---------------------------------------------------------------------------
function createFace2Renderer(side?: 'left' | 'right'): ZenRendererApi {
  const startTime = Date.now();
  let stopped = false;
  const { colOffset, centerCol, totalCols } = getCenter(side);
  const centerRow = FRAME_ROWS / 2;

  // Scale ring radii to available width
  const scale = totalCols / 9;
  const rings = [
    { r: 3 * scale, n: 6, omega: 0.3 },
    { r: 6 * scale, n: 8, omega: -0.2 },
    { r: 10 * scale, n: 10, omega: 0.15 },
  ];

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const t = (Date.now() - startTime) / 1000;

      for (let col = 0; col < FRAME_COLS; col++) {
        const vc = col + colOffset;
        for (let row = 0; row < FRAME_ROWS; row++) {
          const dc = vc - centerCol;
          const dr = row - centerRow;
          const r = Math.sqrt(dc * dc + dr * dr);
          const theta = Math.atan2(dr, dc);

          let totalBrightness = 0;

          for (const ring of rings) {
            const ringBrightness = Math.exp(-(((r - ring.r) / 0.8) ** 2));
            const segBrightness = Math.pow(
              Math.max(0, Math.cos(ring.n * (theta - ring.omega * t))),
              8,
            );
            totalBrightness += ringBrightness * segBrightness;
          }

          // Small center point
          if (r < 1.0) totalBrightness = Math.max(totalBrightness, 1.0);

          const brightness = Math.min(1.0, totalBrightness);
          if (brightness > 0.01) {
            f[col * FRAME_ROWS + row] = clamp255(brightness * 240);
          }
        }
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}

// ---------------------------------------------------------------------------
// face-3: Morphing rose petals
// Polar rose r = A * |cos(k * θ/2)| morphing between k=2 and k=4.
// ---------------------------------------------------------------------------
function createFace3Renderer(side?: 'left' | 'right'): ZenRendererApi {
  const startTime = Date.now();
  let stopped = false;
  const { colOffset, centerCol } = getCenter(side);
  const centerRow = FRAME_ROWS / 2;
  const petalRadius = 8.0;

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const t = (Date.now() - startTime) / 1000;

      // Morph k smoothly 2→4→2 over 30s
      const kT = (t % 30) / 30;
      const kSmooth = 2 + 2 * Math.sin(kT * Math.PI);
      // Slow rotation of the entire figure
      const figRotation = t * 0.1;

      for (let col = 0; col < FRAME_COLS; col++) {
        const vc = col + colOffset;
        for (let row = 0; row < FRAME_ROWS; row++) {
          const dc = vc - centerCol;
          const dr = row - centerRow;
          const r = Math.sqrt(dc * dc + dr * dr);
          const effectiveTheta = Math.atan2(dr, dc) - figRotation;

          const rCurve = petalRadius * Math.abs(Math.cos(kSmooth * effectiveTheta / 2));
          const curveBrightness = Math.exp(-(((r - rCurve) / 1.2) ** 2));

          // Slight interior fill
          const interiorBrightness = Math.exp(-r / petalRadius * 2) * 0.3;

          const brightness = Math.min(1.0, curveBrightness + interiorBrightness);
          if (brightness > 0.01) {
            f[col * FRAME_ROWS + row] = clamp255(brightness * 235);
          }
        }
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}
