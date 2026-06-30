import { useState, useEffect, useRef, useCallback } from 'react';
import { useDeckStore, deckStore, ROWS } from '../store.js';
import { MatrixItemColumn } from './MatrixItemColumn.js';
import { useAlignedTopPad } from './useAlignedTopPad.js';
import { LifeCanvas, encodeGrid, makeRandomGrid } from './LifeCanvas.js';
import { LifeInspector } from './LifeInspector.js';
import { LibraryPickerModal, type LibraryEntry } from './LibraryPickerModal.js';
import { ThreePanelLayout } from './ThreePanelLayout.js';
import type { BiomePreset } from '../types/life-types.js';
import type { DmxProject } from '../../format.js';
import { createReconnectingSocket } from '../reconnect.js';

function fitAssetFrame(firstFrame: string, srcWidth: 9 | 18, dstCols: 9 | 18): string {
  let bin: string;
  try { bin = atob(firstFrame); } catch { return btoa(String.fromCharCode(...new Uint8Array(dstCols * ROWS))); }
  const src = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i)!;
  const dst = new Uint8Array(dstCols * ROWS);
  if (srcWidth === dstCols) {
    for (let i = 0; i < src.length; i++) dst[i] = src[i]! > 127 ? 255 : 0;
  } else {
    for (let c = 0; c < Math.min(srcWidth, dstCols); c++)
      for (let r = 0; r < ROWS; r++)
        dst[c * ROWS + r] = (src[c * ROWS + r] ?? 0) > 127 ? 255 : 0;
  }
  return btoa(String.fromCharCode(...dst));
}

export let lifeTriggerSave: () => void = () => {};

function makeBiome(): BiomePreset {
  const ts = Date.now().toString(36);
  return { name: `biome-${ts}`, algorithm: 'conway', tickMs: 120 };
}

export function LifePanel({ topPad = 0, bottomPad = 0, dualModule = false, onCursorMove }: { topPad?: number; bottomPad?: number; dualModule?: boolean; onCursorMove?: (pos: { col: number; row: number } | null) => void }) {
  const [designPickerOpen, setDesignPickerOpen] = useState(false);
  const [importEntries, setImportEntries] = useState<LibraryEntry[] | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const biomePresets       = useDeckStore(s => s.biomePresets);
  const selectedBiomeName  = useDeckStore(s => s.selectedBiomeName);
  const lifeIsPlaying      = useDeckStore(s => s.lifeIsPlaying);
  const lifeGeneration     = useDeckStore(s => s.lifeGeneration);
  const lifeStepForwardCount = useDeckStore(s => s.lifeStepForwardCount);
  const lifeStepBackCount    = useDeckStore(s => s.lifeStepBackCount);

  const cols: 9 | 18 = dualModule ? 18 : 9;
  const selectedBiome = biomePresets.find(b => b.name === selectedBiomeName) ?? null;

  const wsRef      = useRef<WebSocket | null>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colsRef    = useRef<9 | 18>(cols);
  const dualRef    = useRef(dualModule);
  const mainRef    = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  colsRef.current = cols;
  dualRef.current = dualModule;

  // +8: LifeCanvas has p-2 (8px), so canvas/brackets are 8px inside the wrapper.
  // Re-measure when selectedBiomeName changes (canvas mounts/unmounts) or dualModule changes (width changes).
  const biomeTopPad    = useAlignedTopPad(mainRef, previewRef, topPad,  8, [selectedBiomeName, dualModule]);
  // -2: aligns the inspector's first section header with the canvas bracket top.
  const inspectorTopPad = useAlignedTopPad(mainRef, previewRef, topPad, -2, [selectedBiomeName, dualModule]);

  // ── WS helpers ────────────────────────────────────────────────────────

  function sendWs(msg: object) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  const debouncedBiomeSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      sendWs({ type: 'biome-preset-save', presets: deckStore.getState().biomePresets });
    }, 800);
  }, []);

  lifeTriggerSave = debouncedBiomeSave;

  const sendPreviewFrame = useCallback((snapshot: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'preview',
      frame: snapshot,
      mode: 'bw',
      width: colsRef.current,
      target: dualRef.current ? 'both' : 'left',
    }));
  }, []);

  // ── WS lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    const managed = createReconnectingSocket({
      url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      onSocket: (ws) => { wsRef.current = ws; },
      onOpen: (ws) => {
        ws.send(JSON.stringify({ type: 'life-mode-stop' }));
        ws.send(JSON.stringify({ type: 'biome-presets-get' }));
      },
      onMessage: (e) => {
        try {
          const msg = JSON.parse((e as MessageEvent<string>).data) as { type: string; presets?: BiomePreset[] };
          if (msg.type === 'biome-presets') {
            const presets = msg.presets ?? [];
            deckStore.getState().loadBiomes(presets);
            if (!deckStore.getState().selectedBiomeName && presets.length > 0) {
              deckStore.getState().selectBiome(presets[0]!.name);
            }
          }
        } catch { /* ignore */ }
      },
    });

    return () => {
      managed.dispose((ws) => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
          ws.send(JSON.stringify({ type: 'biome-preset-save', presets: deckStore.getState().biomePresets }));
        }
        ws.send(JSON.stringify({ type: 'preview-stop' }));
      });
      // Cancel a dangling save-debounce if we unmount during a reconnect gap
      // (beforeClose, which flushes it, only runs on an OPEN socket).
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      wsRef.current = null;
      deckStore.getState().setLifePlaying(false);
    };
  }, []);

  // ── Stop hardware preview when paused ────────────────────────────────

  useEffect(() => {
    if (!lifeIsPlaying) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'preview-stop' }));
    }
  }, [lifeIsPlaying]);

  // ── Biome list handlers ───────────────────────────────────────────────

  function handleSelect(name: string) {
    deckStore.getState().selectBiome(name);
    deckStore.getState().setLifePlaying(false);
  }

  function handleCreate() {
    const preset = makeBiome();
    deckStore.getState().createBiome(preset);
    deckStore.getState().selectBiome(preset.name);
    deckStore.getState().setLifePlaying(false);
    debouncedBiomeSave();
  }

  function handleInsert(afterIdx: number) {
    const preset = makeBiome();
    deckStore.getState().insertBiome(preset, afterIdx);
    deckStore.getState().selectBiome(preset.name);
    deckStore.getState().setLifePlaying(false);
    debouncedBiomeSave();
  }

  function handleMove(fromIdx: number, toIdx: number) {
    deckStore.getState().moveBiome(fromIdx, toIdx);
    debouncedBiomeSave();
  }

  function handleDelete(name: string) {
    deckStore.getState().deleteBiome(name);
    debouncedBiomeSave();
  }

  function handleDuplicate(name: string) {
    const store = deckStore.getState();
    const idx = store.biomePresets.findIndex(b => b.name === name);
    if (idx === -1) return;
    const copy: BiomePreset = { ...store.biomePresets[idx]!, name: `${store.biomePresets[idx]!.name}-${Date.now().toString(36)}` };
    store.insertBiome(copy, idx);
    store.selectBiome(copy.name);
    debouncedBiomeSave();
  }

  function handleRename(oldName: string, newName: string) {
    deckStore.getState().renameBiome(oldName, newName);
    debouncedBiomeSave();
  }

  // ── Inspector handlers ────────────────────────────────────────────────

  function handleBiomeChange(updated: BiomePreset) {
    deckStore.getState().updateBiome(updated.name, updated);
    debouncedBiomeSave();
  }

  function handleRandomize(density: number) {
    if (!selectedBiome) return;
    const g = makeRandomGrid(cols, density);
    const snapshot = encodeGrid(g);
    deckStore.getState().updateBiome(selectedBiome.name, { gridSnapshot: snapshot });
    deckStore.getState().restartLife();
    debouncedBiomeSave();
  }

  // ── Import from design ────────────────────────────────────────────────

  function handleImportDesign(_name: string, firstFrame: string, width: 9 | 18) {
    if (!selectedBiome) return;
    const snapshot = fitAssetFrame(firstFrame, width, cols);
    deckStore.getState().updateBiome(selectedBiome.name, { gridSnapshot: snapshot });
    deckStore.getState().restartLife();
    debouncedBiomeSave();
  }

  // ── File import ───────────────────────────────────────────────────────

  function handleImportFileClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {};
    reader.onload = evt => {
      try {
        const proj = JSON.parse(evt.target?.result as string) as DmxProject;
        if (!Array.isArray(proj?.frames) || (proj.width !== 9 && proj.width !== 18)) return;
        const frames = proj.frames.map(f => f.pixels);
        const width = proj.width;
        if (frames.length === 0) return;
        if (frames.length === 1) {
          handleImportDesign('', frames[0]!, width);
        } else {
          const name = file.name.replace(/\.dmx\.json$|\.json$/i, '');
          setImportEntries([{ name, frames, width }]);
          setDesignPickerOpen(true);
        }
      } catch { /* invalid file */ }
    };
    reader.readAsText(file);
  }

  // ── Canvas handlers ───────────────────────────────────────────────────

  function handleGridChange(snapshot: string) {
    if (!selectedBiome) return;
    deckStore.getState().updateBiome(selectedBiome.name, { gridSnapshot: snapshot });
    debouncedBiomeSave();
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <ThreePanelLayout
        gap="1rem"
        leftLabel="Biome list"
        leftStyle={{ paddingTop: topPad, paddingBottom: bottomPad }}
        rightLabel="Life inspector"
        rightStyle={{ paddingTop: topPad, paddingBottom: bottomPad }}
        centerClassName="overflow-hidden flex items-center justify-center"
        centerRef={mainRef}
        left={
          <MatrixItemColumn<BiomePreset>
            items={biomePresets}
            getKey={b => b.name}
            getPixels={b => b.gridSnapshot ?? btoa(String.fromCharCode(...new Uint8Array(9 * ROWS)))}
            getWidth={b => {
              const snap = b.gridSnapshot;
              if (!snap) return 9;
              try { return atob(snap).length === 18 * ROWS ? 18 : 9; } catch { return 9; }
            }}
            getName={b => b.name}
            getAriaLabel={(b) => b.name}
            isSelected={b => b.name === selectedBiomeName}
            onSelect={(b) => handleSelect(b.name)}
            onAdd={handleCreate}
            onInsert={handleInsert}
            insertLabel={idx => `Insert biome after ${idx + 1}`}
            onDelete={(b) => handleDelete(b.name)}
            onDuplicate={(b) => handleDuplicate(b.name)}
            onRename={(b, newName) => handleRename(b.name, newName)}
            onMove={handleMove}
            addLabel="Add biome"
            emptyText="no biomes"
            aria-label="Biomes"
            sideAlign="end"
            topPadding={biomeTopPad}
          />
        }
        center={
          selectedBiome ? (
            <div ref={previewRef}>
              <LifeCanvas
                biome={selectedBiome}
                playing={lifeIsPlaying}
                generation={lifeGeneration}
                cols={cols}
                stepForwardCount={lifeStepForwardCount}
                stepBackCount={lifeStepBackCount}
                onGridChange={handleGridChange}
                onTick={sendPreviewFrame}
                onStep={n => deckStore.getState().setLifeStepCount(n)}
                {...(onCursorMove !== undefined ? { onCursorMove } : {})}
              />
            </div>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">select a biome to begin</p>
          )
        }
        right={
          <div className="flex-1 overflow-y-auto flex flex-col" style={{ paddingTop: inspectorTopPad }}>
            {selectedBiome ? (
              <LifeInspector
                biome={selectedBiome}
                onChange={handleBiomeChange}
                onRandomize={handleRandomize}
                onOpenLibrary={() => { setImportEntries(undefined); setDesignPickerOpen(true); }}
                onImportFile={handleImportFileClick}
              />
            ) : (
              <div className="p-4">
                <p className="font-mono text-xs text-muted-foreground">no biome selected</p>
              </div>
            )}
          </div>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.dmx.json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Import .dmx.json file"
        onChange={handleFileChange}
      />
      <LibraryPickerModal
        open={designPickerOpen}
        onOpenChange={open => { setDesignPickerOpen(open); if (!open) setImportEntries(undefined); }}
        onPick={handleImportDesign}
        {...(importEntries !== undefined ? { initialEntries: importEntries } : {})}
      />
    </>
  );
}
