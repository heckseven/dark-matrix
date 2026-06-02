import React, { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { Button } from '../components/ui/button.js';
import { Slider } from '../components/ui/slider.js';
import { Text } from '../components/ui/text.js';
import { LIFE_ALGORITHMS } from '../../../animations/gol.js';
import { stepGrid, decodeGrid, encodeGrid } from '../components/LifeCanvas.js';
import type { BiomePreset } from '../types/life-types.js';
import type { HudWidget } from '../types/hud-preset.js';
import { deckStore, useDeckStore } from '../store.js';
import type { BrowserWidgetDescriptor, GridContext } from './types.js';
import { EMPTY_PIXELS } from './utils.js';
import { lifeBase } from '../../../lib/widgets/life.js';
import type { LifeWidget } from '../../../lib/widgets/life.js';

// ── shared helper ─────────────────────────────────────────────────────────

const COLS = 9;
const ROWS = 34;

function snapWidth(snap: string): 9 | 18 {
  try { return atob(snap).length === 18 * ROWS ? 18 : 9; } catch { return 9; }
}

// Extract one 9-col half from a snapshot (handles 9- or 18-col snapshots).
// Returns base64 string.
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

function b64ToUint8(b64: string, expectedBytes: number): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ── Life sim item (runs simulation on hover) ──────────────────────────────

function LifeSimItem({ biome, biomeWidth, isSelected, onSelect, controlsTop }: {
  biome: BiomePreset;
  biomeWidth: 9 | 18;
  isSelected: boolean;
  onSelect: () => void;
  controlsTop?: ReactNode;
}) {
  const [pixels, setPixels] = useState(biome.gridSnapshot ?? EMPTY_PIXELS);
  const gridRef = useRef<Uint8Array | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const biomeRef = useRef(biome);
  biomeRef.current = biome;
  const biomeWidthRef = useRef(biomeWidth);
  biomeWidthRef.current = biomeWidth;

  useEffect(() => {
    if (!timerRef.current) setPixels(biome.gridSnapshot ?? EMPTY_PIXELS);
  }, [biome.gridSnapshot]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startSim() {
    if (timerRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const b = biomeRef.current;
    const snap = b.gridSnapshot ?? EMPTY_PIXELS;
    const w = snapWidth(snap);
    const { birth, survival } = LIFE_ALGORITHMS[b.algorithm];
    gridRef.current = decodeGrid(snap);
    timerRef.current = setInterval(() => {
      if (!gridRef.current) return;
      const next = stepGrid(gridRef.current, w, birth, survival);
      gridRef.current = next;
      setPixels(encodeGrid(next));
    }, b.tickMs);
  }

  function stopSim() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    gridRef.current = null;
    setPixels(biomeRef.current.gridSnapshot ?? EMPTY_PIXELS);
  }

  return (
    <div onMouseEnter={startSim} onMouseLeave={stopSim} onFocus={startSim} onBlur={stopSim}>
      <MatrixItem
        name={biome.name}
        aria-label={isSelected ? `${biome.name} biome, selected` : `${biome.name} biome`}
        width={biomeWidth}
        pixels={pixels}
        isSelected={isSelected}
        onSelect={onSelect}
        controlsTop={controlsTop}
      />
    </div>
  );
}

// ── Random life item (static random preview, cycles on hover) ─────────────

function LifeRandomItem({ biomePresets, isSelected, dualModule = false, onSelect }: {
  biomePresets: BiomePreset[];
  isSelected: boolean;
  dualModule?: boolean;
  onSelect: () => void;
}) {
  const biomesRef = useRef(biomePresets);
  biomesRef.current = biomePresets;
  const dualModuleRef = useRef(dualModule);
  dualModuleRef.current = dualModule;

  function getCandidates(presets: BiomePreset[], dual: boolean): { snap: string; width: 9 | 18 }[] {
    const wideSnaps = presets
      .filter(b => b.gridSnapshot && snapWidth(b.gridSnapshot) === 18)
      .map(b => ({ snap: b.gridSnapshot!, width: 18 as const }));
    if (dual && wideSnaps.length > 0) return wideSnaps;
    return presets
      .filter(b => b.gridSnapshot && snapWidth(b.gridSnapshot) === 9)
      .map(b => ({ snap: b.gridSnapshot!, width: 9 as const }));
  }

  const [display, setDisplay] = useState<{ pixels: string; width: 9 | 18 }>(() => {
    const c = getCandidates(biomePresets, dualModule);
    if (c.length === 0) return { pixels: EMPTY_PIXELS, width: dualModule ? 18 : 9 };
    const pick = c[Math.floor(Math.random() * c.length)]!;
    return { pixels: pick.snap, width: pick.width };
  });

  const cycleIdxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startCycle() {
    if (timerRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = getCandidates(biomesRef.current, dualModuleRef.current);
    if (c.length === 0) return;
    cycleIdxRef.current = Math.floor(Math.random() * c.length);
    timerRef.current = setInterval(() => {
      cycleIdxRef.current = (cycleIdxRef.current + 1) % c.length;
      const pick = c[cycleIdxRef.current]!;
      setDisplay({ pixels: pick.snap, width: pick.width });
    }, 200);
  }

  function stopCycle() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  return (
    <div onMouseEnter={startCycle} onMouseLeave={stopCycle} onFocus={startCycle} onBlur={stopCycle}>
      <MatrixItem
        name="random"
        aria-label={isSelected ? 'random cycling, selected' : 'random cycling'}
        width={display.width}
        pixels={display.pixels}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    </div>
  );
}

// ── Layer 2: Life grid ────────────────────────────────────────────────────

function LifeGrid({ currentWidget, onPick, onSettings, dualModule = false, onDeleteBiome, onEditBiome }: {
  currentWidget: HudWidget | null;
  onPick: (w: HudWidget) => void;
  onSettings: (w: HudWidget) => void;
  dualModule?: boolean;
  onDeleteBiome?: (name: string) => void;
  onEditBiome?: (name: string) => void;
}) {
  const biomePresets = useDeckStore(s => s.biomePresets);
  const randomSelected = currentWidget?.widget === 'life' && currentWidget.biomeName === 'random';

  if (biomePresets.length === 0) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <p className="font-mono text-xs text-muted-foreground">no life presets</p>
        <Button
          variant="primary"
          className="font-mono text-xs"
          aria-label="Create life"
          onClick={() => deckStore.getState().setActiveMode('life')}
        >Create life</Button>
      </div>
    );
  }

  return (
    <div role="group" aria-label="Life panels" className="flex flex-wrap gap-6">
      <LifeRandomItem
        biomePresets={biomePresets}
        isSelected={randomSelected}
        dualModule={dualModule}
        onSelect={() => onSettings({ widget: 'life', biomeName: 'random', randomIntervalMs: 30000 })}
      />
      {biomePresets.map(b => {
        const isSelected = currentWidget?.widget === 'life' && currentWidget.biomeName === b.name;
        const biomeWidth: 9 | 18 = b.gridSnapshot ? snapWidth(b.gridSnapshot) : 9;
        return (
          <LifeSimItem
            key={b.name}
            biome={b}
            biomeWidth={biomeWidth}
            isSelected={isSelected}
            onSelect={() => onPick({ widget: 'life', biomeName: b.name })}
            controlsTop={
              <>
                {onEditBiome && (
                  <Button
                    variant="ghost"
                    aria-label={`Modify ${b.name} simulation`}
                    tooltip={`Modify ${b.name} simulation`}
                    tooltipSide="right"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={e => { e.stopPropagation(); onEditBiome(b.name); }}
                  >↗</Button>
                )}
                {onDeleteBiome && (
                  <Button
                    variant="ghost"
                    aria-label={`Delete ${b.name}`}
                    tooltip={`Delete ${b.name}`}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-foreground/40 hover:text-red-400"
                    onClick={e => { e.stopPropagation(); onDeleteBiome(b.name); }}
                  >×</Button>
                )}
              </>
            }
          />
        );
      })}
    </div>
  );
}

// ── Layer 3: Life random settings ─────────────────────────────────────────

function LifeRandomSettings({ widget, onChange }: {
  widget: HudWidget & { widget: 'life' };
  onChange: (w: HudWidget) => void;
}) {
  const intervalMs = widget.randomIntervalMs ?? 30000;
  const intervalSec = Math.round(intervalMs / 1000);
  const label = intervalSec < 60 ? `${intervalSec}s` : `${Math.round(intervalSec / 60)}m`;
  return (
    <div role="group" aria-label="Life random settings" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="life-random-interval">
            <Text as="span" size="xs">interval</Text>
          </label>
          <Text as="span" size="xs" variant="muted">{label}</Text>
        </div>
        <Slider
          id="life-random-interval"
          value={intervalSec}
          min={5}
          max={3600}
          step={5}
          onChange={e => onChange({ ...widget, randomIntervalMs: Number(e.target.value) * 1000 })}
        />
      </div>
    </div>
  );
}

// ── GridComponent ─────────────────────────────────────────────────────────

const GridComponent: React.FC<GridContext> = (ctx) => (
  <LifeGrid
    currentWidget={ctx.currentWidget}
    onPick={ctx.onPick}
    onSettings={ctx.onSettings}
    dualModule={ctx.dualModule}
    onDeleteBiome={ctx.onDeleteBiome}
    onEditBiome={ctx.onEditBiome}
  />
);

// ── SettingsComponent ─────────────────────────────────────────────────────

const SettingsComponent: React.FC<GridContext> = (ctx) => {
  if (ctx.currentWidget?.widget !== 'life' || ctx.currentWidget.biomeName !== 'random') return null;
  return (
    <LifeRandomSettings
      widget={ctx.currentWidget as LifeWidget & { widget: 'life' }}
      onChange={ctx.onChange}
    />
  );
};

// ── BrowserWidgetDescriptor ───────────────────────────────────────────────

export const lifeDescriptor: BrowserWidgetDescriptor<LifeWidget> = {
  ...lifeBase,
  GridComponent,
  SettingsComponent,

  renderThumbnail(widget, side) {
    if (widget.biomeName === 'random') return EMPTY_PIXELS;
    const b = deckStore.getState().biomePresets.find(b => b.name === widget.biomeName);
    if (!b?.gridSnapshot) return EMPTY_PIXELS;
    return extractLifeHalf(b.gridSnapshot, side);
  },

  renderPreview(widget, side, _now, opts) {
    if (opts?.lifeGrid) {
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < out.length; i++) out[i] = opts.lifeGrid[i]! > 0 ? 255 : 0;
      return out;
    }
    const biomes = deckStore.getState().biomePresets;
    const b = biomes.find(b => b.name === widget.biomeName);
    if (!b?.gridSnapshot) return new Uint8Array(COLS * ROWS);
    const raw = b64ToUint8(extractLifeHalf(b.gridSnapshot, side), COLS * ROWS);
    const out = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < out.length; i++) out[i] = raw[i]! > 0 ? 255 : 0;
    return out;
  },

  serializeConfig(widget, side) {
    return {
      [`${side}Widget`]: 'life',
      [`${side}BiomeName`]: widget.biomeName,
      ...(widget.biomeName === 'random' && widget.randomIntervalMs !== undefined
        ? { [`${side}RandomIntervalMs`]: widget.randomIntervalMs }
        : {}),
    };
  },
};
