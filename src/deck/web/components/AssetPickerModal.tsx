import { useState, useEffect, useRef } from 'react';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.js';
import { Button } from './ui/button.js';
import { MatrixPreview } from './MatrixPreview.js';
import { AssetImportPanel } from './AssetImportPanel.js';

export interface AssetPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current?: string;
  onPick: (filename: string) => void;
}

export function AssetPickerModal({ open, onOpenChange, current, onPick }: AssetPickerModalProps) {
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [view, setView] = useState<'grid' | 'import'>('grid');
  const animRef = useRef<Record<string, { frameIdx: number; elapsed: number; lastTick: number | null }>>({});
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const [tick, setTick] = useState(0);

  function fetchAssets() {
    fetch('/api/assets')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<{ ok: boolean; assets: AssetMeta[] }>; })
      .then(d => setAssets(d.assets ?? []))
      .catch(() => setAssets([]));
  }

  useEffect(() => {
    if (!open) return;
    setView('grid');
    fetchAssets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
      setTick(t => t + 1);
    }, 100);
    return () => clearInterval(id);
  }, [open]);

  void tick;

  function handlePick(filename: string) {
    onPick(filename);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-h-[75vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {view === 'import' ? 'Import asset' : 'Pick asset'}
        </DialogTitle>

        {/* header */}
        <div className="relative flex items-center shrink-0 px-3 py-2 border-b border-foreground/15">
          {view === 'import' ? (
            <Button
              variant="ghost"
              className="text-foreground/60 text-xs"
              aria-label="Back to library"
              onClick={() => setView('grid')}
            >
              ‹ library
            </Button>
          ) : (
            <span className="font-mono text-xs text-muted-foreground px-1">assets</span>
          )}
          <span className="absolute inset-x-0 text-center font-mono text-xs text-foreground pointer-events-none">
            {view === 'import' ? 'import asset' : 'pick asset'}
          </span>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-3">
          {view === 'import' ? (
            <AssetImportPanel
              onSaved={filename => {
                fetchAssets();
                handlePick(filename);
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {assets === null && (
                <span className="font-mono text-xs text-muted-foreground">loading…</span>
              )}
              {assets !== null && (
                <>
                  {assets.length === 0 && (
                    <p className="font-mono text-xs text-muted-foreground">no assets — import one to get started</p>
                  )}
                  {assets.length > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      {assets.map(asset => {
                        const frameIdx = animRef.current[asset.name]?.frameIdx ?? 0;
                        const pixels = asset.frames[frameIdx] ?? asset.firstFrame;
                        const active = asset.name === current;
                        const label = asset.name.replace('.dmx.json', '');
                        return (
                          <button
                            key={asset.name}
                            type="button"
                            aria-label={active ? `${label}, selected` : label}
                            aria-pressed={active}
                            className={`relative flex flex-col gap-2 items-center p-2 w-full rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px] hover:bg-foreground/5${active ? ' outline outline-1 outline-white/40' : ''}${asset.width === 18 ? ' col-span-2' : ''}`}
                            onClick={() => handlePick(asset.name)}
                          >
                            <MatrixPreview width={asset.width} pixels={pixels} />
                            <span className="font-mono text-xs text-muted-foreground truncate max-w-full">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    className="self-start font-mono text-xs"
                    onClick={() => setView('import')}
                  >
                    + import
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
