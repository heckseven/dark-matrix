import { useState, useEffect, useRef, useId, useCallback, useReducer } from 'react';
import type { ReactNode } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { MatrixItem, CornerBrackets } from './MatrixItem.js';
import { Tabs } from './ui/tabs.js';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from './ui/dialog.js';
import { AssetImportPanel } from './AssetImportPanel.js';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import { DATA_STYLES, createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataStyle, DataMetric, DataRenderer } from '../../../animations/data-renderers.js';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle, RenderCtx } from '../../../animations/audio-renderers.js';
import { createHeatmapState, bumpTool, tickHeatmap, renderHeatmap } from '../../../animations/heatmap.js';
import { CLAUDE_STYLES, createClaudeMatrixRenderer, createClaudeContextRenderer } from '../../../animations/claude-renderers.js';
import type { ClaudeStyle } from '../../../animations/claude-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import type { BiomePreset } from '../types/life-types.js';
import { LIFE_ALGORITHMS } from '../../../animations/gol.js';
import { stepGrid, decodeGrid, encodeGrid } from './LifeCanvas.js';
import { Slider } from './ui/slider.js';
import { Text } from './ui/text.js';
import { deckStore, useDeckStore } from '../store.js';

const COLS = 9;
const ROWS = 34;
const EMPTY_PIXELS = btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));

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

// ── pixel helpers ─────────────────────────────────────────────────────────

const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;

function bwToB64(frame: Uint8Array): string {
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

function bayerToB64(frame: Uint8Array): string {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
      out[col * ROWS + row] = (frame[col * ROWS + row] ?? 0) > threshold ? 255 : 0;
    }
  }
  return btoa(String.fromCharCode(...out));
}

// ── helpers ───────────────────────────────────────────────────────────────

function categoryOfWidget(w: HudWidget): string {
  if (w.widget === 'clock')   return 'time';
  if (w.widget === 'heatmap') return 'ai';
  if (w.widget === 'claude')  return 'ai';
  if (w.widget === 'audio')   return 'audio';
  if (w.widget === 'image')   return 'image';
  if (w.widget === 'life')    return 'life';
  return 'data';
}

function widgetHasSettings(w: HudWidget): boolean {
  if (w.widget === 'data') return w.style === 'line' || w.style === 'fill' || w.style === undefined;
  if (w.widget === 'life') return w.biomeName === 'random';
  return false;
}

// ── corner brackets ───────────────────────────────────────────────────────

// ── Layer 1: Category select ──────────────────────────────────────────────

const CATEGORIES = [
  { id: 'audio', label: 'audio' },
  { id: 'time',  label: 'time'  },
  { id: 'data',  label: 'data'  },
  { id: 'image', label: 'image' },
  { id: 'ai',    label: 'ai'    },
  { id: 'life',  label: 'life'  },
] as const;

// ── Layer 2: Clock grid ───────────────────────────────────────────────────

const _clockRenderers: Partial<Record<ClockFace, ClockRenderer>> = {};
if (import.meta.hot) {
  import.meta.hot.dispose(() => { for (const k in _clockRenderers) delete _clockRenderers[k as ClockFace]; });
}

function renderClock(face: ClockFace, now: Date): string {
  if (!_clockRenderers[face]) _clockRenderers[face] = createClockRenderer(face);
  return bwToB64(_clockRenderers[face]!({ now, side: 'left' }));
}

function ClockGrid({ currentWidget, onPick }: {
  currentWidget: HudWidget | null;
  onPick: (w: HudWidget) => void;
}) {
  const [pixels, setPixels] = useState<Partial<Record<ClockFace, string>>>(() => {
    const now = new Date();
    return Object.fromEntries(CLOCK_FACES.map(({ id }) => [id, renderClock(id, now)]));
  });

  useEffect(() => {
    const iid = setInterval(() => {
      const now = new Date();
      setPixels(Object.fromEntries(CLOCK_FACES.map(({ id }) => [id, renderClock(id, now)])));
    }, 100);
    return () => clearInterval(iid);
  }, []);

  return (
    <div role="group" aria-label="Clock panels" className="flex flex-wrap gap-6">
      {CLOCK_FACES.map(({ id, label }) => (
        <MatrixItem
          key={id}
          name={label}
          aria-label={label}
          width={9}
          pixels={pixels[id] ?? EMPTY_PIXELS}
          isSelected={currentWidget?.widget === 'clock' && (currentWidget.face ?? 'elegant') === id}
          onSelect={() => onPick({ widget: 'clock', face: id })}
        />
      ))}
    </div>
  );
}

// ── Layer 2: Data grid ────────────────────────────────────────────────────

const DATA_PRESETS: { id: string; label: string; style: DataStyle; widget: HudWidget }[] = [
  { id: 'system',      label: 'system',    style: 'line',   widget: { widget: 'data', style: 'line',   top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' } },
  { id: 'fill-system', label: 'fill',      style: 'fill',   widget: { widget: 'data', style: 'fill',   top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' } },
  { id: 'cpu-scroll',  label: 'scroll',    style: 'scroll', widget: { widget: 'data', style: 'scroll' } },
  { id: 'cpu-cores',   label: 'cpu cores', style: 'cores',  widget: { widget: 'data', style: 'cores'  } },
];

function initDataRenderers(): Record<DataStyle, DataRenderer> {
  const make = (style: DataStyle): DataRenderer => {
    const r = createDataRenderer({ style });
    if (style === 'cores') {
      r.update({ cpuPct: 45, ramPct: 70, netRxBps: 1_000_000, netTxBps: 500_000,
        cpuCores: [80, 45, 30, 60, 70, 20, 50, 40] });
    } else if (style === 'scroll') {
      for (let i = 16; i >= 0; i--) {
        const b = i * 0.4;
        r.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, cpuCores: [
          Math.round(50 + 40 * Math.sin(b)),       Math.round(50 + 40 * Math.sin(b + 1.5)),
          Math.round(50 + 40 * Math.sin(b + 3)),   Math.round(50 + 40 * Math.sin(b + 4.5)),
          Math.round(50 + 40 * Math.sin(b + 0.7)), Math.round(50 + 40 * Math.sin(b + 2.2)),
          Math.round(50 + 40 * Math.sin(b + 3.7)), Math.round(50 + 40 * Math.sin(b + 5.2)),
        ]});
      }
    } else {
      for (let i = 16; i >= 0; i--) {
        r.update({ cpuPct: 35 + 25 * Math.sin(i * 0.4), ramPct: 60 + 15 * Math.sin(i * 0.3 + 1),
          netRxBps: 800_000 + 400_000 * Math.sin(i * 0.5 + 2),
          netTxBps: 300_000 + 200_000 * Math.sin(i * 0.35) });
      }
    }
    return r;
  };
  return { line: make('line'), fill: make('fill'), scroll: make('scroll'), cores: make('cores') };
}

function DataGrid({ currentWidget, onPick, onSettings }: {
  currentWidget: HudWidget | null;
  onPick: (w: HudWidget) => void;
  onSettings: (w: HudWidget) => void;
}) {
  const renderersRef = useRef<Record<DataStyle, DataRenderer> | null>(null);
  if (!renderersRef.current) renderersRef.current = initDataRenderers();

  const [pixels, setPixels] = useState<Record<DataStyle, string>>(() => {
    const r = renderersRef.current!;
    return { line: bwToB64(r.line.render()), fill: bwToB64(r.fill.render()), scroll: bwToB64(r.scroll.render()), cores: bwToB64(r.cores.render()) };
  });
  const frameRef = useRef(0);

  useEffect(() => {
    const iid = setInterval(() => {
      frameRef.current++;
      const f = frameRef.current;
      const r = renderersRef.current!;
      const base = f * 0.04;
      const metrics = {
        cpuPct:   35 + 25 * Math.sin(base),
        ramPct:   60 + 15 * Math.sin(base * 0.75 + 1),
        netRxBps: 800_000 + 400_000 * Math.sin(base * 1.25 + 2),
        netTxBps: 300_000 + 200_000 * Math.sin(base * 0.875),
      };
      r.line.update(metrics);
      r.fill.update(metrics);
      const sb = f * 0.1;
      r.scroll.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, cpuCores: [
        Math.round(50 + 40 * Math.sin(sb)),       Math.round(50 + 40 * Math.sin(sb + 1.5)),
        Math.round(50 + 40 * Math.sin(sb + 3)),   Math.round(50 + 40 * Math.sin(sb + 4.5)),
        Math.round(50 + 40 * Math.sin(sb + 0.7)), Math.round(50 + 40 * Math.sin(sb + 2.2)),
        Math.round(50 + 40 * Math.sin(sb + 3.7)), Math.round(50 + 40 * Math.sin(sb + 5.2)),
      ]});
      r.cores.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, cpuCores: [
        Math.round(50 + 40 * Math.sin(base * 1.1)),       Math.round(30 + 30 * Math.sin(base * 0.9 + 1)),
        Math.round(70 + 25 * Math.sin(base * 1.3 + 2)),   Math.round(45 + 35 * Math.sin(base * 0.7 + 3)),
        Math.round(60 + 30 * Math.sin(base * 1.2)),       Math.round(40 + 40 * Math.sin(base * 0.8 + 1.5)),
        Math.round(55 + 35 * Math.sin(base * 1.4 + 0.5)), Math.round(65 + 25 * Math.sin(base * 1.1 + 2.5)),
      ]});
      setPixels({ line: bwToB64(r.line.render()), fill: bwToB64(r.fill.render()), scroll: bwToB64(r.scroll.render()), cores: bwToB64(r.cores.render()) });
    }, 100);
    return () => clearInterval(iid);
  }, []);

  return (
    <div role="group" aria-label="Data panels" className="flex flex-wrap gap-6">
      {DATA_PRESETS.map(preset => {
        const hasSettings = preset.style === 'line' || preset.style === 'fill';
        return (
          <MatrixItem
            key={preset.id}
            name={preset.label}
            aria-label={preset.label}
            width={9}
            pixels={pixels[preset.style]}
            isSelected={currentWidget?.widget === 'data' && (currentWidget.style ?? 'line') === preset.style}
            onSelect={() => hasSettings ? onSettings(preset.widget) : onPick(preset.widget)}
          />
        );
      })}
    </div>
  );
}

// ── Layer 2: AI grid ──────────────────────────────────────────────────────

const _heatmapGridState = (() => {
  const s = createHeatmapState();
  for (const t of ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Agent', 'Skill', 'ToolSearch', 'TodoWrite', 'Task', 'WebSearch']) {
    bumpTool(s, t);
  }
  return s;
})();

const _claudeMatrixRenderer = createClaudeMatrixRenderer();
const _claudeContextRenderer = (() => {
  const r = createClaudeContextRenderer();
  // seed with fake events so the preview shows a partial fill
  r.onEvent({ type: 'tool_use', tool: 'Read',   sessionId: 'preview', rawByteLen: 1200 });
  r.onEvent({ type: 'tool_use', tool: 'Bash',   sessionId: 'preview', rawByteLen: 800  });
  r.onEvent({ type: 'tool_use', tool: 'Edit',   sessionId: 'preview', rawByteLen: 600  });
  r.onEvent({ type: 'tool_use', tool: 'Grep',   sessionId: 'preview', rawByteLen: 400  });
  r.onEvent({ type: 'tool_use', tool: 'Read',   sessionId: 'preview', rawByteLen: 950  });
  r.onEvent({ type: 'tool_use', tool: 'Write',  sessionId: 'preview', rawByteLen: 700  });
  r.onEvent({ type: 'tool_use', tool: 'Bash',   sessionId: 'preview', rawByteLen: 1100 });
  r.onEvent({ type: 'agent_spawn', sessionId: 'preview', rawByteLen: 300 });
  return r;
})();

// Build a static usage preview frame (~50% fill)
function makeUsagePreviewPixels(): string {
  const frame = new Uint8Array(COLS * ROWS);
  const filledRows = Math.round(0.5 * ROWS);
  for (let col = 0; col < COLS; col++) {
    for (let r = Math.max(0, ROWS - filledRows); r < ROWS; r++) {
      frame[col * ROWS + r] = 255;
    }
  }
  // Dim reset countdown dots in top row (3 of 9 cols)
  for (let col = 0; col < 3; col++) {
    frame[col * ROWS + 0] = 200;
    frame[col * ROWS + 1] = 100;
  }
  return btoa(String.fromCharCode(...frame));
}
const USAGE_PREVIEW_PIXELS = makeUsagePreviewPixels();

if (import.meta.hot) {
  import.meta.hot.dispose(() => { _claudeMatrixRenderer.stop(); _claudeContextRenderer.stop(); });
}

function AiGrid({ currentWidget, onPick }: {
  currentWidget: HudWidget | null;
  onPick: (w: HudWidget) => void;
}) {
  const [heatmapPixels, setHeatmapPixels] = useState(() => {
    const [left] = renderHeatmap(_heatmapGridState);
    return bwToB64(left);
  });
  const [matrixPixels, setMatrixPixels] = useState(() => bayerToB64(_claudeMatrixRenderer.render()));
  const [contextPixels, setContextPixels] = useState(() => bayerToB64(_claudeContextRenderer.render()));

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let tick = 0;
    const iid = setInterval(() => {
      tick++;
      tickHeatmap(_heatmapGridState);
      const [left] = renderHeatmap(_heatmapGridState);
      setHeatmapPixels(bwToB64(left));

      // Fire synthetic matrix events occasionally to show activity
      if (tick % 8 === 0) {
        const tools = ['Read', 'Bash', 'Edit', 'Grep', 'Write'];
        _claudeMatrixRenderer.onEvent({ type: 'tool_use', tool: tools[tick % tools.length]!, sessionId: 'preview' });
      }
      if (tick % 40 === 0) {
        _claudeMatrixRenderer.onEvent({ type: 'agent_spawn', sessionId: 'preview' });
      }
      setMatrixPixels(bayerToB64(_claudeMatrixRenderer.render()));
      setContextPixels(bayerToB64(_claudeContextRenderer.render()));
    }, 100);
    return () => clearInterval(iid);
  }, []);

  const claudeStyle = currentWidget?.widget === 'claude' ? (currentWidget.style ?? 'matrix') : null;

  return (
    <div role="group" aria-label="AI panels" className="flex flex-wrap gap-6">
      <MatrixItem
        name="tool heatmap"
        aria-label="tool heatmap"
        width={9}
        pixels={heatmapPixels}
        isSelected={currentWidget?.widget === 'heatmap'}
        onSelect={() => onPick({ widget: 'heatmap' })}
      />
      {CLAUDE_STYLES.map(({ id, label }) => {
        const preview = id === 'matrix' ? matrixPixels : id === 'context' ? contextPixels : USAGE_PREVIEW_PIXELS;
        return (
          <MatrixItem
            key={id}
            name={label}
            aria-label={label}
            width={9}
            pixels={preview}
            isSelected={claudeStyle === id}
            onSelect={() => onPick({ widget: 'claude', style: id })}
          />
        );
      })}
    </div>
  );
}

// ── shared helper ─────────────────────────────────────────────────────────

function snapWidth(snap: string): 9 | 18 {
  try { return atob(snap).length === 18 * ROWS ? 18 : 9; } catch { return 9; }
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

// ── Layer 2: Audio grid ───────────────────────────────────────────────────

const MOCK_AUDIO_CTX: RenderCtx = { bands: [200, 150, 100, 70, 40, 20, 10, 5, 2], fftSize: 2048, gain: 1.5 };

function initAudioRenderers(): Record<AudioStyle, ReturnType<typeof createAudioRenderer>> {
  return Object.fromEntries(
    AUDIO_STYLES.map(({ id }) => [id, createAudioRenderer(id)])
  ) as Record<AudioStyle, ReturnType<typeof createAudioRenderer>>;
}

function AudioGrid({ currentWidget, audioCtx, side, onPick, onMount, onUnmount }: {
  currentWidget: HudWidget | null;
  audioCtx: RenderCtx;
  side: 'left' | 'right';
  onPick: (w: HudWidget) => void;
  onMount: () => void;
  onUnmount: () => void;
}) {
  const ctxRef = useRef(audioCtx);
  ctxRef.current = audioCtx;
  const sideRef = useRef(side);
  sideRef.current = side;

  const renderersRef = useRef<Record<AudioStyle, ReturnType<typeof createAudioRenderer>> | null>(null);
  if (!renderersRef.current) renderersRef.current = initAudioRenderers();

  function renderAudio(r: Record<AudioStyle, ReturnType<typeof createAudioRenderer>>, c: RenderCtx, s: 'left' | 'right') {
    return Object.fromEntries(AUDIO_STYLES.map(({ id }) => {
      const raw = r[id]!(c);
      return [id, bayerToB64(s === 'right' ? mirrorFrame(raw) : raw)];
    }));
  }

  const [pixels, setPixels] = useState<Partial<Record<AudioStyle, string>>>(() => {
    const r = renderersRef.current!;
    return renderAudio(r, MOCK_AUDIO_CTX, side);
  });

  useEffect(() => {
    onMount();
    return onUnmount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const iid = setInterval(() => {
      const r = renderersRef.current!;
      setPixels(renderAudio(r, ctxRef.current, sideRef.current));
    }, 100);
    return () => clearInterval(iid);
  }, []);

  return (
    <div role="group" aria-label="Audio panels" className="flex flex-wrap gap-6">
      {AUDIO_STYLES.map(({ id, label }) => (
        <MatrixItem
          key={id}
          name={label}
          aria-label={label}
          width={9}
          pixels={pixels[id] ?? EMPTY_PIXELS}
          isSelected={currentWidget?.widget === 'audio' && (currentWidget.style ?? AUDIO_STYLES[0]!.id) === id}
          onSelect={() => onPick({ widget: 'audio', style: id })}
        />
      ))}
    </div>
  );
}

// ── Layer 2: Image grid ───────────────────────────────────────────────────

function ImageGrid({ currentWidget, assets, onPick, onShowImport, onDelete, onEdit, getPresetCount }: {
  currentWidget: HudWidget | null;
  assets: AssetMeta[] | null;
  onPick: (w: HudWidget) => void;
  onShowImport: () => void;
  onDelete: (name: string) => void;
  onEdit: (name: string) => void;
  getPresetCount: (name: string) => number;
}) {
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
              onClick={e => { e.stopPropagation(); onDelete(asset.name); }}
            >×</Button>
          ) : (
            <Dialog>
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
                <DialogTitle className="sr-only">Delete {label}</DialogTitle>
                <DialogDescription>
                  This image is used in {presetCount} preset{presetCount !== 1 ? 's' : ''}.
                </DialogDescription>
                <div className="flex gap-2 justify-end">
                  <DialogClose asChild>
                    <Button variant="ghost" className="font-mono text-xs" aria-label={`Cancel delete ${label}`} autoFocus>cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      variant="destructive"
                      className="font-mono text-xs"
                      aria-label={`Confirm delete ${label}`}
                      onClick={() => onDelete(asset.name)}
                    >delete</Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
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

// ── Layer 3: Data settings ────────────────────────────────────────────────

const DATA_METRICS: { id: DataMetric | 'none'; label: string }[] = [
  { id: 'cpu',    label: 'cpu'    },
  { id: 'ram',    label: 'ram'    },
  { id: 'net_rx', label: 'net rx' },
  { id: 'net_tx', label: 'net tx' },
  { id: 'none',   label: 'none'   },
];
const DATA_METRIC_IDS = new Set<string>(DATA_METRICS.map(m => m.id));

function DataSettings({ widget, uid, onChange }: {
  widget: HudWidget & { widget: 'data' };
  uid: string;
  onChange: (w: HudWidget) => void;
}) {
  return (
    <div role="group" aria-label="Data widget settings" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted-foreground">style</span>
        <Tabs
          options={DATA_STYLES.filter(s => s.id !== 'cores' && s.id !== 'scroll').map(s => ({ value: s.id, label: s.label }))}
          value={widget.style ?? 'line'}
          onChange={(v) => {
            const s = DATA_STYLES.find(d => d.id === v);
            if (s) onChange({ ...widget, widget: 'data', style: s.id });
          }}
          aria-label="Data style"
        />
      </div>

      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs text-muted-foreground">quadrants</span>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: 'top_left',     label: 'top left'  },
              { key: 'top_right',    label: 'top right' },
              { key: 'bottom_left',  label: 'bot left'  },
              { key: 'bottom_right', label: 'bot right' },
            ] as const
          ).map(({ key, label }) => {
            const val: DataMetric | 'none' = widget[key] ?? 'none';
            return (
              <div key={key} className="flex flex-col gap-1">
                <label htmlFor={`${uid}-${key}`} className="font-mono text-xs text-muted-foreground">{label}</label>
                <Select
                  id={`${uid}-${key}`}
                  value={val}
                  options={DATA_METRICS.map(m => ({ value: m.id, label: m.label }))}
                  onValueChange={raw => {
                    if (!DATA_METRIC_IDS.has(raw)) return;
                    const metric = raw as DataMetric | 'none';
                    const next = { ...widget };
                    if (metric !== 'none') next[key] = metric;
                    else delete next[key];
                    onChange(next);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── HudInspector ──────────────────────────────────────────────────────────

export type HudInspectorProps = {
  widget: HudWidget | null;
  side?: 'left' | 'right';
  audioCtx?: RenderCtx;
  onNeedsAudio?: (needs: boolean) => void;
  onClocksVisible?: (visible: boolean) => void;
  onChange: (widget: HudWidget) => void;
  oppositeWidget?: HudWidget;
  onDeleteBiome?: (name: string) => void;
  onEditBiome?: (name: string) => void;
  dualModule?: boolean;
};

type View = 'grid' | 'settings';

export function HudInspector({ widget, side = 'left', audioCtx = MOCK_AUDIO_CTX, onNeedsAudio, onClocksVisible, onChange, oppositeWidget, onDeleteBiome, onEditBiome, dualModule = false }: HudInspectorProps) {
  const uid = useId();

  const [view, setView] = useState<View>(() => {
    if (widget && widgetHasSettings(widget)) return 'settings';
    return 'grid';
  });
  const [activeCategory, setActiveCategory] = useState<string>(() =>
    widget ? categoryOfWidget(widget) : 'time'
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
    if (activeCategory !== 'image') return;
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
  const showImportHeader = showImport && activeCategory === 'image';

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
        {showImportHeader ? 'import image' : (view === 'settings' ? activeCategory : '')}
      </span>
      <div aria-live="polite" aria-atomic="true" className="ml-auto">
        {showImportHeader && importHasFile && (
          <Button variant="default" size="sm" className="font-mono text-xs" aria-label="Save imported asset" onClick={() => importSaveRef.current?.()}>
            import
          </Button>
        )}
        {!showImportHeader && activeCategory === 'image' && assets !== null && assets.length > 0 && (
          <Button variant="ghost" size="sm" className="font-mono text-xs" aria-label="Import image" onClick={() => { setImportHasFile(false); setShowImport(true); }}>
            + import
          </Button>
        )}
      </div>
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {showImportHeader ? 'Import image' : view === 'settings' ? `${activeCategory} settings` : ''}
      </span>
    </div>
  );

  // ── Layer 2
  if (view === 'grid') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {header}
        {showImport && activeCategory === 'image' ? (
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
              {activeCategory === 'time'   && <ClockGrid currentWidget={widget} onPick={handlePick} />}
              {activeCategory === 'data'   && <DataGrid  currentWidget={widget} onPick={handlePick} onSettings={handleSettings} />}
              {activeCategory === 'ai'     && <AiGrid    currentWidget={widget} onPick={handlePick} />}
              {activeCategory === 'audio'  && <AudioGrid currentWidget={widget} audioCtx={audioCtx} side={side} onPick={handlePick} onMount={handleAudioMount} onUnmount={handleAudioUnmount} />}
              {activeCategory === 'life'   && <LifeGrid  currentWidget={widget} onPick={handlePick} onSettings={handleSettings} dualModule={dualModule} {...(onDeleteBiome ? { onDeleteBiome } : {})} {...(onEditBiome ? { onEditBiome } : {})} />}
              {activeCategory === 'image'  && (
                <ImageGrid
                  currentWidget={widget}
                  assets={assets}
                  onPick={handlePick}
                  onShowImport={() => { setImportHasFile(false); setShowImport(true); }}
                  onDelete={handleDeleteAsset}
                  onEdit={handleEditImage}
                  getPresetCount={getPresetCount}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Layer 3 (data settings or life random settings)
  if (widget?.widget === 'life' && widget.biomeName === 'random') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {header}
        <div className="flex-1 overflow-y-auto">
          <div className="py-4 px-2">
            <LifeRandomSettings widget={widget} onChange={onChange} />
          </div>
        </div>
      </div>
    );
  }

  if (widget?.widget !== 'data') return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {header}
      <div className="flex-1 overflow-y-auto">
        <div className="py-4 px-2">
          <DataSettings widget={widget} uid={uid} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}
