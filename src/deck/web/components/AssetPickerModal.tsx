import { useState, useEffect, useRef, useReducer } from 'react';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import { Dialog, DialogContent, DialogClose, DialogTitle } from './ui/dialog.js';
import { Button } from './ui/button.js';
import { Tooltip } from './ui/tooltip.js';
import { MatrixPreview } from './MatrixPreview.js';
import { AssetImportPanel } from './AssetImportPanel.js';
import { PanelBar } from './PanelBar.js';

function CornerBrackets({ active }: { active: boolean }) {
  const c = { position: 'absolute' as const, width: 16, height: 16, pointerEvents: 'none' as const };
  const b = `1px solid ${active ? 'white' : 'rgba(255,255,255,0.35)'}`;
  return (
    <div aria-hidden="true" className={`absolute inset-0 pointer-events-none transition-opacity ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}>
      <span style={{ ...c, top: 0,    left: 0,    borderTop: b, borderLeft: b }} />
      <span style={{ ...c, top: 0,    right: 0,   borderTop: b, borderRight: b }} />
      <span style={{ ...c, bottom: 0, left: 0,    borderBottom: b, borderLeft: b }} />
      <span style={{ ...c, bottom: 0, right: 0,   borderBottom: b, borderRight: b }} />
    </div>
  );
}

type AnimState = Record<string, { frameIdx: number; elapsed: number; lastTick: number | null }>;

type AssetGridProps = {
  items: AssetMeta[];
  animState: AnimState;
  current?: string;
  onPick: (filename: string, meta: AssetMeta) => void;
};

function AssetGrid({ items, animState, current, onPick }: AssetGridProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(asset => {
        const frameIdx = animState[asset.name]?.frameIdx ?? 0;
        const pixels = asset.frames[frameIdx] ?? asset.firstFrame;
        const active = asset.name === current;
        const slash = asset.name.lastIndexOf('/');
        const filename = slash === -1 ? asset.name : asset.name.slice(slash + 1);
        const label = filename.replace('.dmx.json', '');
        const tooltipLabel = asset.name.replace('.dmx.json', '');
        const previewW = asset.width === 18 ? 92 : 43;
        return (
          <Tooltip key={asset.name} content={tooltipLabel} side="top" delayDuration={300}>
            <button
              type="button"
              aria-label={active ? `${label}, selected` : label}
              aria-pressed={active}
              className="group relative flex flex-col gap-2 items-center p-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
              onClick={() => onPick(asset.name, asset)}
            >
              <CornerBrackets active={active} />
              <MatrixPreview width={asset.width} pixels={pixels} />
              <span className="font-mono text-xs text-muted-foreground truncate" style={{ maxWidth: previewW }}>{label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

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

export interface AssetPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current?: string;
  onPick: (filename: string, meta?: AssetMeta) => void;
}

export function AssetPickerModal({ open, onOpenChange, current, onPick }: AssetPickerModalProps) {
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [view, setView] = useState<'grid' | 'import'>('grid');
  const [importHasFile, setImportHasFile] = useState(false);
  const importSaveRef = useRef<(() => void) | null>(null);
  const animRef = useRef<AnimState>({});
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const [, forceUpdate] = useReducer(c => c + 1, 0);

  function fetchAssets(): Promise<AssetMeta[]> {
    return fetch('/api/assets')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<{ ok: boolean; assets: AssetMeta[] }>; })
      .then(d => { const list = d.assets ?? []; setAssets(list); return list; })
      .catch(() => { setAssets([]); return []; });
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
  }, [open]);

  function handlePick(filename: string, meta?: AssetMeta) {
    onPick(filename, meta);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-80px)] h-[calc(100vh-80px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {view === 'import' ? 'Import asset' : 'Pick asset'}
        </DialogTitle>

        {/* scrollable body with sticky header so blur covers content as it scrolls */}
        <div className="flex-1 overflow-y-auto">
          <PanelBar
            sticky
            className="px-3 py-2"
            left={view === 'import' ? (
              <Button variant="ghost" className="text-foreground/60 text-xs" aria-label="Back to library" onClick={() => setView('grid')}>
                ‹ library
              </Button>
            ) : undefined}
            center={
              <span className="font-mono text-xs text-foreground">
                {view === 'import' ? 'import asset' : 'pick asset'}
              </span>
            }
            right={
              <div className="flex items-center gap-1">
                {view === 'grid' && (
                  <Button variant="ghost" size="sm" className="font-mono text-xs" aria-label="Import asset" onClick={() => { setImportHasFile(false); setView('import'); }}>
                    import
                  </Button>
                )}
                <div aria-live="polite" aria-atomic="true">
                  {view === 'import' && importHasFile && (
                    <Button variant="default" size="sm" className="font-mono text-xs" aria-label="Save imported asset" onClick={() => importSaveRef.current?.()}>
                      import
                    </Button>
                  )}
                </div>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm" aria-label="Close asset picker" tooltip="Close" tooltipSide="left">×</Button>
                </DialogClose>
              </div>
            }
          />

          {/* content */}
          <div className="p-3">
            {view === 'import' ? (
              <AssetImportPanel
                onSaved={filename => {
                  setImportHasFile(false);
                  void fetchAssets().then(list => {
                    handlePick(filename, list.find(a => a.name === filename));
                  });
                }}
                onHasFileChange={setImportHasFile}
                saveRef={importSaveRef}
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
                    <h2 className="font-mono text-xs text-muted-foreground/50">{dir}</h2>
                    <AssetGrid items={items} animState={animRef.current} {...(current !== undefined ? { current } : {})} onPick={handlePick} />
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
