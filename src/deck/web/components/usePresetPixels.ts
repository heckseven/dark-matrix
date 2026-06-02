import { useRef, useEffect, useCallback } from 'react';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle, RenderCtx } from '../../../animations/audio-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { HudPresetClient } from '../types/hud-preset.js';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import { useDeckStore, deckStore, ROWS } from '../store.js';
import { BROWSER_WIDGET_REGISTRY } from '../widgets/index.js';
import type { ThumbnailOpts } from '../widgets/types.js';

const COLS = 9;

// ── module-level audio renderer cache ────────────────────────────────────────
const _audioCache: Partial<Record<AudioStyle, ReturnType<typeof createAudioRenderer>>> = {};

type AudioFrames    = Partial<Record<AudioStyle, { left: string; right: string }>>;
type ImageAnimState = { frameIdx: number; elapsed: number; lastTick: number | null };

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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _audioCache) delete _audioCache[k as AudioStyle];
  });
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
    const opts: ThumbnailOpts = {
      audioCtx,
      audioFrames: audioFrames as ThumbnailOpts['audioFrames'],
      assetList: assetList ?? undefined,
      imageAnim,
    };
    return BROWSER_WIDGET_REGISTRY[widget.widget].renderThumbnail(widget as never, side, opts);
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
