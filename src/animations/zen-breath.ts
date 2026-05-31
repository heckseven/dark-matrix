import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenBreathStyle = 'breath-1' | 'breath-2';

export function createZenBreathRenderer(style: ZenBreathStyle): ZenRendererApi {
  switch (style) {
    case 'breath-1': return createBreath1Renderer();
    case 'breath-2': return createBreath2Renderer();
  }
}

// ---------------------------------------------------------------------------
// breath-1: Box breathing (4-4-4-4 seconds) — Column fill visual
// Protocol: inhale 4s → hold 4s → exhale 4s → hold 4s (total 16s cycle)
// Visual: bright region fills from bottom upward during inhale, holds at full
//         during first hold, contracts from top down during exhale, holds empty.
// ---------------------------------------------------------------------------
function createBreath1Renderer(): ZenRendererApi {
  const startTime = Date.now();
  const cycleMs = 16_000;
  const phaseInhaleEnd = 4_000 / cycleMs;   // 0.25
  const phaseHold1End  = 8_000 / cycleMs;   // 0.50
  const phaseExhaleEnd = 12_000 / cycleMs;  // 0.75
  // hold2: 0.75 – 1.0

  let stopped = false;

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const elapsed = Date.now() - startTime;
      const phase = (elapsed % cycleMs) / cycleMs;

      let fillFraction: number;
      if (phase < phaseInhaleEnd) {
        // Inhale: fill level 0 → 1
        fillFraction = phase / phaseInhaleEnd;
      } else if (phase < phaseHold1End) {
        // Hold full
        fillFraction = 1.0;
      } else if (phase < phaseExhaleEnd) {
        // Exhale: fill level 1 → 0
        fillFraction = 1.0 - (phase - phaseHold1End) / (phaseExhaleEnd - phaseHold1End);
      } else {
        // Hold empty
        fillFraction = 0.0;
      }

      // fillFraction maps to rows lit from the bottom up
      const litRows = fillFraction * FRAME_ROWS; // float
      const fullRows = Math.floor(litRows);       // fully-lit row count
      const partial = litRows - fullRows;          // brightness fraction for the top partial pixel

      for (let col = 0; col < FRAME_COLS; col++) {
        for (let i = 0; i < fullRows; i++) {
          const row = FRAME_ROWS - 1 - i;
          f[col * FRAME_ROWS + row] = 255;
        }
        if (fullRows < FRAME_ROWS && partial > 0) {
          const row = FRAME_ROWS - 1 - fullRows;
          f[col * FRAME_ROWS + row] = Math.round(partial * 255);
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
// breath-2: 4-7-8 breathing — Radial ring visual
// Protocol: inhale 4s → hold 7s → exhale 8s (total 19s cycle)
// Visual: a thin bright ring expands from center during inhale, holds at max
//         radius during hold, contracts back to center during exhale.
// Center: col 4, row 17. Max radius ~8 pixels.
// ---------------------------------------------------------------------------
function createBreath2Renderer(): ZenRendererApi {
  const startTime = Date.now();
  const cycleMs = 19_000;
  const phaseInhaleEnd = 4_000 / cycleMs;   // ~0.211
  const phaseHoldEnd   = 11_000 / cycleMs;  // ~0.579
  // exhale: ~0.579 – 1.0

  const centerCol = 4;
  const centerRow = 17;
  const maxRadius = 14; // extends well past horizontal edges; partial arc is the look
  const frontWidth = 0.8;  // sharp leading edge
  const trailLength = 5.0; // comet tail on trailing edge

  let stopped = false;

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const elapsed = Date.now() - startTime;
      const phase = (elapsed % cycleMs) / cycleMs;

      let radius: number;
      // radialDir: +1 = expanding, -1 = contracting, 0 = holding
      let radialDir: number;
      if (phase < phaseInhaleEnd) {
        radius = (phase / phaseInhaleEnd) * maxRadius;
        radialDir = 1;
      } else if (phase < phaseHoldEnd) {
        radius = maxRadius;
        radialDir = 0;
      } else {
        const exhaleProgress = (phase - phaseHoldEnd) / (1.0 - phaseHoldEnd);
        radius = (1.0 - exhaleProgress) * maxRadius;
        radialDir = -1;
      }

      if (radius < 0.01) return f;

      for (let col = 0; col < FRAME_COLS; col++) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          const dc = col - centerCol;
          const dr = row - centerRow;
          const dist = Math.sqrt(dc * dc + dr * dr);
          // signed distance: positive = outside ring, negative = inside
          const signedDist = dist - radius;

          let brightness = 0;

          if (radialDir === 0) {
            // Holding at max — ring pulses gently and a shimmer orbits
            const holdElapsedMs = Math.max(0, (elapsed % cycleMs) - phaseInhaleEnd * cycleMs);
            const pulse = 0.80 + 0.20 * Math.sin(holdElapsedMs / 3000 * Math.PI * 2);
            const shimmerAngle = holdElapsedMs / 8000 * Math.PI * 2;
            const pixelAngle = Math.atan2(row - centerRow, col - centerCol);
            const shimmer = 0.78 + 0.22 * Math.max(0, Math.cos(pixelAngle - shimmerAngle));
            const d = Math.abs(signedDist);
            const ringWidth = frontWidth + 1.2;
            if (d <= ringWidth) brightness = Math.max(0, 1.0 - d / ringWidth) * pulse * shimmer;
          } else if (radialDir > 0) {
            // Expanding: leading edge is outer (signedDist > 0), trail is inner (signedDist < 0)
            if (signedDist >= 0 && signedDist <= frontWidth) {
              brightness = 1.0 - signedDist / frontWidth;
            } else if (signedDist < 0 && signedDist >= -trailLength) {
              brightness = (1.0 + signedDist / trailLength) * 0.65;
            }
          } else {
            // Contracting: leading edge is inner (signedDist < 0), trail is outer (signedDist > 0)
            if (signedDist <= 0 && signedDist >= -frontWidth) {
              brightness = 1.0 + signedDist / frontWidth;
            } else if (signedDist > 0 && signedDist <= trailLength) {
              brightness = (1.0 - signedDist / trailLength) * 0.65;
            }
          }

          if (brightness > 0) {
            f[col * FRAME_ROWS + row] = Math.round(Math.max(0, Math.min(1, brightness)) * 255);
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
// breath-3: Coherence/resonance breathing (5.5s / 5.5s) — Sine halo visual
// Protocol: continuous smooth sine wave, inhale 5.5s → exhale 5.5s (11s cycle)
// Visual: entire display pulses as a smooth cosine-derived sine wave.
//         (1 - cos(phase * 2π)) / 2 gives a 0→1→0 shape over one full cycle.
// ---------------------------------------------------------------------------
function createBreath3Renderer(): ZenRendererApi {
  const startTime = Date.now();
  const cycleMs = 11_000;

  let stopped = false;

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const elapsed = Date.now() - startTime;
      const phase = (elapsed % cycleMs) / cycleMs;

      // Smooth 0→1→0 sine shape using cosine: no hard transitions
      const sine = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
      const brightness = Math.round(sine * 255);

      for (let i = 0; i < f.length; i++) {
        f[i] = brightness;
      }

      return f;
    },
    stop(): void {
      stopped = true;
    },
  };
}
