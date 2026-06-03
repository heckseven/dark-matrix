import { useEffect, useRef, useCallback } from 'react';
import { createBiomeGrid, createBiomeStep } from '../../../animations/gol.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import { deckStore } from '../store.js';
import { BROWSER_WIDGET_REGISTRY } from '../widgets/index.js';
import type { PreviewOpts } from '../widgets/types.js';
import { MOCK_AUDIO_CTX } from '../widgets/audio.js';
import { createZenRenderer } from '../../../animations/zen-renderers.js';
import type { ZenStyle } from '../../../animations/zen-renderers.js';
import { bayerDitherToUint8 } from '../widgets/utils.js';

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

type ZenPair = {
  style: ZenStyle;
  left:  ReturnType<typeof createZenRenderer>;
  right: ReturnType<typeof createZenRenderer>;
};

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


type ImageEntry = {
  frames: Uint8Array[];
  delays: number[];
  width: 9 | 18;
  frameIdx: number;
  elapsed: number;
  lastTick: number | null;
  loop: boolean;
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
    const opts: PreviewOpts = {
      audioCtx,
      imageCache: imageCache as Record<string, import('../widgets/types.js').ImageCacheEntry>,
      ...(lifeGrid !== undefined ? { lifeGrid } : {}),
    };
    return BROWSER_WIDGET_REGISTRY[widget.widget].renderPreview(widget as never, side, now, opts);
  } catch {
    return empty;
  }
}

// ── canvas drawing ────────────────────────────────────────────────────────

function readThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    bg:      cs.getPropertyValue('--color-background').trim()  || '#000000',
    primary: cs.getPropertyValue('--color-foreground').trim()  || '#ffffff',
    fg:      cs.getPropertyValue('--color-foreground').trim()  || '#ffffff',
  };
}

function tintPixel(primary: string, l: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(primary)) return `rgb(${l},${l},${l})`;
  const r = parseInt(primary.slice(1, 3), 16);
  const g = parseInt(primary.slice(3, 5), 16);
  const b = parseInt(primary.slice(5, 7), 16);
  const s = l / 255;
  return `rgb(${Math.round(r * s)},${Math.round(g * s)},${Math.round(b * s)})`;
}

function drawModule(ctx: CanvasRenderingContext2D, pixels: Uint8Array, xOffset: number, bg: string, primary: string): void {
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let col = 0; col < COLS; col++) {
    const x = xOffset + col * PITCH;
    for (let row = 0; row < ROWS; row++) {
      const y = row * PITCH;
      const v = pixels[col * ROWS + row] ?? 0;
      const l = Math.round(MIN_L + (v / 255) * (255 - MIN_L));
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = tintPixel(primary, l);
      ctx.fillText(v === 0 ? '•' : '∗', x + CELL / 2, y + CELL / 2 + 1);
    }
  }
}

function drawBrackets(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, fg: string): void {
  ctx.strokeStyle = fg;
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
  const zenPairRef = useRef<ZenPair | null>(null);

  useEffect(() => {
    return () => {
      zenPairRef.current?.left.stop();
      zenPairRef.current?.right.stop();
    };
  }, []);

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
          loop: true,
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

    const leftLifeGrid  = advanceLifeSide(lifeStateL, leftWidget,  'left');
    const rightLifeGrid = advanceLifeSide(lifeStateR, rightWidget, 'right');
    const { bg, primary, fg } = readThemeColors();

    // Detect zen wide mode: both sides have the same zen style.
    const isZenWide = leftWidget?.widget === 'zen' && rightWidget?.widget === 'zen' &&
      (leftWidget.style ?? 'waves') === (rightWidget.style ?? 'waves');
    const zenStyle = isZenWide ? ((leftWidget?.style ?? 'waves') as ZenStyle) : null;

    // Manage the wide renderer pair lifecycle.
    if (zenStyle) {
      if (!zenPairRef.current || zenPairRef.current.style !== zenStyle) {
        zenPairRef.current?.left.stop();
        zenPairRef.current?.right.stop();
        zenPairRef.current = {
          style: zenStyle,
          left:  createZenRenderer(zenStyle, 'left'),
          right: createZenRenderer(zenStyle, 'right'),
        };
      }
    } else if (zenPairRef.current) {
      zenPairRef.current.left.stop();
      zenPairRef.current.right.stop();
      zenPairRef.current = null;
    }

    const leftPixels  = zenPairRef.current
      ? bayerDitherToUint8(zenPairRef.current.left.render())
      : getPixels(leftWidget,  'left',  now, audioCtx, imageCache, leftLifeGrid);
    const rightPixels = zenPairRef.current
      ? bayerDitherToUint8(zenPairRef.current.right.render())
      : getPixels(rightWidget, 'right', now, audioCtx, imageCache, rightLifeGrid);

    drawModule(ctx, leftPixels,  0,       bg, primary);
    drawModule(ctx, rightPixels, RIGHT_X, bg, primary);
    // Bracket around the selected side
    const [bx1, bx2] = selectedSide === 'left'
      ? [0.5,           HALF_W - 0.5]
      : [RIGHT_X + 0.5, CANVAS_W - 0.5];
    drawBrackets(ctx, bx1, 0.5, bx2, CANVAS_H - 0.5, fg);
  }, [leftWidget, rightWidget, selectedSide]);

  useEffect(() => {
    paint();
    // ~30 FPS to match the daemon's HUD render rate so scrolling preview feels
    // like the hardware.
    const id = setInterval(paint, 33);
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
