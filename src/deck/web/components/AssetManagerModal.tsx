import { useState, useEffect, useRef } from 'react';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import { Dialog, DialogContent, DialogClose, DialogTitle } from './ui/dialog.js';
import { Button } from './ui/button.js';
import { MatrixItem } from './MatrixItem.js';
import { AssetImportPanel } from './AssetImportPanel.js';

type AnimState = Record<string, { frameIdx: number; elapsed: number; lastTick: number | null }>;

function groupByDir(assets: AssetMeta[]): { dir: string; items: AssetMeta[] }[] {
  const map = new Map<string, AssetMeta[]>();
  for (const asset of assets) {
    const slash = asset.name.indexOf('/');
    const dir = slash === -1 ? 'assets' : asset.name.slice(0, slash);
    if (!map.has(dir)) map.set(dir, []);
    map.get(dir)!.push(asset);
  }
  const order = ['assets', 'library'];
  const dirs = [...map.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  return dirs.map(dir => ({ dir, items: map.get(dir) ?? [] }));
}

type AssetManagerGridProps = {
  items: AssetMeta[];
  animState: AnimState;
  activeKeyRef: React.MutableRefObject<string | null>;
  onAnimReset: (name: string) => void;
  onAnimClear: (name: string) => void;
  onOpen: (asset: AssetMeta) => void;
  onCopy: (asset: AssetMeta) => void;
  onDelete: (asset: AssetMeta) => void;
};

function AssetManagerGrid({ items, animState, activeKeyRef, onAnimReset, onAnimClear, onOpen, onCopy, onDelete }: AssetManagerGridProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function requestDelete(asset: AssetMeta) {
    if (confirmDelete === asset.name) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmDelete(null);
      onDelete(asset);
    } else {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmDelete(asset.name);
      confirmTimer.current = setTimeout(() => setConfirmDelete(null), 3000);
    }
  }

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  return (
    <div className="flex flex-wrap gap-6">
      {items.map(asset => {
        const frameIdx = animState[asset.name]?.frameIdx ?? 0;
        const pixels = asset.frames[frameIdx] ?? asset.firstFrame;
        const slash = asset.name.lastIndexOf('/');
        const filename = slash === -1 ? asset.name : asset.name.slice(slash + 1);
        const label = filename.replace('.dmx.json', '');
        const confirmingDelete = confirmDelete === asset.name;

        function activate() {
          activeKeyRef.current = asset.name;
          onAnimReset(asset.name);
        }
        function deactivate() {
          if (activeKeyRef.current === asset.name) {
            activeKeyRef.current = null;
            onAnimClear(asset.name);
          }
        }

        return (
          <div
            key={asset.name}
            onMouseEnter={activate}
            onMouseLeave={deactivate}
            onFocusCapture={activate}
            onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) deactivate(); }}
          >
            <MatrixItem
              name={label}
              aria-label={label}
              width={asset.width}
              pixels={pixels}
              onPreviewClick={() => onOpen(asset)}
              controlsTop={
                <Button
                  variant="ghost"
                  className="w-8"
                  aria-label={`Duplicate ${label}`}
                  tooltip="Duplicate"
                  tooltipSide="right"
                  onClick={() => onCopy(asset)}
                >⎘</Button>
              }
              controlsBottom={
                <Button
                  variant="ghost"
                  className={`w-8 ${confirmingDelete ? 'text-red-400' : ''}`}
                  aria-label={confirmingDelete ? `Confirm delete ${label}` : `Delete ${label}`}
                  tooltip={confirmingDelete ? 'click again to confirm' : 'Delete'}
                  tooltipSide="right"
                  onClick={() => requestDelete(asset)}
                >
                  {confirmingDelete ? '?' : '×'}
                </Button>
              }
            />
          </div>
        );
      })}
    </div>
  );
}

export interface AssetManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAsset: (name: string, project: unknown) => void;
}

export function AssetManagerModal({ open, onOpenChange, onOpenAsset }: AssetManagerModalProps) {
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [view, setView] = useState<'grid' | 'import'>('grid');
  const animRef = useRef<AnimState>({});
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const activeKeyRef = useRef<string | null>(null);
  const [tick, setTick] = useState(0);

  function fetchAssets() {
    return fetch('/api/assets')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<{ ok: boolean; assets: AssetMeta[] }>; })
      .then(d => { const list = d.assets ?? []; setAssets(list); return list; })
      .catch(() => { setAssets([]); return [] as AssetMeta[]; });
  }

  useEffect(() => {
    if (!open) return;
    setView('grid');
    void fetchAssets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      const activeKey = activeKeyRef.current;
      if (!activeKey) return;
      const al = assetsRef.current;
      const asset = al?.find(a => a.name === activeKey);
      if (!asset || asset.frames.length <= 1) return;
      const nowMs = Date.now();
      if (!animRef.current[activeKey]) {
        animRef.current[activeKey] = { frameIdx: 0, elapsed: 0, lastTick: null };
      }
      const s = animRef.current[activeKey]!;
      if (s.lastTick !== null) s.elapsed += nowMs - s.lastTick;
      s.lastTick = nowMs;
      while (s.elapsed >= (asset.delays[s.frameIdx] ?? 100)) {
        s.elapsed -= asset.delays[s.frameIdx] ?? 100;
        s.frameIdx = s.frameIdx < asset.frames.length - 1 ? s.frameIdx + 1 : 0;
      }
      setTick(t => t + 1);
    }, 100);
    return () => clearInterval(id);
  }, [open]);

  void tick;

  function handleAnimReset(name: string) {
    animRef.current[name] = { frameIdx: 0, elapsed: 0, lastTick: null };
  }

  function handleAnimClear(name: string) {
    if (animRef.current[name]) animRef.current[name]!.frameIdx = 0;
    setTick(t => t + 1);
  }

  function handleOpen(asset: AssetMeta) {
    fetch(`/api/assets/${encodeURIComponent(asset.name)}?full=1`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<unknown>; })
      .then(project => { onOpenAsset(asset.name, project); })
      .catch(console.error);
  }

  function handleCopy(asset: AssetMeta) {
    fetch('/api/assets/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: asset.name }),
    })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<{ ok: boolean }>; })
      .then(d => { if (d.ok) void fetchAssets(); })
      .catch(console.error);
  }

  function handleDelete(asset: AssetMeta) {
    fetch(`/api/assets/${encodeURIComponent(asset.name)}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<{ ok: boolean }>; })
      .then(d => { if (d.ok) void fetchAssets(); })
      .catch(console.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-80px)] h-[calc(100vh-80px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {view === 'import' ? 'Import asset' : 'Manage assets'}
        </DialogTitle>

        <div className="flex-1 overflow-y-auto">
          <div
            className="sticky top-0 z-10 flex items-center px-3 py-2"
            style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            {view === 'import' && (
              <Button
                variant="ghost"
                className="text-foreground/60 text-xs"
                aria-label="Back to assets"
                onClick={() => setView('grid')}
              >
                ‹ assets
              </Button>
            )}
            <span className="absolute inset-x-0 text-center font-mono text-xs text-foreground pointer-events-none">
              {view === 'import' ? 'import asset' : 'assets'}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {view === 'grid' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-mono text-xs"
                  aria-label="Import asset"
                  onClick={() => setView('import')}
                >
                  import
                </Button>
              )}
              <DialogClose asChild>
                <Button variant="ghost" size="sm" aria-label="Close asset manager" tooltip="Close" tooltipSide="left">×</Button>
              </DialogClose>
            </div>
          </div>

          <div className="p-10">
            {view === 'import' ? (
              <AssetImportPanel
                onSaved={() => {
                  void fetchAssets().then(() => setView('grid'));
                }}
              />
            ) : (
              <div className="flex flex-col gap-6">
                {assets === null && (
                  <span role="status" className="font-mono text-xs text-muted-foreground">loading…</span>
                )}
                {assets !== null && assets.length === 0 && (
                  <p className="font-mono text-xs text-muted-foreground">no assets — import one to get started</p>
                )}
                {assets !== null && assets.length > 0 && groupByDir(assets).map(({ dir, items }) => (
                  <div key={dir} className="flex flex-col gap-3">
                    <h2 className="font-mono text-xs text-muted-foreground">{dir}</h2>
                    <AssetManagerGrid
                      items={items}
                      animState={animRef.current}
                      activeKeyRef={activeKeyRef}
                      onAnimReset={handleAnimReset}
                      onAnimClear={handleAnimClear}
                      onOpen={handleOpen}
                      onCopy={handleCopy}
                      onDelete={handleDelete}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
