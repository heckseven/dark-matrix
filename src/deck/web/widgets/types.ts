import type React from 'react';
import type { HudWidget } from '../types/hud-preset.js';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import type { WidgetDescriptor } from '../../../lib/widgets/types.js';

export interface GridContext {
  currentWidget: HudWidget | null;
  onPick: (w: HudWidget) => void;
  onSettings: (w: HudWidget) => void;
  side: 'left' | 'right';
  audioCtx: RenderCtx | null;
  onMount: () => void;
  onUnmount: () => void;
  dual: boolean;
  dualModule: boolean;
  onDeleteBiome?: (name: string) => void;
  onEditBiome?: (name: string) => void;
  assets: AssetMeta[] | null;
  onShowImport: () => void;
  onDelete: (name: string) => void;
  onEdit: (name: string) => void;
  getPresetCount: (name: string) => number;
  // settings layer props
  uid: string;
  onChange: (w: HudWidget) => void;
  onChangeBoth?: (w: HudWidget) => void;
}

// Optional aux data passed to thumbnail/preview renders. Each widget uses
// only the fields relevant to it; callers pass what they have.
export interface ThumbnailOpts {
  audioCtx?: RenderCtx;
  // pre-rendered audio frames keyed by style → side, from the live HUD preview
  audioFrames?: Partial<Record<string, Partial<Record<'left' | 'right', string>>>>;
  assetList?: AssetMeta[];
  // current animated frame index per asset filename, driven by the caller
  imageAnim?: Record<string, { frameIdx: number }>;
  // true when both sides share the same zen style — widget should render its half of the wide animation
  wide?: boolean;
}

export interface ImageCacheEntry {
  frames: Uint8Array[];
  frameIdx: number;
  width: number;
  lastTick: number | null;
  elapsed: number;
  loop: boolean;
}

export interface PreviewOpts {
  audioCtx?: RenderCtx;
  // live CA grid from the Life simulation canvas (overrides snapshot lookup)
  lifeGrid?: Uint8Array;
  // animated image frame cache managed by the caller (HudDualPreview)
  imageCache?: Record<string, ImageCacheEntry>;
}

export interface BrowserWidgetDescriptor<T extends HudWidget> extends WidgetDescriptor<T> {
  readonly GridComponent: React.FC<GridContext>;
  readonly SettingsComponent?: React.FC<GridContext>;
  renderThumbnail(widget: T, side: 'left' | 'right', opts?: ThumbnailOpts): string;
  renderPreview(widget: T, side: 'left' | 'right', now: Date, opts?: PreviewOpts): Uint8Array;
  serializeConfig(widget: T, side: 'left' | 'right'): Record<string, unknown>;
}
