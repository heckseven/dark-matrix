import { useEffect, useRef, useCallback } from 'react';
import { createBiomeGrid, createBiomeStep } from '../../../animations/gol.js';
import { createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import { renderElegantTimer, renderHourglassFrame, renderTwinzTimer } from '../../../animations/timer-renderers.js';
import { getDataRenderer } from '../data-renderer-pool.js';
import { createHeatmapState, bumpTool, renderHeatmap } from '../../../animations/heatmap.js';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle, RenderCtx } from '../../../animations/audio-renderers.js';
import { createClaudeMatrixRenderer, createClaudeContextRenderer, createClaudeSandRenderer, createClaudeTetrisRenderer } from '../../../animations/claude-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import { deckStore } from '../store.js';

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

function b64ToUint8(b64: string, expectedBytes: number): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

type LifeState = {
  biomeName: string;
  grid: Uint8Array;
  step: (g: Uint8Array) => Uint8Array;
  tickMs: number;
  lastStepAt: number;
};

// Return the 9-col half of a snapshot as a base64 string (handles 9- or 18-col snapshots).
function snapshotHalf(snapshot: string, side: 'left' | 'right'): string {
  try {
    const bin = atob(snapshot);
    if (bin.length === COLS * ROWS) return snapshot;
    const full = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) full[i] = bin.charCodeAt(i);
    const out = new Uint8Array(COLS * ROWS);
    const colOffset = side === 'right' ? COLS : 0;
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        out[col * ROWS + row] = full[(col + colOffset) * ROWS + row] ?? 0;
      }
    }
    return btoa(String.fromCharCode(...out));
  } catch {
    return btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));
  }
}

// Extract one 9-col half from an 18-wide pixel buffer (col-major, 34 rows)
function extractHalf(full: Uint8Array, side: 'left' | 'right'): Uint8Array {
  const out = new Uint8Array(COLS * ROWS);
  const colOffset = side === 'right' ? COLS : 0;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      out[col * ROWS + row] = full[(col + colOffset) * ROWS + row] ?? 0;
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

const _previewClaudeMatrix = createClaudeMatrixRenderer();
const _previewClaudeContext = (() => {
  const r = createClaudeContextRenderer();
  for (const tool of ['Read', 'Bash', 'Edit', 'Grep', 'Write', 'Read', 'Bash']) {
    r.onEvent({ type: 'tool_use', tool, sessionId: 'preview', rawByteLen: 600 });
  }
  return r;
})();
const _previewClaudeSand = (() => {
  const r = createClaudeSandRenderer();
  for (let i = 0; i < 60; i++) {
    if (i % 4 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
    r.render();
  }
  return r;
})();
const _previewClaudeTetris = (() => {
  const r = createClaudeTetrisRenderer();
  for (let i = 0; i < 180; i++) {
    if (i % 3 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
    r.render();
  }
  return r;
})();

const _usagePreviewFrame = (() => {
  const frame = new Uint8Array(COLS * ROWS);
  const filledRows = Math.round(0.5 * ROWS);
  for (let col = 0; col < COLS; col++) {
    for (let row = Math.max(0, ROWS - filledRows); row < ROWS; row++) {
      frame[col * ROWS + row] = 255;
    }
  }
  return frame;
})();

let _dualPreviewClaudeTick = 0;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _clockL) delete _clockL[k as ClockFace];
    for (const k in _clockR) delete _clockR[k as ClockFace];
    for (const k in _audioRenderers) delete _audioRenderers[k as AudioStyle];
    _previewClaudeMatrix.stop();
    _previewClaudeContext.stop();
    _previewClaudeSand.stop();
    _previewClaudeTetris.stop();
  });
}

type ImageEntry = {
  frames: Uint8Array[];
  delays: number[];
  width: 9 | 18;
  frameIdx: number;
  elapsed: number;
  lastTick: number | null;
};
type ImagePixelsCache = Record<string, ImageEntry | undefined>;

function advanceImages(imageCache: ImagePixelsCache, now: Date): void {
  const nowMs = now.getTime();
  for (const entry of Object.values(imageCache)) {
    if (!entry || entry.frames.length <= 1) continue;
    if (entry.lastTick !== null) entry.elapsed += nowMs - entry.lastTick;
    entry.lastTick = nowMs;
    while (entry.elapsed >= (entry.delays[entry.frameIdx] ?? 100)) {
      entry.elapsed -= entry.delays[entry.frameIdx] ?? 100;
      entry.frameIdx = entry.frameIdx < entry.frames.length - 1 ? entry.frameIdx + 1 : 0;
    }
  }
}

function getPixels(widget: HudWidget | null, side: 'left' | 'right', now: Date, audioCtx: RenderCtx, imageCache: ImagePixelsCache, lifeGrid?: Uint8Array): Uint8Array {
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
      const cached = imageCache[widget.file];
      if (!cached || !cached.frames.length) return empty;
      const frame = cached.frames[cached.frameIdx] ?? cached.frames[0]!;
      if (cached.width === 18) return extractHalf(frame, side);
      return frame;
    } else if (widget.widget === 'life') {
      if (lifeGrid) {
        const out = new Uint8Array(COLS * ROWS);
        for (let i = 0; i < out.length; i++) out[i] = lifeGrid[i]! > 0 ? 255 : 0;
        return out;
      }
      const biomes = deckStore.getState().biomePresets;
      const b = biomes.find(b => b.name === widget.biomeName);
      if (!b?.gridSnapshot) return empty;
      const raw = b64ToUint8(snapshotHalf(b.gridSnapshot, side), COLS * ROWS);
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < out.length; i++) out[i] = raw[i]! > 0 ? 255 : 0;
      return out;
    } else if (widget.widget === 'data') {
      const frame = getDataRenderer(widget.style ?? 'line').render();
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return out;
    } else if (widget.widget === 'timer') {
      // Cycle the hourglass slowly so the static preview shows drain + fall animation.
      const hgFraction = (_dualPreviewClaudeTick % 300) / 300;
      const frame = widget.style === 'hourglass'
        ? renderHourglassFrame(hgFraction, _dualPreviewClaudeTick)
        : widget.style === 'twinz'
          ? renderTwinzTimer(90_061)
          : renderElegantTimer(90_000);
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return out;
    } else if (widget.widget === 'claude') {
      const style = widget.style ?? 'matrix';
      if (style === 'usage') return _usagePreviewFrame;
      const raw = style === 'sand'    ? _previewClaudeSand.render()
                : style === 'tetris'  ? _previewClaudeTetris.render()
                : style === 'context' ? _previewClaudeContext.render()
                :                       _previewClaudeMatrix.render();
      return bayerDither(raw);
    } else {
      return empty;
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
  const imageCacheRef = useRef<ImagePixelsCache>({});
  const lifeStateL = useRef<LifeState | null>(null);
  const lifeStateR = useRef<LifeState | null>(null);

  // Load assets when an image widget is present
  const leftFile  = leftWidget?.widget  === 'image' ? leftWidget.file  : null;
  const rightFile = rightWidget?.widget === 'image' ? rightWidget.file : null;
  useEffect(() => {
    if (!leftFile && !rightFile) return;
    let cancelled = false;
    deckStore.getState().loadAssets().then(() => {
      if (cancelled) return;
      const { assetList } = deckStore.getState();
      if (!assetList) return;
      for (const asset of assetList) {
        if (imageCacheRef.current[asset.name]) continue;
        const bytesPerFrame = asset.width * ROWS;
        imageCacheRef.current[asset.name] = {
          frames: asset.frames.map(f => b64ToUint8(f, bytesPerFrame)),
          delays: asset.delays,
          width: asset.width,
          frameIdx: 0,
          elapsed: 0,
          lastTick: null,
        };
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [leftFile, rightFile]);

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
    const nowMs = now.getTime();
    const audioCtx = audioCtxRef.current;
    const imageCache = imageCacheRef.current;
    advanceImages(imageCache, now);

    function advanceLifeSide(
      stateRef: { current: LifeState | null },
      widget: HudWidget | null,
      side: 'left' | 'right',
    ): Uint8Array | undefined {
      if (!widget || widget.widget !== 'life' || widget.biomeName === 'random') {
        stateRef.current = null;
        return undefined;
      }
      const biomeName = widget.biomeName;
      const b = deckStore.getState().biomePresets.find(bm => bm.name === biomeName);
      if (!b || !b.gridSnapshot) { stateRef.current = null; return undefined; }
      let state = stateRef.current;
      if (!state || state.biomeName !== biomeName) {
        state = {
          biomeName,
          grid: createBiomeGrid(snapshotHalf(b.gridSnapshot, side)),
          step: createBiomeStep(b.algorithm),
          tickMs: b.tickMs,
          lastStepAt: nowMs,
        };
        stateRef.current = state;
      } else {
        while (nowMs - state.lastStepAt >= state.tickMs) {
          state.grid = state.step(state.grid);
          state.lastStepAt += state.tickMs;
        }
      }
      return state.grid;
    }

    _dualPreviewClaudeTick++;
    const t = _dualPreviewClaudeTick;
    if (t % 8 === 0) {
      const tools = ['Read', 'Bash', 'Edit', 'Grep', 'Write'] as const;
      _previewClaudeMatrix.onEvent({ type: 'tool_use', tool: tools[t % tools.length]!, sessionId: 'preview' });
    }
    if (t % 40 === 0) _previewClaudeMatrix.onEvent({ type: 'agent_spawn', sessionId: 'preview' });
    if (t % 6 === 0) {
      _previewClaudeSand.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
      _previewClaudeTetris.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
    }

    const leftLifeGrid  = advanceLifeSide(lifeStateL, leftWidget,  'left');
    const rightLifeGrid = advanceLifeSide(lifeStateR, rightWidget, 'right');
    drawModule(ctx, getPixels(leftWidget,  'left',  now, audioCtx, imageCache, leftLifeGrid),  0);
    drawModule(ctx, getPixels(rightWidget, 'right', now, audioCtx, imageCache, rightLifeGrid), RIGHT_X);
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
