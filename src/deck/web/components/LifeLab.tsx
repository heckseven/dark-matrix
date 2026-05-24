import { useState, useEffect, useRef } from 'react';
import { LIFE_ALGORITHMS } from '../../../animations/gol.js';
import type { LifeAlgorithm } from '../../../animations/gol.js';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { Slider } from './ui/slider.js';
import { Tabs } from './ui/tabs.js';
import { Toggle } from './ui/toggle.js';

const COLS = 9;
const ROWS = 34;
const CELL_PX = 5;
const GAP_PX = 1;
const CANVAS_W = COLS * (CELL_PX + GAP_PX) - GAP_PX;
const CANVAS_H = ROWS * (CELL_PX + GAP_PX) - GAP_PX;
const TOTAL_CELLS = COLS * ROWS;

type StasisAction = 'off' | 'reseed' | 'inject';
type SpawnMode = 'scatter' | 'cluster' | 'edge';

type LabConfig = {
  id: string;
  algorithm: LifeAlgorithm;
  tickMs: number;
  density: number;
  stasisAction: StasisAction;
  stasisTicks: number;
  reseedEvery: number;
  spawnRate: number;
  spawnMode: SpawnMode;
  adaptiveSpawn: boolean;
  adaptiveThreshold: number;
  invertMode: 'off' | 'threshold';
  invertAt: number;
  restoreAt: number;
};

const ALGORITHM_LABELS: Record<LifeAlgorithm, string> = {
  conway:   "Conway's",
  highlife: 'HighLife',
  daynight: 'Day&Night',
  maze:     'Maze',
  coral:    'Coral',
  anneal:   'Anneal',
  morley:   'Morley',
  '2x2':   '2×2',
  stains:   'Stains',
  diamoeba: 'Diamoeba',
};

const ALGORITHM_OPTIONS = (Object.keys(LIFE_ALGORITHMS) as LifeAlgorithm[]).map(id => ({
  value: id,
  label: ALGORITHM_LABELS[id],
}));

type AlgoDefaults = Partial<Omit<LabConfig, 'id' | 'algorithm' | 'tickMs' | 'density'>>;

const ALGO_DEFAULTS: Record<LifeAlgorithm, AlgoDefaults> = {
  conway:   { stasisAction: 'inject', stasisTicks: 5,  spawnRate: 2, spawnMode: 'cluster', reseedEvery: 0,   adaptiveSpawn: true,  adaptiveThreshold: 0.05, invertMode: 'off', invertAt: 0.85, restoreAt: 0.30 },
  highlife: { stasisAction: 'inject', stasisTicks: 5,  spawnRate: 2, spawnMode: 'cluster', reseedEvery: 0,   adaptiveSpawn: true,  adaptiveThreshold: 0.05, invertMode: 'off', invertAt: 0.85, restoreAt: 0.30 },
  daynight: { stasisAction: 'inject', stasisTicks: 15, spawnRate: 3, spawnMode: 'cluster', reseedEvery: 0,   adaptiveSpawn: true,  adaptiveThreshold: 0.03, invertMode: 'threshold', invertAt: 0.90, restoreAt: 0.20 },
  maze:     { stasisAction: 'inject', stasisTicks: 3,  spawnRate: 1, spawnMode: 'cluster', reseedEvery: 0,   adaptiveSpawn: false, adaptiveThreshold: 0.10, invertMode: 'threshold', invertAt: 0.85, restoreAt: 0.30 },
  coral:    { stasisAction: 'inject', stasisTicks: 10, spawnRate: 1, spawnMode: 'scatter', reseedEvery: 200, adaptiveSpawn: false, adaptiveThreshold: 0.10, invertMode: 'threshold', invertAt: 0.80, restoreAt: 0.25 },
  anneal:   { stasisAction: 'inject', stasisTicks: 8,  spawnRate: 2, spawnMode: 'scatter', reseedEvery: 0,   adaptiveSpawn: false, adaptiveThreshold: 0.10, invertMode: 'off', invertAt: 0.85, restoreAt: 0.30 },
  morley:   { stasisAction: 'inject', stasisTicks: 5,  spawnRate: 1, spawnMode: 'scatter', reseedEvery: 0,   adaptiveSpawn: false, adaptiveThreshold: 0.10, invertMode: 'off', invertAt: 0.85, restoreAt: 0.30 },
  '2x2':   { stasisAction: 'inject', stasisTicks: 8,  spawnRate: 1, spawnMode: 'scatter', reseedEvery: 0,   adaptiveSpawn: false, adaptiveThreshold: 0.10, invertMode: 'off', invertAt: 0.85, restoreAt: 0.30 },
  stains:   { stasisAction: 'inject', stasisTicks: 8,  spawnRate: 1, spawnMode: 'cluster', reseedEvery: 0,   adaptiveSpawn: false, adaptiveThreshold: 0.10, invertMode: 'off', invertAt: 0.85, restoreAt: 0.30 },
  diamoeba: { stasisAction: 'inject', stasisTicks: 3,  spawnRate: 1, spawnMode: 'cluster', reseedEvery: 0,   adaptiveSpawn: true,  adaptiveThreshold: 0.05, invertMode: 'off', invertAt: 0.85, restoreAt: 0.30 },
};

const STASIS_OPTIONS = [
  { value: 'off',    label: 'off'    },
  { value: 'reseed', label: 'reseed' },
  { value: 'inject', label: 'inject' },
];

const SPAWN_MODE_OPTIONS = [
  { value: 'scatter', label: 'scatter' },
  { value: 'cluster', label: 'cluster' },
  { value: 'edge',    label: 'edge'    },
];

const INVERT_OPTIONS = [
  { value: 'off',       label: 'off'       },
  { value: 'threshold', label: 'threshold' },
];

// ── grid helpers ──────────────────────────────────────────────────────────────

function makeGrid(density: number): Uint8Array {
  const g = new Uint8Array(TOTAL_CELLS);
  for (let i = 0; i < g.length; i++) g[i] = Math.random() < density ? 1 : 0;
  return g;
}

function stepGrid(grid: Uint8Array, birth: readonly number[], survival: readonly number[]): Uint8Array {
  const next = new Uint8Array(TOTAL_CELLS);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      let n = 0;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (dc === 0 && dr === 0) continue;
          n += grid[((col + dc + COLS) % COLS) * ROWS + ((row + dr + ROWS) % ROWS)] ?? 0;
        }
      }
      const alive = (grid[col * ROWS + row] ?? 0) === 1;
      next[col * ROWS + row] = (alive ? survival.includes(n) : birth.includes(n)) ? 1 : 0;
    }
  }
  return next;
}

function countPop(grid: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i]!;
  return n;
}

function gridsEqual(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function applySpawn(grid: Uint8Array, rate: number, mode: SpawnMode): Uint8Array {
  if (rate === 0) return grid;
  const g = new Uint8Array(grid);
  if (mode === 'scatter') {
    for (let i = 0; i < rate; i++) g[Math.floor(Math.random() * TOTAL_CELLS)] = 1;
  } else if (mode === 'cluster') {
    const clusters = Math.max(1, Math.ceil(rate / 5));
    for (let i = 0; i < clusters; i++) {
      const col = Math.floor(Math.random() * COLS);
      const row = Math.floor(Math.random() * ROWS);
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          g[((col + dc + COLS) % COLS) * ROWS + ((row + dr + ROWS) % ROWS)] = 1;
        }
      }
    }
  } else {
    // edge: seed a random full column or row
    for (let i = 0; i < rate; i++) {
      if (Math.random() < 0.5) {
        const col = Math.floor(Math.random() * COLS);
        for (let row = 0; row < ROWS; row++) { if (Math.random() < 0.5) g[col * ROWS + row] = 1; }
      } else {
        const row = Math.floor(Math.random() * ROWS);
        for (let col = 0; col < COLS; col++) { if (Math.random() < 0.5) g[col * ROWS + row] = 1; }
      }
    }
  }
  return g;
}

function invertLabGrid(grid: Uint8Array): Uint8Array {
  const g = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) g[i] = grid[i]! > 0 ? 0 : 1;
  return g;
}

function drawGrid(ctx: CanvasRenderingContext2D, grid: Uint8Array) {
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#e0e0e0';
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if ((grid[col * ROWS + row] ?? 0) === 1) {
        ctx.fillRect(col * (CELL_PX + GAP_PX), row * (CELL_PX + GAP_PX), CELL_PX, CELL_PX);
      }
    }
  }
}

function defaultConfig(algorithm: LifeAlgorithm): LabConfig {
  return {
    id: crypto.randomUUID(),
    algorithm,
    tickMs: 120,
    density: 0.35,
    stasisAction: 'off',
    stasisTicks: 5,
    reseedEvery: 0,
    spawnRate: 0,
    spawnMode: 'scatter',
    adaptiveSpawn: false,
    adaptiveThreshold: 0.1,
    invertMode: 'off',
    invertAt: 0.85,
    restoreAt: 0.30,
    ...ALGO_DEFAULTS[algorithm],
  };
}

// ── cell component ────────────────────────────────────────────────────────────

function LabCell({ config, onClone, onRemove, onChange }: {
  config: LabConfig;
  onClone: () => void;
  onRemove: () => void;
  onChange: (c: LabConfig) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const stateRef = useRef({
    grid: makeGrid(config.density),
    prevGrid: null as Uint8Array | null,
    prev2Grid: null as Uint8Array | null,
    stasisCount: 0,
    tickCount: 0,
    phase: 'normal' as 'normal' | 'inverted',
  });

  const [pop, setPop] = useState(0);

  function update(patch: Partial<LabConfig>) { onChange({ ...config, ...patch }); }

  function changeAlgorithm(algorithm: LifeAlgorithm) {
    const s = stateRef.current;
    s.grid = makeGrid(configRef.current.density);
    s.prevGrid = null;
    s.prev2Grid = null;
    s.stasisCount = 0;
    s.tickCount = 0;
    s.phase = 'normal';
    onChange({ ...config, algorithm, ...ALGO_DEFAULTS[algorithm] });
  }

  function reseed() {
    const s = stateRef.current;
    s.grid = makeGrid(configRef.current.density);
    s.prevGrid = null;
    s.prev2Grid = null;
    s.stasisCount = 0;
    s.tickCount = 0;
    s.phase = 'normal';
  }

  // Canvas setup — run once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = Math.round(CANVAS_W * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGrid(ctx, stateRef.current.grid);
    }
  // Canvas setup intentionally runs once; no deps needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick loop — restarts when tickMs or algorithm changes
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d') ?? null;

    const id = setInterval(() => {
      const cfg = configRef.current;
      const s = stateRef.current;
      const { birth, survival } = LIFE_ALGORITHMS[cfg.algorithm];
      let grid = s.grid;

      if (cfg.reseedEvery > 0 && s.tickCount > 0 && s.tickCount % cfg.reseedEvery === 0) {
        grid = makeGrid(cfg.density);
        s.prevGrid = null;
        s.prev2Grid = null;
        s.stasisCount = 0;
        s.phase = 'normal';
      } else {
        const pop = countPop(grid);

        // Phase transitions
        if (cfg.invertMode === 'threshold') {
          const ratio = pop / TOTAL_CELLS;
          if (s.phase === 'normal' && ratio >= cfg.invertAt) {
            s.phase = 'inverted'; s.prevGrid = null; s.prev2Grid = null; s.stasisCount = 0;
          } else if (s.phase === 'inverted' && ratio <= cfg.restoreAt) {
            s.phase = 'normal';   s.prevGrid = null; s.prev2Grid = null; s.stasisCount = 0;
          }
        }

        // Stasis detection on visual state
        const stasis =
          pop === 0 ||
          (s.prevGrid !== null && gridsEqual(grid, s.prevGrid)) ||
          (s.prev2Grid !== null && gridsEqual(grid, s.prev2Grid));

        if (stasis) {
          s.stasisCount++;
          if (cfg.stasisAction !== 'off' && s.stasisCount >= cfg.stasisTicks) {
            if (cfg.stasisAction === 'reseed') {
              grid = makeGrid(cfg.density);
              s.prevGrid = null;
              s.prev2Grid = null;
              s.phase = 'normal';
            } else {
              grid = applySpawn(grid, Math.max(9, cfg.spawnRate * 3), cfg.spawnMode);
            }
            s.stasisCount = 0;
          }
        } else {
          s.stasisCount = 0;
        }

        // Regular spawn with optional population-adaptive boost
        let rate = cfg.spawnRate;
        if (cfg.adaptiveSpawn && pop / TOTAL_CELLS < cfg.adaptiveThreshold) rate = Math.max(rate, 5);
        if (rate > 0) grid = applySpawn(grid, rate, cfg.spawnMode);
      }

      s.prev2Grid = s.prevGrid;
      s.prevGrid = new Uint8Array(grid);

      // Step — complement before/after when inverted
      const next = s.phase === 'inverted'
        ? invertLabGrid(stepGrid(invertLabGrid(grid), birth, survival))
        : stepGrid(grid, birth, survival);

      s.grid = next;
      s.tickCount++;

      setPop(countPop(next));
      if (ctx) drawGrid(ctx, next);
    }, config.tickMs);

    return () => clearInterval(id);
  // All other config fields are read via configRef.current inside the interval; only
  // tickMs and algorithm changes require restarting the interval.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.tickMs, config.algorithm]);

  const popPct = Math.round((pop / TOTAL_CELLS) * 100);

  return (
    <div className="flex flex-col gap-2 p-3 border border-border rounded bg-background" style={{ minWidth: 200 }}>
      <div className="flex items-center gap-1">
        <Select
          aria-label="Algorithm"
          value={config.algorithm}
          options={ALGORITHM_OPTIONS}
          onValueChange={v => changeAlgorithm(v as LifeAlgorithm)}
          className="flex-1"
        />
        <Button variant="ghost" size="sm" aria-label="Clone" tooltip="Clone" onClick={onClone}>⎘</Button>
        <Button variant="destructive" size="sm" aria-label="Remove" tooltip="Remove" onClick={onRemove}>×</Button>
      </div>

      <div className="flex justify-center">
        <canvas ref={canvasRef} role="img" aria-label={`Game of Life simulation — ${config.algorithm}`} className="block rounded-sm" style={{ imageRendering: 'pixelated' }} />
      </div>

      {/* Population bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex-shrink-0">pop</span>
        <div role="progressbar" aria-label="Population" aria-valuenow={popPct} aria-valuemin={0} aria-valuemax={100} className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-foreground/60 rounded-full" style={{ width: `${popPct}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums" style={{ minWidth: 28, textAlign: 'right' }}>{popPct}%</span>
      </div>

      {/* Tick speed */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-xs">tick</span>
          <span className="text-xs text-muted-foreground">{config.tickMs}ms</span>
        </div>
        <Slider aria-label="Tick speed in milliseconds" min={16} max={1000} step={1} value={config.tickMs}
          onChange={e => update({ tickMs: Number(e.target.value) })} />
      </div>

      {/* Density */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-xs">density</span>
          <span className="text-xs text-muted-foreground">{Math.round(config.density * 100)}%</span>
        </div>
        <Slider aria-label="Seed density" min={5} max={95} step={5} value={Math.round(config.density * 100)}
          onChange={e => update({ density: Number(e.target.value) / 100 })} />
      </div>

      <Button variant="ghost" className="w-full font-mono text-xs" onClick={reseed}>reseed</Button>

      {/* ── Stasis ─────────────────────────── */}
      <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">stasis</p>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex-shrink-0">on</span>
        <Tabs
          aria-label="Stasis action"
          options={STASIS_OPTIONS}
          value={config.stasisAction}
          onChange={v => update({ stasisAction: v as StasisAction })}
        />
      </div>

      {config.stasisAction !== 'off' && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs">after</span>
            <span className="text-xs text-muted-foreground">{config.stasisTicks} ticks</span>
          </div>
          <Slider aria-label="Stasis detection window in ticks" min={1} max={30} step={1} value={config.stasisTicks}
            onChange={e => update({ stasisTicks: Number(e.target.value) })} />
        </div>
      )}

      {/* Reseed interval */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-xs">reseed every</span>
          <span className="text-xs text-muted-foreground">{config.reseedEvery === 0 ? 'off' : `${config.reseedEvery} ticks`}</span>
        </div>
        <Slider aria-label="Reseed interval in ticks, 0 = off" min={0} max={500} step={10} value={config.reseedEvery}
          onChange={e => update({ reseedEvery: Number(e.target.value) })} />
      </div>

      {/* ── Spawn ──────────────────────────── */}
      <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">spawn</p>

      <div>
        <div className="flex justify-between mb-1">
          <span className="text-xs">rate</span>
          <span className="text-xs text-muted-foreground">{config.spawnRate === 0 ? 'off' : `${config.spawnRate}/tick`}</span>
        </div>
        <Slider aria-label="Random spawn rate per tick" min={0} max={20} step={1} value={config.spawnRate}
          onChange={e => update({ spawnRate: Number(e.target.value) })} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex-shrink-0">mode</span>
        <Tabs
          aria-label="Spawn mode"
          options={SPAWN_MODE_OPTIONS}
          value={config.spawnMode}
          onChange={v => update({ spawnMode: v as SpawnMode })}
        />
      </div>

      <div className="flex items-center gap-2">
        <Toggle
          pressed={config.adaptiveSpawn}
          onPressedChange={pressed => update({ adaptiveSpawn: pressed })}
          className="font-mono text-xs"
        >
          adaptive
        </Toggle>
        {config.adaptiveSpawn && (
          <span className="text-xs text-muted-foreground">
            at &lt;{Math.round(config.adaptiveThreshold * 100)}%
          </span>
        )}
      </div>

      {config.adaptiveSpawn && (
        <Slider aria-label="Adaptive spawn threshold percentage" min={2} max={30} step={1}
          value={Math.round(config.adaptiveThreshold * 100)}
          onChange={e => update({ adaptiveThreshold: Number(e.target.value) / 100 })} />
      )}

      {/* ── Inversion ──────────────────────── */}
      <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">inversion</p>

      <Tabs
        aria-label="Inversion mode"
        options={INVERT_OPTIONS}
        value={config.invertMode}
        onChange={v => update({ invertMode: v as 'off' | 'threshold' })}
      />

      {config.invertMode === 'threshold' && (<>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs">invert at</span>
            <span className="text-xs text-muted-foreground">{Math.round(config.invertAt * 100)}%</span>
          </div>
          <Slider aria-label="Population threshold to enter inverted phase" min={30} max={99} step={1}
            value={Math.round(config.invertAt * 100)}
            onChange={e => update({ invertAt: Number(e.target.value) / 100 })} />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs">restore at</span>
            <span className="text-xs text-muted-foreground">{Math.round(config.restoreAt * 100)}%</span>
          </div>
          <Slider aria-label="Population threshold to exit inverted phase" min={1} max={60} step={1}
            value={Math.round(config.restoreAt * 100)}
            onChange={e => update({ restoreAt: Number(e.target.value) / 100 })} />
        </div>
      </>)}
    </div>
  );
}

// ── lab root ──────────────────────────────────────────────────────────────────

const INITIAL_ALGORITHMS: LifeAlgorithm[] = ['conway', 'maze', 'coral', 'diamoeba'];

export function LifeLab() {
  const [cells, setCells] = useState<LabConfig[]>(() =>
    INITIAL_ALGORITHMS.map(a => ({ ...defaultConfig(a), id: crypto.randomUUID() }))
  );

  function addCell() {
    setCells(cs => [...cs, { ...defaultConfig('conway'), id: crypto.randomUUID() }]);
  }

  function cloneCell(id: string) {
    setCells(cs => {
      const idx = cs.findIndex(c => c.id === id);
      if (idx === -1) return cs;
      const src = cs[idx]!;
      return [...cs.slice(0, idx + 1), { ...src, id: crypto.randomUUID() }, ...cs.slice(idx + 1)];
    });
  }

  function removeCell(id: string) { setCells(cs => cs.filter(c => c.id !== id)); }

  function updateCell(id: string, updated: LabConfig) {
    setCells(cs => cs.map(c => c.id === id ? updated : c));
  }

  return (
    <div className="p-5">
      <div className="flex items-center gap-4 mb-5">
        <Button variant="default" size="sm" onClick={addCell}>+ add cell</Button>
        <span className="text-xs text-muted-foreground ml-auto">
          defaults applied on algorithm switch · stasis: dead / still-life / period-2
        </span>
      </div>
      <div className="flex flex-wrap gap-3 items-start">
        {cells.map(cell => (
          <LabCell
            key={cell.id}
            config={cell}
            onClone={() => cloneCell(cell.id)}
            onRemove={() => removeCell(cell.id)}
            onChange={updated => updateCell(cell.id, updated)}
          />
        ))}
      </div>
    </div>
  );
}
