import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { AssetImportPanel } from './AssetImportPanel.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import { deckStore } from '../store.js';
import { BROWSER_WIDGET_REGISTRY } from '../widgets/index.js';
import type { GridContext } from '../widgets/types.js';
import { MOCK_AUDIO_CTX } from '../widgets/audio.js';
import { STRINGS_STYLE_LABELS } from '../widgets/text.js';

// ── Layer 1: Category select ──────────────────────────────────────────────

// Order here is display order only; the default selection is hardcoded to
// 'time' below (see useState), not CATEGORIES[0].
const CATEGORIES = [
  { id: 'strings', label: 'strings' },
  { id: 'time',  label: 'time'  },
  { id: 'timer', label: 'timer' },
  { id: 'media', label: 'media' },
  { id: 'data',  label: 'data'  },
  { id: 'audio', label: 'audio' },
  { id: 'life',  label: 'life'  },
  { id: 'agent', label: 'agent' },
  { id: 'zen',   label: 'zen'   },
] as const;

// ── HudInspector ──────────────────────────────────────────────────────────

export type HudInspectorProps = {
  widget: HudWidget | null;
  side?: 'left' | 'right';
  audioCtx?: RenderCtx;
  onNeedsAudio?: (needs: boolean) => void;
  onClocksVisible?: (visible: boolean) => void;
  onChange: (widget: HudWidget) => void;
  onChangeBoth?: (widget: HudWidget) => void;
  onDeleteBiome?: (name: string) => void;
  onEditBiome?: (name: string) => void;
  dualModule?: boolean;
};

type View = 'grid' | 'settings';

export function HudInspector({ widget, side = 'left', audioCtx = MOCK_AUDIO_CTX, onNeedsAudio, onClocksVisible, onChange, onChangeBoth, onDeleteBiome, onEditBiome, dualModule = false }: HudInspectorProps) {
  const uid = useId();

  const [view, setView] = useState<View>(() => {
    if (widget && BROWSER_WIDGET_REGISTRY[widget.widget].hasSettings(widget as never)) return 'settings';
    return 'grid';
  });
  const [activeCategory, setActiveCategory] = useState<string>(() =>
    widget ? BROWSER_WIDGET_REGISTRY[widget.widget].category : 'time'
  );

  // Image assets
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importHasFile, setImportHasFile] = useState(false);
  const importSaveRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Fetch assets when image category is active
  useEffect(() => {
    if (activeCategory !== 'media') return;
    let cancelled = false;
    fetch('/api/assets')
      .then(r => r.json() as Promise<{ ok: boolean; assets: AssetMeta[] }>)
      .then(d => { if (!cancelled) setAssets(d.assets ?? []); })
      .catch(err => { if (!cancelled) { console.error('Failed to load assets:', err); setAssets([]); } });
    return () => { cancelled = true; };
  }, [activeCategory]);

  const handleAudioMount   = useCallback(() => onNeedsAudio?.(true),  [onNeedsAudio]);
  const handleAudioUnmount = useCallback(() => onNeedsAudio?.(false), [onNeedsAudio]);

  useEffect(() => {
    onClocksVisible?.(view === 'grid' && activeCategory === 'time');
  }, [view, activeCategory, onClocksVisible]);

  function refreshAssets() {
    fetch('/api/assets')
      .then(r => r.json() as Promise<{ ok: boolean; assets: AssetMeta[] }>)
      .then(d => { if (mountedRef.current) setAssets(d.assets ?? []); })
      .catch(err => console.error('Failed to refresh assets:', err));
  }

  function handleDeleteAsset(name: string) {
    fetch(`/api/assets/${encodeURIComponent(name)}`, { method: 'DELETE' })
      .then(() => refreshAssets())
      .catch(err => console.error('Failed to delete asset:', err));
  }

  function getPresetCount(name: string): number {
    return deckStore.getState().hudPresets.filter(p =>
      (p.left?.widget === 'image' && p.left.file === name) ||
      (p.right?.widget === 'image' && p.right.file === name)
    ).length;
  }

  function handlePick(w: HudWidget) {
    onChange(w);
  }

  function handleSettings(w: HudWidget) {
    onChange(w);
    setView('settings');
  }

  function handleEditImage(name: string) {
    // Fetch directly — openFromLibrary runs sanitizeFilename which replaces '.' → '_', breaking known-safe library filenames like "foo.dmx.json"
    fetch(`/api/library/${encodeURIComponent(name)}`)
      .then(r => { if (!r.ok) throw new Error(`Open failed: ${r.status}`); return r.json(); })
      .then(project => {
        const title = name.replace(/\.dmx\.json$/i, '');
        deckStore.getState().loadProject(project);
        deckStore.getState().setProjectTitle(title);
        deckStore.getState().setLibraryPath(name);
        deckStore.getState().addRecentFile(name);
        deckStore.getState().setActiveMode('design');
      })
      .catch(console.error);
  }

  const backLabel = `‹ ${activeCategory}`;
  const backAriaLabel = `Back to ${activeCategory}`;
  const showImportHeader = showImport && activeCategory === 'media';
  // Settings heading names the specific widget (e.g. "spine settings") for
  // string widgets, otherwise the category (e.g. "data settings").
  const settingsTitle = widget?.widget === 'text'
    ? `${STRINGS_STYLE_LABELS[widget.style ?? 'marquee']} settings`
    : `${activeCategory} settings`;

  // ── Layer 2 + Layer 3 header
  const header = (
    <div className="relative flex items-center shrink-0 px-2 py-1">
      {showImportHeader ? (
        <Button variant="ghost" className="text-foreground/60 text-xs" aria-label="Cancel import" tooltip="Cancel import" onClick={() => { setImportHasFile(false); setShowImport(false); }}>
          <span aria-hidden="true">‹</span>
        </Button>
      ) : view === 'settings' ? (
        <Button variant="ghost" className="text-foreground/60 text-xs" aria-label={backAriaLabel} onClick={() => setView('grid')}>
          <span aria-hidden="true">{backLabel}</span>
        </Button>
      ) : (
        <Select
          value={activeCategory}
          options={CATEGORIES.map(c => ({ value: c.id, label: c.label }))}
          onValueChange={setActiveCategory}
          aria-label="Widget category"
        />
      )}
      <span aria-hidden="true" className="absolute inset-x-0 text-center font-mono text-xs text-foreground pointer-events-none">
        {showImportHeader ? 'import image' : (view === 'settings' ? settingsTitle : '')}
      </span>
      <div aria-live="polite" aria-atomic="true" className="ml-auto">
        {showImportHeader && importHasFile && (
          <Button variant="default" size="sm" className="font-mono text-xs" aria-label="Save imported asset" onClick={() => importSaveRef.current?.()}>
            import
          </Button>
        )}
        {!showImportHeader && activeCategory === 'media' && assets !== null && assets.length > 0 && (
          <Button variant="ghost" size="sm" className="font-mono text-xs" aria-label="Import image" onClick={() => { setImportHasFile(false); setShowImport(true); }}>
            + import
          </Button>
        )}
      </div>
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {showImportHeader ? 'Import image' : view === 'settings' ? settingsTitle : ''}
      </span>
    </div>
  );

  // ── Layer 2
  if (view === 'grid') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {header}
        {showImport && activeCategory === 'media' ? (
          <div className="flex-1 overflow-y-auto">
            <AssetImportPanel
              onSaved={(savedFilename) => {
                setImportHasFile(false);
                setShowImport(false);
                handlePick({ widget: 'image', file: savedFilename });
                refreshAssets();
              }}
              onHasFileChange={setImportHasFile}
              saveRef={importSaveRef}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="py-4 px-2">
              {(() => {
                const gridCtx: GridContext = {
                  currentWidget: widget,
                  onPick: handlePick,
                  onSettings: handleSettings,
                  side,
                  audioCtx,
                  onMount: handleAudioMount,
                  onUnmount: handleAudioUnmount,
                  dual: dualModule,
                  dualModule,
                  ...(onDeleteBiome ? { onDeleteBiome } : {}),
                  ...(onEditBiome ? { onEditBiome } : {}),
                  assets,
                  onShowImport: () => { setImportHasFile(false); setShowImport(true); },
                  onDelete: handleDeleteAsset,
                  onEdit: handleEditImage,
                  getPresetCount,
                  uid,
                  onChange,
                  ...(onChangeBoth ? { onChangeBoth } : {}),
                };
                const descriptor = Object.values(BROWSER_WIDGET_REGISTRY)
                  .find(d => d.category === activeCategory);
                if (!descriptor) return null;
                const GridComp = descriptor.GridComponent;
                return <GridComp {...gridCtx} />;
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Layer 3 (settings layer)
  if (!widget) return null;

  const settingsDescriptor = BROWSER_WIDGET_REGISTRY[widget.widget];
  if (!settingsDescriptor.SettingsComponent) return null;

  const SettingsComp = settingsDescriptor.SettingsComponent;
  const settingsCtx: GridContext = {
    currentWidget: widget,
    onPick: handlePick,
    onSettings: handleSettings,
    side,
    audioCtx,
    onMount: handleAudioMount,
    onUnmount: handleAudioUnmount,
    dual: dualModule,
    dualModule,
    ...(onDeleteBiome ? { onDeleteBiome } : {}),
    ...(onEditBiome ? { onEditBiome } : {}),
    assets,
    onShowImport: () => { setImportHasFile(false); setShowImport(true); },
    onDelete: handleDeleteAsset,
    onEdit: handleEditImage,
    getPresetCount,
    uid,
    onChange,
    ...(onChangeBoth ? { onChangeBoth } : {}),
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {header}
      <div className="flex-1 overflow-y-auto">
        <div className="py-4 px-2">
          <SettingsComp {...settingsCtx} />
        </div>
      </div>
    </div>
  );
}
