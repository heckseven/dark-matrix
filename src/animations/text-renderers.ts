import type { Frame } from '../lib/frame.js';
import { FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import { renderText, extractFrame, decodeGlyph, scaleGlyph, SCALE_MAP, type ScrollSize } from './scroll.js';

// Single source of truth for the "strings" widget category. Reused by the Zod
// schema (config.ts), the daemon hud-config validation, and the deck inspector.
export const TEXT_STYLES = ['marquee', 'columnar', 'spine', 'bigglyph', 'neon'] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];
export const TEXT_SIZES = ['tiny', 'small', 'medium', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type TextSpeed = (typeof TEXT_SPEEDS)[number];
// neon flicker frequency — how often a character blinks dark per tick.
export const TEXT_FLICKERS = ['low', 'medium', 'high'] as const;
export type TextFlicker = (typeof TEXT_FLICKERS)[number];

export interface TextWidgetConfig {
  text: string;
  style?: TextStyle | undefined;
  size?: TextSize | undefined;
  speed?: TextSpeed | undefined;
  span?: boolean | undefined;
  flicker?: TextFlicker | undefined;
}

// Stable cache key for memoizing a per-side renderer. Browser preview
// dispatchers key their renderer caches on this so an edit rebuilds only when
// a rendering-relevant field actually changes (not on every keystroke's new
// widget object). Single source so the differentiating-field set can't drift.
export function textRendererCacheKey(w: TextWidgetConfig, side: 'left' | 'right'): string {
  return `${side}|${w.span ? 1 : 0}|${w.style ?? ''}|${w.size ?? ''}|${w.speed ?? ''}|${w.flicker ?? ''}|${w.text}`;
}

// neon flicker frequency = how OFTEN a flicker event happens (each a quick
// ~100ms flick that darkens up to 3 random letters at once). The setting is the
// per-tick chance that an event fires — kept low so flickers stay occasional.
const FLICKER_EVENT_PCT: Record<TextFlicker, number> = { low: 4, medium: 10, high: 20 };

// Matches the daemon's WidgetRenderer shape (object with render(now)/stop()).
export interface TextRenderer {
  render(now: Date): Frame;
  stop(): void;
}

const ROWS = FRAME_ROWS; // 34
const COLS = FRAME_COLS; // 9
const TICK_MS = 100;     // HUD loop cadence (10 FPS); also the preview paint interval

// Pixels advanced per 100ms tick for scrolling styles.
const SPEED_PX: Record<TextSpeed, number> = { slow: 1, normal: 2, fast: 4 };
// Per-glyph dwell (ms) for bigglyph.
const SPEED_DWELL_MS: Record<TextSpeed, number> = { slow: 1200, normal: 700, fast: 350 };

function sanitizeText(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '').slice(0, 128);
}

function glyphDims(size: TextSize): { w: number; h: number; scale: number; tiny: boolean } {
  const tiny = size === 'tiny';
  const scale = tiny ? 1 : SCALE_MAP[size];
  return { w: (tiny ? 3 : 5) * scale, h: (tiny ? 5 : 7) * scale, scale, tiny };
}

// Blit a decoded+scaled glyph (boolean[][], row-major) into a column-major buffer.
function blitGlyph(buf: Uint8Array, bw: number, glyph: boolean[][], left: number, top: number): void {
  for (let r = 0; r < glyph.length; r++) {
    const row = glyph[r]!;
    const y = top + r;
    if (y < 0 || y >= ROWS) continue;
    for (let c = 0; c < row.length; c++) {
      if (!row[c]) continue;
      const x = left + c;
      if (x < 0 || x >= bw) continue;
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
  const px = SPEED_PX[speed];

  // ── marquee: static wide text buffer, horizontal scroll ──────────────────
  if (style === 'marquee') {
    const { buf, width } = renderText(text, size);
    const LEAD = canvasW;
    const total = width + LEAD;
    return {
      render(now) {
        const tick = Math.floor(now.getTime() / TICK_MS);
        const base = (((px * tick) % total) + total) % total - LEAD;
        return extractFrame(buf, width, base + rightShift);
      },
      stop() { /* stateless */ },
    };
  }

  // The remaining styles build a fresh canvasW-wide buffer each tick, then the
  // side's 9-col window is extracted.
  const dims = glyphDims(size);

  if (style === 'columnar' || style === 'neon') {
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
          const tick = Math.floor(now.getTime() / TICK_MS);
          const yoff = ((px * tick) % wrap + wrap) % wrap;
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

    // neon: static stack (cap to what fits), vertically centered.
    const maxRows = Math.max(1, Math.floor(ROWS / slot));
    const shown = glyphs.slice(0, maxRows);
    const contentH = shown.length * dims.h + (shown.length - 1) * gap;
    const top0 = Math.max(0, Math.floor((ROWS - contentH) / 2));
    const flicker = (widget.flicker && (TEXT_FLICKERS as readonly string[]).includes(widget.flicker)) ? widget.flicker : 'medium';
    const eventPct = FLICKER_EVENT_PCT[flicker];
    return {
      render(now) {
        const tick = Math.floor(now.getTime() / TICK_MS);
        const buf = new Uint8Array(canvasW * ROWS);
        // Occasionally (per the frequency setting) a quick flicker darkens up to
        // 3 random letters at once for this tick; otherwise all letters are lit.
        const dark = new Set<number>();
        if (hashInt(tick, 0) % 100 < eventPct) {
          const count = Math.min(shown.length, 1 + (hashInt(tick, 1) % 3));
          for (let salt = 2; dark.size < count && salt < 64; salt++) {
            dark.add(hashInt(tick, salt) % shown.length);
          }
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
    const nudge = size === 'tiny' ? 2 : size === 'small' ? 1 : 0;
    const left = Math.floor((canvasW - rotW) / 2) + nudge;
    const wrap = rotH + ROWS;
    return {
      render(now) {
        const tick = Math.floor(now.getTime() / TICK_MS);
        const yoff = ((px * tick) % wrap + wrap) % wrap;
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

  // ── bigglyph: one large glyph at a time, dwell + simple slide transition ──
  const dwell = SPEED_DWELL_MS[speed];
  const glyphs = [...text].map(ch => getGlyph(ch.charCodeAt(0), size));
  const transMs = Math.min(200, Math.floor(dwell / 3));
  return {
    render(now) {
      const t = now.getTime();
      const idx = Math.floor(t / dwell) % glyphs.length;
      const within = t % dwell;
      const buf = new Uint8Array(canvasW * ROWS);
      const g = glyphs[idx]!;
      const gw = g[0]?.length ?? 0;
      const baseLeft = Math.floor((canvasW - gw) / 2);
      const top = Math.floor((ROWS - dims.h) / 2);
      // slide-in from the bottom during the transition window
      const slide = within < transMs ? Math.round((1 - within / transMs) * (ROWS - top)) : 0;
      blitGlyph(buf, canvasW, g, baseLeft, top + slide);
      return extractFrame(buf, canvasW, rightShift);
    },
    stop() { /* stateless */ },
  };
}
