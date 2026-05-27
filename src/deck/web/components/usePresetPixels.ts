import { useRef, useEffect, useCallback } from 'react';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import { createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataStyle, DataRenderer } from '../../../animations/data-renderers.js';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle, RenderCtx } from '../../../animations/audio-renderers.js';
import { createHeatmapState, bumpTool, renderHeatmap } from '../../../animations/heatmap.js';
import { renderElegantTimer, renderHourglassFrame } from '../../../animations/timer-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { HudPresetClient } from '../types/hud-preset.js';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import { useDeckStore, deckStore, ROWS } from '../store.js';

const COLS = 9;

// ── module-level renderer caches ──────────────────────────────────────────────

const _clockCache: Partial<Record<ClockFace, ClockRenderer>> = {};
const _dataCache:  Partial<Record<DataStyle, DataRenderer>> = {};
const _audioCache: Partial<Record<AudioStyle, ReturnType<typeof createAudioRenderer>>> = {};

const _heatmapPreview = (() => {
  const s = createHeatmapState();
  for (const t of ['Bash', 'Read', 'Edit', 'Agent', 'Skill', 'ToolSearch', 'TodoWrite', 'Task']) bumpTool(s, t);
  return s;
})();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _clockCache) delete _clockCache[k as ClockFace];
    for (const k in _dataCache)  delete _dataCache[k as DataStyle];
    for (const k in _audioCache) delete _audioCache[k as AudioStyle];
  });
}

// ── pixel helpers ─────────────────────────────────────────────────────────────

function extractLifeHalf(snapshot: string, side: 'left' | 'right'): string {
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

type AudioFrames    = Partial<Record<AudioStyle, { left: string; right: string }>>;
type ImageAnimState = { frameIdx: number; elapsed: number; lastTick: number | null };

function b64ToUint8(b64: string, expectedBytes: number): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i++) arr[i] = bin.charCodeAt(i);
  return arr;
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

function extractHalfB64(asset: AssetMeta, side: 'left' | 'right', frameIdx = 0): string {
  const totalBytes = asset.width * ROWS;
  const srcB64 = asset.frames[frameIdx] ?? asset.firstFrame;
  const full = b64ToUint8(srcB64, totalBytes);
  if (asset.width === 9) return btoa(String.fromCharCode(...full));
  const colOffset = side === 'right' ? COLS : 0;
  const out = new Uint8Array(COLS * ROWS);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      out[col * ROWS + row] = full[(col + colOffset) * ROWS + row] ?? 0;
    }
  }
  return btoa(String.fromCharCode(...out));
}

function renderWidgetToB64(
  widget:     HudWidget | null,
  side:       'left' | 'right',
  audioCtx:   RenderCtx,
  audioFrames?: AudioFrames,
  assetList?:   AssetMeta[] | null,
  imageAnim?:   Record<string, ImageAnimState>,
): string {
  const empty = btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));
  if (!widget) return empty;
  try {
    if (widget.widget === 'clock') {
      const face: ClockFace = widget.face ?? 'elegant';
      if (!_clockCache[face]) _clockCache[face] = createClockRenderer(face);
      const frame = _clockCache[face]!({ now: new Date(), side });
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return btoa(String.fromCharCode(...out));
    }
    if (widget.widget === 'audio') {
      const style  = widget.style ?? AUDIO_STYLES[0]!.id;
      const cached = audioFrames?.[style]?.[side];
      if (cached) return cached;
      if (!_audioCache[style]) _audioCache[style] = createAudioRenderer(style);
      const frame = _audioCache[style]!(audioCtx);
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      const pixels = side === 'right' ? mirrorFrame(out) : out;
      return btoa(String.fromCharCode(...pixels));
    }
    if (widget.widget === 'heatmap') {
      const [lf, rf] = renderHeatmap(_heatmapPreview);
      const frame = side === 'left' ? lf : rf;
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return btoa(String.fromCharCode(...out));
    }
    if (widget.widget === 'image') {
      const asset = assetList?.find(a => a.name === widget.file);
      if (!asset) return empty;
      const frameIdx = imageAnim?.[widget.file]?.frameIdx ?? 0;
      return extractHalfB64(asset, side, frameIdx);
    }
    if (widget.widget === 'life') {
      if (widget.biomeName === 'random') return empty;
      const b = deckStore.getState().biomePresets.find(b => b.name === widget.biomeName);
      if (!b?.gridSnapshot) return empty;
      return extractLifeHalf(b.gridSnapshot, side);
    }
    if (widget.widget === 'timer') {
      const style = widget.style ?? 'elegant';
      const frame = style === 'hourglass'
        ? renderHourglassFrame(0.5)
        : renderElegantTimer(90_000);
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return btoa(String.fromCharCode(...out));
    }
    if (widget.widget === 'claude') return empty;
    const style: DataStyle = widget.style ?? 'line';
    if (!_dataCache[style]) _dataCache[style] = createDataRenderer({ style });
    const frame = _dataCache[style]!.render();
    const out = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
    return btoa(String.fromCharCode(...out));
  } catch {
    return empty;
  }
}

function combinePixels(left: string, right: string): string {
  try { return btoa(atob(left) + atob(right)); } catch { return left; }
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns getPixels and onTick for use with MatrixItemColumn animated={true}.
 * onTick pre-computes audio frames and advances image animation so getPixels
 * reads from refs — one interval, no redundant rendering per item.
 */
export function usePresetPixels(presets: HudPresetClient[], audioCtx: RenderCtx) {
  const assetList = useDeckStore(s => s.assetList);

  const audioCtxRef  = useRef(audioCtx);
  const presetsRef   = useRef(presets);
  const assetListRef = useRef(assetList);
  audioCtxRef.current  = audioCtx;
  presetsRef.current   = presets;
  assetListRef.current = assetList;

  const audioFramesRef = useRef<AudioFrames>({});
  const imageAnimRef   = useRef<Record<string, ImageAnimState>>({});

  useEffect(() => {
    const hasImage = presets.some(p => p.left?.widget === 'image' || p.right?.widget === 'image');
    if (hasImage) deckStore.getState().loadAssets().catch(err => console.error('[usePresetPixels] loadAssets failed:', err));
  }, [presets]);

  const onTick = useCallback((_tick: number) => {
    const ctx = audioCtxRef.current;
    const ps  = presetsRef.current;

    const needed = new Set<AudioStyle>();
    for (const p of ps) {
      if (p.left?.widget  === 'audio') needed.add(p.left.style  ?? AUDIO_STYLES[0]!.id);
      if (p.right?.widget === 'audio') needed.add(p.right.style ?? AUDIO_STYLES[0]!.id);
    }
    const frames: AudioFrames = {};
    for (const style of needed) {
      if (!_audioCache[style]) _audioCache[style] = createAudioRenderer(style);
      const raw = _audioCache[style]!(ctx);
      const bw  = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < raw.length; i++) bw[i] = (raw[i] ?? 0) > 127 ? 255 : 0;
      frames[style] = {
        left:  btoa(String.fromCharCode(...bw)),
        right: btoa(String.fromCharCode(...mirrorFrame(bw))),
      };
    }
    audioFramesRef.current = frames;

    const nowMs     = Date.now();
    const imageAnim = imageAnimRef.current;
    const al        = assetListRef.current;
    const usedAssets = new Set<string>();
    for (const p of ps) {
      if (p.left?.widget  === 'image' && p.left.file)  usedAssets.add(p.left.file);
      if (p.right?.widget === 'image' && p.right.file) usedAssets.add(p.right.file);
    }
    for (const name of usedAssets) {
      const asset = al?.find(a => a.name === name);
      if (!asset || asset.frames.length <= 1) continue;
      if (!imageAnim[name]) imageAnim[name] = { frameIdx: 0, elapsed: 0, lastTick: null };
      const s = imageAnim[name]!;
      if (s.lastTick !== null) s.elapsed += nowMs - s.lastTick;
      s.lastTick = nowMs;
      while (s.elapsed >= (asset.delays[s.frameIdx] ?? 100)) {
        s.elapsed -= asset.delays[s.frameIdx] ?? 100;
        s.frameIdx = s.frameIdx < asset.frames.length - 1 ? s.frameIdx + 1 : 0;
      }
    }
  }, []);

  const getPixels = useCallback((preset: HudPresetClient, _tick: number): string => {
    const af = audioFramesRef.current;
    const ia = imageAnimRef.current;
    const al = assetListRef.current;
    const leftPx  = renderWidgetToB64(preset.left,  'left',  audioCtxRef.current, af, al, ia);
    const rightPx = renderWidgetToB64(preset.right, 'right', audioCtxRef.current, af, al, ia);
    return combinePixels(leftPx, rightPx);
  }, []);

  return { getPixels, onTick };
}
