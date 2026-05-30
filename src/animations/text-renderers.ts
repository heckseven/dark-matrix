import type { Frame } from '../lib/frame.js';
import { FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import { renderText, extractFrame, decodeGlyph, scaleGlyph, SCALE_MAP, type ScrollSize } from './scroll.js';

// Single source of truth for the "strings" widget category. Reused by the Zod
// schema (config.ts), the daemon hud-config validation, and the deck inspector.
export const TEXT_STYLES = ['marquee', 'columnar', 'spine', 'bigglyph', 'neon', 'vegas'] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];
export const TEXT_SIZES = ['tiny', 'small', 'medium', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
// Glyph height in pixels per size (mirrors glyphDims().h) — used for UI labels.
export const TEXT_SIZE_PX: Record<TextSize, number> = { tiny: 5, small: 7, medium: 14, large: 21 };
// Ordered slowest→fastest. Keys are internal only — the UI shows the value
// (px/s or ms/letter), so add/rename tiers freely without touching labels.
// Ordered slowest→fastest. fast2/fast3 are bigglyph-only (very short dwells);
// scrolling styles expose just slowest..fast (see speedOptionsFor in the UI).
export const TEXT_SPEEDS = ['slowest', 'slow', 'normal', 'fast', 'fast2', 'fast3'] as const;
export type TextSpeed = (typeof TEXT_SPEEDS)[number];
// neon flicker frequency — how often a flicker event fires. 'none' disables it.
export const TEXT_FLICKERS = ['none', 'low', 'medium', 'high'] as const;
export type TextFlicker = (typeof TEXT_FLICKERS)[number];
// bigglyph between-letter transition.
export const TEXT_TRANSITIONS = ['none', 'slide', 'dissolve'] as const;
export type TextTransition = (typeof TEXT_TRANSITIONS)[number];

export interface TextWidgetConfig {
  text: string;
  style?: TextStyle | undefined;
  size?: TextSize | undefined;
  speed?: TextSpeed | undefined;
  span?: boolean | undefined;
  flicker?: TextFlicker | undefined;
  transition?: TextTransition | undefined;
  loopDelayMs?: number | undefined;
}

// Stable cache key for memoizing a per-side renderer. Browser preview
// dispatchers key their renderer caches on this so an edit rebuilds only when
// a rendering-relevant field actually changes (not on every keystroke's new
// widget object). Single source so the differentiating-field set can't drift.
export function textRendererCacheKey(w: TextWidgetConfig, side: 'left' | 'right'): string {
  return `${side}|${w.span ? 1 : 0}|${w.style ?? ''}|${w.size ?? ''}|${w.speed ?? ''}|${w.flicker ?? ''}|${w.transition ?? ''}|${w.loopDelayMs ?? 0}|${w.text}`;
}

// neon flicker frequency = how OFTEN a flicker burst begins (per-tick chance).
// A burst darkens up to 3 random letters and blinks them 2-5 times. 'none' off.
const FLICKER_EVENT_PCT: Record<TextFlicker, number> = { none: 0, low: 2, medium: 5, high: 10 };

// Matches the daemon's WidgetRenderer shape (object with render(now)/stop()).
export interface TextRenderer {
  render(now: Date): Frame;
  stop(): void;
}

const ROWS = FRAME_ROWS; // 34
const COLS = FRAME_COLS; // 9
const TICK_MS = 100;     // neon flicker re-roll cadence (independent of render FPS)

// Scroll speed in pixels per SECOND (wall-clock-continuous, so motion is smooth
// at any render frame rate). 10/20/40 px/s ≡ the old 1/2/4 px per 100ms tick.
export const SPEED_PXPS: Record<TextSpeed, number> = { slowest: 5, slow: 10, normal: 20, fast: 40, fast2: 80, fast3: 160 };
// Per-glyph dwell (ms) for bigglyph. Slower = longer dwell; each faster tier halves it.
export const SPEED_DWELL_MS: Record<TextSpeed, number> = { slowest: 2400, slow: 1200, normal: 700, fast: 350, fast2: 175, fast3: 88 };

function sanitizeText(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '').slice(0, 128);
}

function glyphDims(size: TextSize): { w: number; h: number; scale: number; tiny: boolean } {
  const tiny = size === 'tiny';
  const scale = tiny ? 1 : SCALE_MAP[size];
  return { w: (tiny ? 3 : 5) * scale, h: (tiny ? 5 : 7) * scale, scale, tiny };
}

// Blit a decoded+scaled glyph (boolean[][], row-major) into a column-major buffer.
// Optional `keep` predicate (by buffer x,y) filters which set pixels are drawn —
// used by the dissolve transition.
function blitGlyph(buf: Uint8Array, bw: number, glyph: boolean[][], left: number, top: number, keep?: (x: number, y: number) => boolean): void {
  for (let r = 0; r < glyph.length; r++) {
    const row = glyph[r]!;
    const y = top + r;
    if (y < 0 || y >= ROWS) continue;
    for (let c = 0; c < row.length; c++) {
      if (!row[c]) continue;
      const x = left + c;
      if (x < 0 || x >= bw) continue;
      if (keep && !keep(x, y)) continue;
      buf[x * ROWS + y] = 255;
    }
  }
}

function getGlyph(code: number, size: TextSize): boolean[][] {
  const { tiny, scale } = glyphDims(size);
  return scaleGlyph(decodeGlyph(code, tiny), scale);
}

// Deterministic per-(a,b) pseudo-random uint32 — stable across renderers so the
// same tick yields the same flicker everywhere (preview matches hardware).
function hashInt(a: number, b: number): number {
  let x = (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 1, 40503)) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; x ^= x >>> 15;
  return x >>> 0;
}

/**
 * Build a renderer for one HUD side. When `span`, the widget owns both module
 * slots and renders into an 18-wide canvas; this side returns its 9-col half.
 * Animation is derived from absolute wall-clock time so the two independently
 * instantiated side renderers stay in lockstep across the seam.
 */
export function createTextRenderer(widget: TextWidgetConfig, side: 'left' | 'right'): TextRenderer {
  const text = sanitizeText(widget.text) || ' ';
  const style: TextStyle = (widget.style && (TEXT_STYLES as readonly string[]).includes(widget.style)) ? widget.style : 'marquee';
  const size: TextSize = (widget.size && (TEXT_SIZES as readonly string[]).includes(widget.size)) ? widget.size : 'small';
  const speed: TextSpeed = (widget.speed && (TEXT_SPEEDS as readonly string[]).includes(widget.speed)) ? widget.speed : 'normal';
  const span = !!widget.span;
  const canvasW = span ? COLS * 2 : COLS;
  const rightShift = span && side === 'right' ? COLS : 0;
  const pxps = SPEED_PXPS[speed];
  const loopDelayMs = typeof widget.loopDelayMs === 'number' && widget.loopDelayMs > 0 ? Math.min(60_000, widget.loopDelayMs) : 0;
  // Position within one loop in [0, loopPx], continuous in wall-clock time (smooth
  // at any FPS). Holds at 0 (blank/start) for loopDelayMs between loops.
  const loopScroll = (now: Date, loopPx: number): number => {
    const scrollMs = (loopPx / pxps) * 1000;
    const cycleMs = scrollMs + loopDelayMs;
    const phase = ((now.getTime() % cycleMs) + cycleMs) % cycleMs;
    return phase < scrollMs ? Math.floor((pxps * phase) / 1000) : 0;
  };

  // ── marquee: static wide text buffer, horizontal scroll ──────────────────
  if (style === 'marquee') {
    const { buf, width } = renderText(text, size);
    const LEAD = canvasW;
    const total = width + LEAD;
    return {
      render(now) {
        const base = loopScroll(now, total) - LEAD;
        return extractFrame(buf, width, base + rightShift);
      },
      stop() { /* stateless */ },
    };
  }

  // The remaining styles build a fresh canvasW-wide buffer each tick, then the
  // side's 9-col window is extracted.
  const dims = glyphDims(size);

  if (style === 'columnar' || style === 'neon' || style === 'vegas') {
    // Upright chars stacked vertically, centered in the column.
    const gap = Math.max(1, dims.scale);
    const slot = dims.h + gap;
    const left = Math.floor((COLS - dims.w) / 2) + (span ? Math.floor((canvasW - COLS) / 2) : 0);
    const glyphs = [...text].map(ch => getGlyph(ch.charCodeAt(0), size));
    const stackH = glyphs.length * slot;

    if (style === 'columnar') {
      const wrap = stackH + ROWS; // scroll fully off the top, then repeat
      return {
        render(now) {
          const yoff = loopScroll(now, wrap);
          const buf = new Uint8Array(canvasW * ROWS);
          // first glyph starts just below the bottom, rises as yoff grows
          for (let i = 0; i < glyphs.length; i++) {
            const top = ROWS + i * slot - yoff;
            if (top > ROWS || top + dims.h < 0) continue;
            blitGlyph(buf, canvasW, glyphs[i]!, left, top);
          }
          return extractFrame(buf, canvasW, rightShift);
        },
        stop() { /* stateless */ },
      };
    }

    // neon/vegas: static stack (cap to what fits), vertically centered.
    const maxRows = Math.max(1, Math.floor(ROWS / slot));
    const shown = glyphs.slice(0, maxRows);
    const contentH = shown.length * dims.h + (shown.length - 1) * gap;
    const top0 = Math.max(0, Math.floor((ROWS - contentH) / 2));

    if (style === 'vegas') {
      // Old-Vegas marquee: letters hold still while the lit LEDs run a chase
      // down their strokes. A 3-row repeating mask (2 lit, 1 dark) descends at
      // `speed` rows/sec. Applied across the panel — only letter pixels show it
      // since the background is already dark.
      const PERIOD = 3;   // rows per chase cycle
      const LIT = 2;      // lit rows per cycle (so 2 on, 1 off)
      return {
        render(now) {
          const buf = new Uint8Array(canvasW * ROWS);
          for (let i = 0; i < shown.length; i++) blitGlyph(buf, canvasW, shown[i]!, left, top0 + i * slot);
          // Downward sweep: subtract phase from y so the dark gap descends.
          // Wall-clock-derived so both span halves chase in lockstep.
          const phase = Math.floor((pxps * now.getTime()) / 1000);
          for (let x = 0; x < canvasW; x++) {
            for (let y = 0; y < ROWS; y++) {
              if (((((y - phase) % PERIOD) + PERIOD) % PERIOD) >= LIT) buf[x * ROWS + y] = 0;
            }
          }
          return extractFrame(buf, canvasW, rightShift);
        },
        stop() { /* stateless */ },
      };
    }

    // neon: static stack, random letters flicker like a failing tube.
    const flicker = (widget.flicker && (TEXT_FLICKERS as readonly string[]).includes(widget.flicker)) ? widget.flicker : 'medium';
    const eventPct = FLICKER_EVENT_PCT[flicker];
    return {
      render(now) {
        const tick = Math.floor(now.getTime() / TICK_MS);
        const buf = new Uint8Array(canvasW * ROWS);
        // A flicker burst begins rarely (per the frequency setting) and blinks
        // its 1-3 letters several times: dark on even tick-offsets from the
        // start, lit on odd, for `blinks` (2-5, weighted to 2-3) dark phases.
        const dark = new Set<number>();
        const MAX_BURST_AGE = 2 * (5 - 1); // n=5 → dark at offsets 0,2,4,6,8
        for (let age = 0; age <= MAX_BURST_AGE; age++) {
          if (age % 2 !== 0) continue;                       // lit gap between blinks
          const start = tick - age;
          if (hashInt(start, 0) % 100 >= eventPct) continue; // no burst began here
          const r = hashInt(start, 1) % 100;
          const blinks = r < 35 ? 2 : r < 70 ? 3 : r < 88 ? 4 : 5; // 2-3 most common
          if (age / 2 >= blinks) continue;                   // this burst has finished
          const n = Math.min(shown.length, 1 + (hashInt(start, 2) % 3));
          const picked = new Set<number>();
          for (let salt = 3; picked.size < n && salt < 64; salt++) picked.add(hashInt(start, salt) % shown.length);
          for (const idx of picked) dark.add(idx);
        }
        for (let i = 0; i < shown.length; i++) {
          if (dark.has(i)) continue;
          blitGlyph(buf, canvasW, shown[i]!, left, top0 + i * slot);
        }
        return extractFrame(buf, canvasW, rightShift);
      },
      stop() { /* stateless */ },
    };
  }

  if (style === 'spine') {
    // Render text horizontally into a tight strip, rotate 90° CCW, scroll down.
    const { buf: hbuf, width: hw } = renderText(text, size); // hw wide × 34 tall
    // Rotate the used band 90° CCW → a (34 wide × hw tall) image; we only need
    // the glyph band's height (dims.h) which becomes the rotated width.
    // CCW: (x,y) -> (y, hw-1-x). Source columns 0..hw, rows 0..34.
    const rotW = ROWS;        // rotated width  = source height (34)
    const rotH = hw;          // rotated height = source width
    const rot = new Uint8Array(rotW * rotH);
    for (let x = 0; x < hw; x++) {
      for (let y = 0; y < ROWS; y++) {
        if ((hbuf[x * ROWS + y] ?? 0) === 0) continue;
        const nx = y;          // 0..33
        const ny = hw - 1 - x; // 0..hw-1
        rot[nx * rotH + ny] = 255; // column-major in rotated space (width rotW)
      }
    }
    // Center the rotated band horizontally in the canvas (the glyph band sits
    // around the vertical centerline of the original 34-tall buffer). The glyph
    // height differs by size, so nudge right to visually center per size.
    const nudge = size === 'tiny' ? 2 : 0;
    const left = Math.floor((canvasW - rotW) / 2) + nudge;
    const wrap = rotH + ROWS;
    return {
      render(now) {
        const yoff = loopScroll(now, wrap);
        const buf = new Uint8Array(canvasW * ROWS);
        for (let rx = 0; rx < rotW; rx++) {
          const dx = left + rx;
          if (dx < 0 || dx >= canvasW) continue;
          for (let ry = 0; ry < rotH; ry++) {
            if ((rot[rx * rotH + ry] ?? 0) === 0) continue;
            const dy = ry - rotH + yoff; // scroll top→bottom
            if (dy < 0 || dy >= ROWS) continue;
            buf[dx * ROWS + dy] = 255;
          }
        }
        return extractFrame(buf, canvasW, rightShift);
      },
      stop() { /* stateless */ },
    };
  }

  // ── bigglyph: one large glyph at a time, dwell + between-letter transition ──
  const dwell = SPEED_DWELL_MS[speed];
  const glyphs = [...text].map(ch => getGlyph(ch.charCodeAt(0), size));
  const transition: TextTransition = (widget.transition && (TEXT_TRANSITIONS as readonly string[]).includes(widget.transition)) ? widget.transition : 'slide';
  const transMs = transition === 'none' ? 0 : Math.min(200, Math.floor(dwell / 3));
  const top = Math.floor((ROWS - dims.h) / 2);
  const leftOf = (g: boolean[][]) => Math.floor((canvasW - (g[0]?.length ?? 0)) / 2);
  const loopMs = glyphs.length * dwell;
  const cycleMs = loopMs + loopDelayMs;
  return {
    render(now) {
      const buf = new Uint8Array(canvasW * ROWS);
      const phase = ((now.getTime() % cycleMs) + cycleMs) % cycleMs;
      if (phase >= loopMs) return extractFrame(buf, canvasW, rightShift); // inter-loop delay: blank
      const idx = Math.floor(phase / dwell);
      const within = phase % dwell;
      const cur = glyphs[idx]!;
      const inTransition = transMs > 0 && within < transMs && glyphs.length > 1;
      if (inTransition && transition === 'dissolve') {
        const p = within / transMs; // 0→1: incoming dissolves in, outgoing out
        const prev = glyphs[(idx - 1 + glyphs.length) % glyphs.length]!;
        // Per-screen-pixel threshold, stable within this transition (keyed by idx).
        const randAt = (x: number, y: number) => (hashInt(idx, ((y << 6) ^ x) >>> 0) % 1000) / 1000;
        blitGlyph(buf, canvasW, prev, leftOf(prev), top, (x, y) => randAt(x, y) >= p);
        blitGlyph(buf, canvasW, cur, leftOf(cur), top, (x, y) => randAt(x, y) < p);
      } else if (inTransition && transition === 'slide') {
        const slide = Math.round((1 - within / transMs) * (ROWS - top)); // rise from bottom
        blitGlyph(buf, canvasW, cur, leftOf(cur), top + slide);
      } else {
        blitGlyph(buf, canvasW, cur, leftOf(cur), top); // 'none' or settled
      }
      return extractFrame(buf, canvasW, rightShift);
    },
    stop() { /* stateless */ },
  };
}
