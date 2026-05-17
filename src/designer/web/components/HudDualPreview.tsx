import { useEffect, useRef, useCallback } from 'react';
import { createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import { getDataRenderer } from '../data-renderer-pool.js';
import { createHeatmapState, bumpTool, renderHeatmap } from '../../../animations/heatmap.js';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle, RenderCtx } from '../../../animations/audio-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';

// ── layout constants — match PixelCanvas at zoom=1 ────────────────────────

const MIN_L    = 48;
const CELL     = 20;
const GAP      = 1;
const PITCH    = CELL + GAP;   // 21
const ROWS     = 34;
const COLS     = 9;
const MOD_GAP  = 8;
const FONT     = '14px monospace';
const BRACKET  = 16;           // arm length for corner brackets

// Derived dimensions
const HALF_W   = COLS * PITCH - GAP;           // 188 — width of one 9-col module
const CANVAS_W = COLS * PITCH * 2 - GAP + MOD_GAP; // 385
const CANVAS_H = ROWS * PITCH - GAP;           // 713
const RIGHT_X  = COLS * PITCH + MOD_GAP;       // 197 — x where right module starts
// Click split: midpoint of the inter-module gap
const SPLIT_X  = HALF_W + Math.floor((RIGHT_X - HALF_W) / 2); // 192

// ── renderer caches ───────────────────────────────────────────────────────

const _clockL: Partial<Record<ClockFace, ClockRenderer>> = {};
const _clockR: Partial<Record<ClockFace, ClockRenderer>> = {};

const MOCK_AUDIO_CTX: RenderCtx = { bands: [200, 150, 100, 70, 40, 20, 10, 5, 2], fftSize: 2048, gain: 1.5 };
const _audioRenderers: Partial<Record<AudioStyle, ReturnType<typeof createAudioRenderer>>> = {};
function getAudioRenderer(style: AudioStyle) {
  if (!_audioRenderers[style]) _audioRenderers[style] = createAudioRenderer(style);
  return _audioRenderers[style]!;
}

const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;
function bayerDither(frame: Uint8Array): Uint8Array {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
      out[col * ROWS + row] = (frame[col * ROWS + row] ?? 0) > threshold ? 255 : 0;
    }
  }
  return out;
}

function mirrorFrame(frame: Uint8Array): Uint8Array {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    const src = COLS - 1 - col;
    for (let row = 0; row < ROWS; row++) {
      out[col * ROWS + row] = frame[src * ROWS + row] ?? 0;
    }
  }
  return out;
}

// Seeded heatmap preview state — static demo for the dual-preview canvas
const _heatmapPreview = (() => {
  const s = createHeatmapState();
  for (const t of ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Agent', 'Skill', 'ToolSearch', 'TodoWrite', 'Task', 'WebSearch', 'WebFetch']) {
    bumpTool(s, t);
  }
  return s;
})();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _clockL) delete _clockL[k as ClockFace];
    for (const k in _clockR) delete _clockR[k as ClockFace];
    for (const k in _audioRenderers) delete _audioRenderers[k as AudioStyle];
  });
}

function getPixels(widget: HudWidget | null, side: 'left' | 'right', now: Date, audioCtx: RenderCtx): Uint8Array {
  const empty = new Uint8Array(COLS * ROWS);
  if (!widget) return empty;
  try {
    if (widget.widget === 'clock') {
      const face  = widget.face ?? 'elegant';
      const cache = side === 'left' ? _clockL : _clockR;
      if (!cache[face]) cache[face] = createClockRenderer(face);
      const frame = cache[face]!({ now, side });
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return out;
    } else if (widget.widget === 'audio') {
      const style = widget.style ?? AUDIO_STYLES[0]!.id;
      const rendered = bayerDither(getAudioRenderer(style)(audioCtx));
      return side === 'right' ? mirrorFrame(rendered) : rendered;
    } else if (widget.widget === 'heatmap') {
      const [lf, rf] = renderHeatmap(_heatmapPreview);
      const frame = side === 'left' ? lf : rf;
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return out;
    } else if (widget.widget === 'image') {
      // TODO: render image widget
      return empty;
    } else {
      const style = widget.style ?? 'line';
      const frame = getDataRenderer(style).render();
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return out;
    }
  } catch {
    return empty;
  }
}

// ── canvas drawing ────────────────────────────────────────────────────────

function drawModule(ctx: CanvasRenderingContext2D, pixels: Uint8Array, xOffset: number): void {
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let col = 0; col < COLS; col++) {
    const x = xOffset + col * PITCH;
    for (let row = 0; row < ROWS; row++) {
      const y = row * PITCH;
      const v = pixels[col * ROWS + row] ?? 0;
      const l = Math.round(MIN_L + (v / 255) * (255 - MIN_L));
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = `rgb(${l},${l},${l})`;
      ctx.fillText(v === 0 ? '•' : '∗', x + CELL / 2, y + CELL / 2 + 1);
    }
  }
}

function drawBrackets(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1,          y1 + BRACKET); ctx.lineTo(x1,          y1); ctx.lineTo(x1 + BRACKET, y1);
  ctx.moveTo(x2 - BRACKET, y1);          ctx.lineTo(x2,          y1); ctx.lineTo(x2,          y1 + BRACKET);
  ctx.moveTo(x1,          y2 - BRACKET); ctx.lineTo(x1,          y2); ctx.lineTo(x1 + BRACKET, y2);
  ctx.moveTo(x2 - BRACKET, y2);          ctx.lineTo(x2,          y2); ctx.lineTo(x2,          y2 - BRACKET);
  ctx.stroke();
}

// ── component ─────────────────────────────────────────────────────────────

export type HudDualPreviewProps = {
  leftWidget:    HudWidget | null;
  rightWidget:   HudWidget | null;
  selectedSide:  'left' | 'right';
  onSelectSide:  (side: 'left' | 'right') => void;
  audioCtx?:     RenderCtx;
  clockNow?:     Date;
};

export function HudDualPreview({
  leftWidget,
  rightWidget,
  selectedSide,
  onSelectSide,
  audioCtx = MOCK_AUDIO_CTX,
  clockNow,
}: HudDualPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<RenderCtx>(audioCtx);
  audioCtxRef.current = audioCtx;
  const clockNowRef = useRef<Date | undefined>(clockNow);
  clockNowRef.current = clockNow;

  // Size canvas on mount (DPR-aware)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width        = Math.round(CANVAS_W * dpr);
    canvas.height       = Math.round(CANVAS_H * dpr);
    canvas.style.width  = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const now = clockNowRef.current ?? new Date();
    const audioCtx = audioCtxRef.current;
    drawModule(ctx, getPixels(leftWidget,  'left',  now, audioCtx), 0);
    drawModule(ctx, getPixels(rightWidget, 'right', now, audioCtx), RIGHT_X);
    // Bracket around the selected side
    if (selectedSide === 'left') {
      drawBrackets(ctx, 0.5, 0.5, HALF_W - 0.5, CANVAS_H - 0.5);
    } else {
      drawBrackets(ctx, RIGHT_X + 0.5, 0.5, CANVAS_W - 0.5, CANVAS_H - 0.5);
    }
  }, [leftWidget, rightWidget, selectedSide]);

  useEffect(() => {
    paint();
    const id = setInterval(paint, 100);
    return () => clearInterval(id);
  }, [paint]);

  // p-2 = 8px padding; hit regions are offset accordingly
  const PAD = 8;

  return (
    <div className="p-2" style={{ position: 'relative', display: 'inline-block' }}>
      <canvas ref={canvasRef} aria-hidden="true" className="block" />

      {/* Left hit region */}
      <button
        type="button"
        aria-label="Select left panel"
        aria-pressed={selectedSide === 'left'}
        style={{
          position: 'absolute',
          top: PAD, left: PAD,
          width: SPLIT_X, height: CANVAS_H,
          background: 'transparent',
          cursor: 'pointer',
          border: 'none',
          padding: 0,
        }}
        onClick={() => onSelectSide('left')}
      />

      {/* Right hit region */}
      <button
        type="button"
        aria-label="Select right panel"
        aria-pressed={selectedSide === 'right'}
        style={{
          position: 'absolute',
          top: PAD, left: PAD + SPLIT_X,
          right: PAD, height: CANVAS_H,
          background: 'transparent',
          cursor: 'pointer',
          border: 'none',
          padding: 0,
        }}
        onClick={() => onSelectSide('right')}
      />
    </div>
  );
}
