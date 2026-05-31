import { createFrame, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import type { ZenRendererApi } from './zen-renderers.js';

export type ZenBreathStyle = 'breathe' | 'inhale';

export function createZenBreathRenderer(style: ZenBreathStyle, side?: 'left' | 'right'): ZenRendererApi {
  switch (style) {
    case 'breathe': return createBreath1Renderer();
    case 'inhale':  return createBreath2Renderer(side);
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
// breath-2: 4-7-8 breathing — Dual-ring hold-timer visual
// Protocol: inhale 4s → hold 7s → exhale 8s (total 19s cycle)
// Visual:
//   Inhale (0–4s): outer ring expands 0→maxRadius with comet trail on inner edge
//   Hold (4–11s):  outer ring at maxRadius (pulse+shimmer); inner ring grows
//                  0→maxRadius as a hold-progress timer
//   Exhale (11–19s): outer ring contracts maxRadius→0 with comet trail on outer edge;
//                    inner ring is absent
// ---------------------------------------------------------------------------
function createBreath2Renderer(side?: 'left' | 'right'): ZenRendererApi {
  const startTime = Date.now();
  const cycleMs = 19_000;
  const inhaleMs = 4_000;
  const holdMs   = 7_000;
  // exhale: 8_000ms
  const phaseInhaleEnd = inhaleMs / cycleMs;  // ~0.2105
  const phaseHoldEnd   = (inhaleMs + holdMs) / cycleMs; // ~0.5789
  // exhale: phaseHoldEnd – 1.0

  const colOffset = side === 'right' ? FRAME_COLS : 0;
  const centerCol = side !== undefined ? (FRAME_COLS * 2 - 1) / 2 : 4;
  const centerRow = 17;
  const maxRadius = 14;
  const outerFrontWidth = 0.8;
  const outerTrailLength = 5.0;
  const innerRingWidth = 0.5;

  let stopped = false;

  return {
    render(): Frame {
      const f = createFrame();
      if (stopped) return f;

      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleMs;
      const phase = cycleElapsed / cycleMs;

      // Determine outer ring radius, direction, and hold-elapsed
      let outerRadius: number;
      let radialDir: number; // +1 expanding, -1 contracting, 0 holding
      let holdElapsedMs = 0;

      if (phase < phaseInhaleEnd) {
        outerRadius = (phase / phaseInhaleEnd) * maxRadius;
        radialDir = 1;
      } else if (phase < phaseHoldEnd) {
        outerRadius = maxRadius;
        radialDir = 0;
        holdElapsedMs = cycleElapsed - inhaleMs;
      } else {
        const exhaleProgress = (phase - phaseHoldEnd) / (1.0 - phaseHoldEnd);
        outerRadius = (1.0 - exhaleProgress) * maxRadius;
        radialDir = -1;
      }

      // Inner ring only exists during hold phase
      const innerRadius = radialDir === 0
        ? (holdElapsedMs / holdMs) * maxRadius
        : -1;

      if (outerRadius < 0.01 && innerRadius < 0) return f;

      // Hold-phase animation params (reused below)
      const pulse = radialDir === 0
        ? 0.80 + 0.20 * Math.sin(holdElapsedMs / 3000 * Math.PI * 2)
        : 1.0;

      for (let col = 0; col < FRAME_COLS; col++) {
        const virtualCol = col + colOffset;
        for (let row = 0; row < FRAME_ROWS; row++) {
          const dc = virtualCol - centerCol;
          const dr = row - centerRow;
          const dist = Math.sqrt(dc * dc + dr * dr);
          const signedDist = dist - outerRadius;

          let outerBrightness = 0;

          if (radialDir === 0) {
            // Hold: outer ring pulses + shimmer
            const shimmerAngle = holdElapsedMs / 8000 * Math.PI * 2;
            const pixelAngle = Math.atan2(row - centerRow, col - centerCol);
            const shimmer = 0.78 + 0.22 * Math.max(0, Math.cos(pixelAngle - shimmerAngle));
            const d = Math.abs(signedDist);
            const ringWidth = outerFrontWidth + 1.2;
            if (d <= ringWidth) outerBrightness = Math.max(0, 1.0 - d / ringWidth) * pulse * shimmer;
          } else if (radialDir > 0) {
            // Expanding: leading edge outer, trail inner
            if (signedDist >= 0 && signedDist <= outerFrontWidth) {
              outerBrightness = 1.0 - signedDist / outerFrontWidth;
            } else if (signedDist < 0 && signedDist >= -outerTrailLength) {
              outerBrightness = (1.0 + signedDist / outerTrailLength) * 0.65;
            }
          } else {
            // Contracting: leading edge inner, trail outer
            if (signedDist <= 0 && signedDist >= -outerFrontWidth) {
              outerBrightness = 1.0 + signedDist / outerFrontWidth;
            } else if (signedDist > 0 && signedDist <= outerTrailLength) {
              outerBrightness = (1.0 - signedDist / outerTrailLength) * 0.65;
            }
          }

          // Inner ring (hold timer)
          let innerBrightness = 0;
          if (innerRadius >= 0) {
            const innerDist = Math.abs(dist - innerRadius);
            if (innerDist <= innerRingWidth) {
              innerBrightness = (1.0 - innerDist / innerRingWidth) * 0.8;
            }

            // Merge flash when inner ring approaches maxRadius
            const mergeProximity = Math.max(0, 1.0 - Math.abs(innerRadius - maxRadius));
            const mergeFactor = 1.0 + 0.4 * mergeProximity;
            outerBrightness = Math.min(1.0, outerBrightness * mergeFactor);
            innerBrightness = Math.min(1.0, innerBrightness * mergeFactor);
          }

          const brightness = Math.max(outerBrightness, innerBrightness);
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
