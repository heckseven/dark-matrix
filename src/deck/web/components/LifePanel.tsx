import { useState, useEffect, useRef, useCallback } from 'react';
import { useDeckStore, deckStore } from '../store.js';
import { BiomeList } from './BiomeList.js';
import { LifeCanvas, encodeGrid, makeRandomGrid } from './LifeCanvas.js';
import { LifeInspector } from './LifeInspector.js';
import { LibraryPickerModal } from './LibraryPickerModal.js';
import type { BiomePreset } from '../types/life-types.js';

const ROWS = 34;

function fitAssetFrame(firstFrame: string, srcWidth: 9 | 18, dstCols: 9 | 18): string {
  let bin: string;
  try { bin = atob(firstFrame); } catch { return btoa(String.fromCharCode(...new Uint8Array(dstCols * ROWS))); }
  const src = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i)!;
  const dst = new Uint8Array(dstCols * ROWS);
  if (srcWidth === dstCols) {
    for (let i = 0; i < src.length; i++) dst[i] = src[i]! > 127 ? 255 : 0;
  } else if (srcWidth === 18 && dstCols === 9) {
    for (let c = 0; c < 9; c++)
      for (let r = 0; r < ROWS; r++)
        dst[c * ROWS + r] = (src[c * ROWS + r] ?? 0) > 127 ? 255 : 0;
  } else {
    // 9 → 18: left half populated, right half zeros
    for (let c = 0; c < 9; c++)
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

export function LifePanel({ topPad = 0, dualModule = false }: { topPad?: number; dualModule?: boolean }) {
  const [designPickerOpen, setDesignPickerOpen] = useState(false);
  const biomePresets       = useDeckStore(s => s.biomePresets);
  const activeBiomeName    = useDeckStore(s => s.activeBiomeName);
  const selectedBiomeName  = useDeckStore(s => s.selectedBiomeName);
  const lifeIsPlaying      = useDeckStore(s => s.lifeIsPlaying);
  const lifeGeneration     = useDeckStore(s => s.lifeGeneration);
  const lifeStepForwardCount = useDeckStore(s => s.lifeStepForwardCount);
  const lifeStepBackCount    = useDeckStore(s => s.lifeStepBackCount);

  const cols: 9 | 18 = dualModule ? 18 : 9;
  const selectedBiome = biomePresets.find(b => b.name === selectedBiomeName) ?? null;

  const wsRef     = useRef<WebSocket | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colsRef   = useRef<9 | 18>(cols);
  const dualRef   = useRef(dualModule);
  colsRef.current = cols;
  dualRef.current = dualModule;

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
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'life-mode-stop' }));
      ws.send(JSON.stringify({ type: 'biome-presets-get' }));
    });

    ws.addEventListener('message', (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; presets?: BiomePreset[]; activeName?: string | null; name?: string };
        if (msg.type === 'biome-presets') {
          deckStore.getState().loadBiomes(msg.presets ?? [], msg.activeName ?? null);
        } else if (msg.type === 'biome-preset-activated') {
          deckStore.getState().setActiveBiome(msg.name ?? null);
        }
      } catch { /* ignore */ }
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
          ws.send(JSON.stringify({ type: 'biome-preset-save', presets: deckStore.getState().biomePresets }));
        }
        ws.send(JSON.stringify({ type: 'preview-stop' }));
      }
      ws.close();
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

  function handleActivate(name: string) {
    deckStore.getState().setActiveBiome(name);
    sendWs({ type: 'biome-preset-activate', name });
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
    const src = store.biomePresets.find(b => b.name === name);
    if (!src) return;
    const copy: BiomePreset = { ...src, name: `${src.name} copy` };
    store.createBiome(copy);
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

  // ── Canvas handlers ───────────────────────────────────────────────────

  function handleGridChange(snapshot: string) {
    if (!selectedBiome) return;
    deckStore.getState().updateBiome(selectedBiome.name, { gridSnapshot: snapshot });
    debouncedBiomeSave();
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,220px) 1fr minmax(0,220px)',
        height: '100%',
        width: '100%',
      }}
    >
      {/* Left: biome list */}
      <aside aria-label="Biome list" style={{ overflow: 'hidden', paddingTop: topPad }}>
        <BiomeList
          biomes={biomePresets}
          activeName={activeBiomeName}
          selectedName={selectedBiomeName}
          onSelect={handleSelect}
          onActivate={handleActivate}
          onCreate={handleCreate}
          onInsert={handleInsert}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onRename={handleRename}
          onMove={handleMove}
        />
      </aside>

      {/* Center: simulation canvas */}
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {selectedBiome ? (
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
          />
        ) : (
          <p className="font-mono text-xs text-muted-foreground">select a biome to begin</p>
        )}
      </main>

      {/* Right: inspector */}
      <aside aria-label="Life inspector" style={{ overflow: 'hidden', paddingTop: topPad }}>
        {selectedBiome ? (
          <LifeInspector
            biome={selectedBiome}
            onChange={handleBiomeChange}
            onRandomize={handleRandomize}
            onFromDesign={() => setDesignPickerOpen(true)}
          />
        ) : (
          <div className="p-4">
            <p className="font-mono text-xs text-muted-foreground">no biome selected</p>
          </div>
        )}
      </aside>

      <LibraryPickerModal
        open={designPickerOpen}
        onOpenChange={setDesignPickerOpen}
        onPick={handleImportDesign}
      />
    </div>
  );
}
