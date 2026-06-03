import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '../components/ui/dialog.js';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { BrowserWidgetDescriptor, GridContext, ImageCacheEntry } from './types.js';
import { COLS, ROWS, EMPTY_PIXELS } from './utils.js';
import { imageBase } from '../../../lib/widgets/image.js';
import type { ImageWidget } from '../../../lib/widgets/image.js';

// ── pixel helpers ─────────────────────────────────────────────────────────────

function b64ToUint8(b64: string, expectedBytes: number): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/**
 * Extract one 9-col half from an asset frame (handles 9- or 18-col assets).
 * Returns a base64 string of COLS * ROWS bytes.
 */
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

/**
 * Extract one 9-col half from a raw 18-wide Uint8Array (col-major, 34 rows).
 */
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

// ── delete confirm dialog ─────────────────────────────────────────────────────

function DeleteConfirmDialog({ label, presetCount, onDelete }: {
  label: string;
  presetCount: number;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  function handleOpenChange(next: boolean) {
    if (deleting) return;
    if (!next) setError(null);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Delete ${label}`}
          tooltip={`Delete ${label}`}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-foreground text-foreground/40 hover:text-red-400"
          onClick={e => e.stopPropagation()}
        >×</Button>
      </DialogTrigger>
      <DialogContent variant="destructive" className="flex flex-col gap-3 w-64">
        <DialogTitle>Delete {label}</DialogTitle>
        <DialogDescription>
          This image is used in {presetCount} preset{presetCount !== 1 ? 's' : ''}.
        </DialogDescription>
        <p aria-live="assertive" aria-atomic="true" className="font-mono text-xs text-red-400">{error ?? ''}</p>
        <div className="flex gap-2 justify-end">
          <DialogClose asChild>
            <Button variant="ghost" className="font-mono text-xs" aria-label={`Cancel delete ${label}`} autoFocus disabled={deleting}>cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            className="font-mono text-xs"
            aria-busy={deleting}
            aria-label={deleting ? `Deleting ${label}…` : `Confirm delete ${label}`}
            disabled={deleting}
            onClick={e => {
              e.stopPropagation();
              setDeleting(true);
              setError(null);
              onDelete()
                .then(() => { if (mountedRef.current) setOpen(false); })
                .catch(err => { if (mountedRef.current) setError(err instanceof Error ? err.message : 'Delete failed'); })
                .finally(() => { if (mountedRef.current) setDeleting(false); });
            }}
          >{deleting ? '…' : 'delete'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ImageGrid component ───────────────────────────────────────────────────────

function ImageGrid({ currentWidget, assets, onPick, onShowImport, onDelete, onEdit, getPresetCount }: GridContext) {
  const animRef = useRef<Record<string, { frameIdx: number; elapsed: number; lastTick: number | null }>>({});
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const [, forceUpdate] = useReducer(c => c + 1, 0);

  useEffect(() => {
    const id = setInterval(() => {
      const nowMs = Date.now();
      const al = assetsRef.current;
      if (!al) return;
      for (const asset of al) {
        if (asset.frames.length <= 1) continue;
        if (!animRef.current[asset.name]) {
          animRef.current[asset.name] = { frameIdx: 0, elapsed: 0, lastTick: null };
        }
        const s = animRef.current[asset.name]!;
        if (s.lastTick !== null) s.elapsed += nowMs - s.lastTick;
        s.lastTick = nowMs;
        while (s.elapsed >= (asset.delays[s.frameIdx] ?? 100)) {
          s.elapsed -= asset.delays[s.frameIdx] ?? 100;
          s.frameIdx = s.frameIdx < asset.frames.length - 1 ? s.frameIdx + 1 : 0;
        }
      }
      forceUpdate();
    }, 100);
    return () => clearInterval(id);
  }, []);

  if (assets === null) {
    return <div className="font-mono text-xs text-muted-foreground p-4">loading…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {assets.length === 0 && (
        <p className="font-mono text-xs text-muted-foreground">no assets — import one to get started</p>
      )}
      <div className="flex flex-wrap gap-6">
        {assets.map(asset => {
          const frameIdx = animRef.current[asset.name]?.frameIdx ?? 0;
          const pixels = asset.frames[frameIdx] ?? asset.firstFrame;
          const active = currentWidget?.widget === 'image' && currentWidget.file === asset.name;
          const label = asset.name.replace('.dmx.json', '');
          const presetCount = getPresetCount(asset.name);
          const deleteControl = presetCount === 0 ? (
            <Button
              variant="ghost"
              aria-label={`Delete ${label}`}
              tooltip={`Delete ${label}`}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-foreground/40 hover:text-red-400"
              onClick={e => { e.stopPropagation(); onDelete(asset.name).catch(err => console.error('Failed to delete asset:', err)); }}
            >×</Button>
          ) : (
            <DeleteConfirmDialog label={label} presetCount={presetCount} onDelete={() => onDelete(asset.name)} />
          );
          return (
            <MatrixItem
              key={asset.name}
              name={label}
              aria-label={active ? `${label}, selected` : label}
              width={asset.width as 9 | 18}
              pixels={pixels}
              isSelected={active}
              onSelect={() => onPick({ widget: 'image', file: asset.name })}
              controlsTop={
                <>
                  <Button
                    variant="ghost"
                    aria-label={`Open ${label} in editor`}
                    tooltip="Open in editor"
                    tooltipSide="right"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={e => { e.stopPropagation(); onEdit(asset.name); }}
                  >↗</Button>
                  {deleteControl}
                </>
              }
            />
          );
        })}
      </div>
      {assets.length === 0 && (
        <Button
          variant="primary"
          aria-label="Import image"
          className="font-mono text-xs mt-1 self-start"
          onClick={onShowImport}
        >+ import</Button>
      )}
    </div>
  );
}

// ── descriptor ────────────────────────────────────────────────────────────────

export const imageDescriptor: BrowserWidgetDescriptor<ImageWidget> = {
  ...imageBase,

  GridComponent: ImageGrid,

  renderThumbnail(widget, side, opts) {
    const asset = opts?.assetList?.find(a => a.name === widget.file);
    if (!asset) return EMPTY_PIXELS;
    const frameIdx = opts?.imageAnim?.[widget.file]?.frameIdx ?? 0;
    return extractHalfB64(asset, side, frameIdx);
  },

  renderPreview(widget, side, _now, opts) {
    const cached = opts?.imageCache?.[widget.file];
    if (!cached || !cached.frames.length) return new Uint8Array(COLS * ROWS);
    const frame = cached.frames[cached.frameIdx] ?? cached.frames[0]!;
    if (cached.width === 18) return extractHalf(frame, side);
    return frame;
  },

  serializeConfig(widget, side) {
    return {
      [`${side}Widget`]: 'image',
      [`${side}File`]: widget.file,
    };
  },
};
