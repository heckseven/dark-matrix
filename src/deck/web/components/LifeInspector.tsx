import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './ui/button.js';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js';
import { Slider } from './ui/slider.js';
import { Tabs } from './ui/tabs.js';
import { Text } from './ui/text.js';
import { Toggle } from './ui/toggle.js';
import { Radio } from './ui/radio.js';
import { Tooltip } from './ui/tooltip.js';
import type { BiomePreset, LifeAlgorithm } from '../types/life-types.js';

const ALGORITHMS: { id: LifeAlgorithm; label: string; notation: string; tag: string }[] = [
  { id: 'conway',   label: "Conway's",  notation: 'B3/S23',          tag: 'classic'     },
  { id: 'highlife', label: 'HighLife',  notation: 'B36/S23',         tag: 'replication' },
  { id: 'daynight', label: 'Day&Night', notation: 'B3678/S34678',    tag: 'symmetry'    },
  { id: 'maze',     label: 'Maze',      notation: 'B3/S12345',       tag: 'labyrinth'   },
  { id: 'coral',    label: 'Coral',     notation: 'B3/S45678',       tag: 'growth'      },
  { id: 'anneal',   label: 'Anneal',    notation: 'B4678/S35678',    tag: 'annealing'   },
  { id: 'morley',   label: 'Morley',    notation: 'B368/S245',       tag: 'spirals'     },
  { id: '2x2',      label: '2×2',       notation: 'B36/S125',        tag: 'tiles'       },
  { id: 'stains',   label: 'Stains',    notation: 'B3678/S235678',   tag: 'staining'    },
  { id: 'diamoeba', label: 'Diamoeba',  notation: 'B35678/S5678',    tag: 'amoeba'      },
];

function SectionHeader({ label, help }: { label: string; help: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <Text as="p" size="xs" variant="muted" className="uppercase tracking-wider">{label}</Text>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Help: ${label}`}>?</Button>
        </PopoverTrigger>
        <PopoverContent side="left" className="max-w-[200px] flex flex-col gap-2">
          {help}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function LifeInspector({ biome, onChange, onRandomize, onOpenLibrary, onImportFile }: {
  biome: BiomePreset;
  onChange(b: BiomePreset): void;
  onRandomize(density: number): void;
  onOpenLibrary?(): void;
  onImportFile?(): void;
}) {
  const [density, setDensity] = useState(35);
  const spawnRate      = biome.spawnRate      ?? 0;
  const spawnMode      = biome.spawnMode      ?? 'scatter';
  const adaptiveSpawn  = biome.adaptiveSpawn  ?? false;
  const adaptiveThresh = biome.adaptiveThreshold ?? 0.1;
  const stasisAction   = biome.stasisAction   ?? 'off';
  const stasisTicks    = biome.stasisTicks    ?? 5;
  const rerunMode      = biome.rerunMode      ?? 'off';
  const rerunAfterMs   = biome.rerunAfterMs   ?? 60000;
  const rerunAfterGens = biome.rerunAfterGenerations ?? 500;
  const invertMode     = biome.invertMode     ?? 'off';
  const invertAt       = biome.invertAt       ?? 0.85;
  const restoreAt      = biome.restoreAt      ?? 0.30;

  return (
    <div className="flex flex-col gap-6 p-4 font-mono text-xs overflow-y-auto h-full">

      {/* Algorithm */}
      <section>
        <SectionHeader label="algorithm" help={<>
          <p>Birth/survival rule for each cell. <strong>B</strong> = neighbour counts that create a new cell. <strong>S</strong> = counts that keep a live cell alive.</p>
          <p>Hover any rule to see its notation.</p>
        </>} />
        <div className="flex flex-col gap-2">
          {ALGORITHMS.map(a => (
            <Tooltip key={a.id} content={`${a.notation} · ${a.tag}`} side="left">
              <label className="flex items-center gap-3 cursor-pointer">
                <Radio
                  name="algorithm"
                  value={a.id}
                  checked={biome.algorithm === a.id}
                  onChange={() => onChange({ ...biome, algorithm: a.id })}
                />
                <span className="font-mono">{a.label}</span>
              </label>
            </Tooltip>
          ))}
        </div>
      </section>

      {/* Parameters */}
      <section>
        <SectionHeader label="parameters" help={<>
          <p><strong>tick speed</strong> — how often the simulation advances. Lower ms = faster.</p>
          <p><strong>spawn rate</strong> — live cells injected every tick, outside the normal rules.</p>
          <p><strong>spawn mode</strong> — scatter: single cells · cluster: 3×3 blocks · edge: full column or row.</p>
          <p><strong>adaptive</strong> — spikes spawn automatically when population drops below the threshold.</p>
        </>} />

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <Text as="span" size="xs">tick speed</Text>
            <Text as="span" size="xs" variant="muted">{biome.tickMs}ms</Text>
          </div>
          <Slider
            aria-label="Tick speed in milliseconds"
            value={biome.tickMs}
            min={16}
            max={1000}
            step={1}
            onChange={e => onChange({ ...biome, tickMs: Number(e.target.value) })}
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <Text as="span" size="xs">spawn rate</Text>
            <Text as="span" size="xs" variant="muted">{spawnRate === 0 ? 'off' : `${spawnRate}/tick`}</Text>
          </div>
          <Slider
            aria-label="Spawn rate — random cells injected per tick"
            value={spawnRate}
            min={0}
            max={20}
            step={1}
            onChange={e => onChange({ ...biome, spawnRate: Number(e.target.value) })}
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <Text as="span" size="xs">spawn mode</Text>
          </div>
          <Tabs
            aria-label="Spawn mode"
            options={[
              { value: 'scatter', label: 'scatter' },
              { value: 'cluster', label: 'cluster' },
              { value: 'edge',    label: 'edge'    },
            ]}
            value={spawnMode}
            onChange={v => onChange({ ...biome, spawnMode: v as 'scatter' | 'cluster' | 'edge' })}
          />
        </div>

        <div className="mb-2 flex items-center gap-3">
          <Toggle
            pressed={adaptiveSpawn}
            onPressedChange={pressed => onChange({ ...biome, adaptiveSpawn: pressed })}
            className="font-mono text-xs"
          >
            adaptive
          </Toggle>
          {adaptiveSpawn && (
            <Text as="span" size="xs" variant="muted">boost at &lt;{Math.round(adaptiveThresh * 100)}%</Text>
          )}
        </div>

        {adaptiveSpawn && (
          <div className="mb-4">
            <Slider
              aria-label="Adaptive spawn threshold percentage"
              value={Math.round(adaptiveThresh * 100)}
              min={2}
              max={30}
              step={1}
              onChange={e => onChange({ ...biome, adaptiveThreshold: Number(e.target.value) / 100 })}
            />
          </div>
        )}
      </section>

      {/* Stability */}
      <section>
        <SectionHeader label="stability" help={<>
          <p>Detects when the simulation gets stuck: dead grid, still-life (grid unchanged), or period-2 oscillator (same as 2 ticks ago).</p>
          <p><strong>inject</strong> — fires a burst of new cells after the set number of consecutive stasis ticks.</p>
          <p><strong>restart</strong> — resets the grid from the saved snapshot after the set number of stasis ticks.</p>
        </>} />

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <Text as="span" size="xs">stasis</Text>
          </div>
          <Tabs
            aria-label="Stasis action"
            options={[
              { value: 'off',     label: 'off'     },
              { value: 'inject',  label: 'inject'  },
              { value: 'restart', label: 'restart' },
            ]}
            value={stasisAction}
            onChange={v => onChange({ ...biome, stasisAction: v as 'off' | 'inject' | 'restart' })}
          />
        </div>

        {(stasisAction === 'inject' || stasisAction === 'restart') && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <Text as="span" size="xs">after</Text>
              <Text as="span" size="xs" variant="muted">{stasisTicks} ticks</Text>
            </div>
            <Slider
              aria-label="Stasis detection window in ticks"
              value={stasisTicks}
              min={1}
              max={60}
              step={1}
              onChange={e => onChange({ ...biome, stasisTicks: Number(e.target.value) })}
            />
          </div>
        )}
      </section>

      {/* Rerun */}
      <section>
        <SectionHeader label="rerun" help={<>
          <p>Automatically restart the simulation after a condition is met.</p>
          <p><strong>time</strong> — restart after the set number of seconds.</p>
          <p><strong>generations</strong> — restart after the set number of ticks.</p>
          <p>Restarts from the saved snapshot, or a fresh random grid if none is saved.</p>
        </>} />

        <div className="mb-4">
          <Tabs
            aria-label="Rerun mode"
            options={[
              { value: 'off',         label: 'off'   },
              { value: 'time',        label: 'time'  },
              { value: 'generations', label: 'gens'  },
            ]}
            value={rerunMode}
            onChange={v => onChange({ ...biome, rerunMode: v as 'off' | 'time' | 'generations' })}
          />
        </div>

        {rerunMode === 'time' && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="rerun-interval-time">
                <Text as="span" size="xs">after</Text>
              </label>
              <Text as="span" size="xs" variant="muted">
                {rerunAfterMs < 60000 ? `${Math.round(rerunAfterMs / 1000)}s` : `${Math.round(rerunAfterMs / 60000)}m`}
              </Text>
            </div>
            <Slider
              id="rerun-interval-time"
              value={Math.round(rerunAfterMs / 1000)}
              min={5}
              max={3600}
              step={5}
              onChange={e => onChange({ ...biome, rerunAfterMs: Number(e.target.value) * 1000 })}
            />
          </div>
        )}

        {rerunMode === 'generations' && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="rerun-interval-gens">
                <Text as="span" size="xs">after</Text>
              </label>
              <Text as="span" size="xs" variant="muted">{rerunAfterGens} gens</Text>
            </div>
            <Slider
              id="rerun-interval-gens"
              value={rerunAfterGens}
              min={50}
              max={10000}
              step={50}
              onChange={e => onChange({ ...biome, rerunAfterGenerations: Number(e.target.value) })}
            />
          </div>
        )}
      </section>

      {/* Inversion */}
      <section>
        <SectionHeader label="inversion" help={<>
          <p>Runs the simulation on the complement of the grid — lit cells become dead, dark cells become alive — then flips the result back.</p>
          <p><strong>invert at</strong> — enters inverted phase when population exceeds this %.</p>
          <p><strong>restore at</strong> — returns to normal when population drops back below this %.</p>
          <p>Good for algorithms that fill and die (Maze, Coral, Day&Night).</p>
        </>} />

        <div className="mb-4">
          <Tabs
            aria-label="Inversion mode"
            options={[
              { value: 'off',       label: 'off'       },
              { value: 'threshold', label: 'threshold' },
            ]}
            value={invertMode}
            onChange={v => onChange({ ...biome, invertMode: v as 'off' | 'threshold' })}
          />
        </div>

        {invertMode === 'threshold' && (<>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <Text as="span" size="xs">invert at</Text>
              <Text as="span" size="xs" variant="muted">{Math.round(invertAt * 100)}%</Text>
            </div>
            <Slider
              aria-label="Population threshold to enter inverted phase"
              value={Math.round(invertAt * 100)}
              min={30}
              max={99}
              step={1}
              onChange={e => onChange({ ...biome, invertAt: Number(e.target.value) / 100 })}
            />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <Text as="span" size="xs">restore at</Text>
              <Text as="span" size="xs" variant="muted">{Math.round(restoreAt * 100)}%</Text>
            </div>
            <Slider
              aria-label="Population threshold to exit inverted phase"
              value={Math.round(restoreAt * 100)}
              min={1}
              max={60}
              step={1}
              onChange={e => onChange({ ...biome, restoreAt: Number(e.target.value) / 100 })}
            />
          </div>
        </>)}
      </section>

      {/* Generate */}
      <section>
        <SectionHeader label="generate" help={<>
          <p><strong>density</strong> — percentage of cells that start alive when randomizing.</p>
          <p><strong>randomize</strong> — seeds the grid fresh. Takes effect immediately.</p>
        </>} />

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <Text as="span" size="xs">density</Text>
            <Text as="span" size="xs" variant="muted">{density}%</Text>
          </div>
          <Slider
            aria-label="Initial cell density percentage"
            value={density}
            min={10}
            max={90}
            step={5}
            onChange={e => setDensity(Number(e.target.value))}
          />
        </div>

        <Button
          variant="ghost"
          className="w-full font-mono text-xs"
          onClick={() => onRandomize(density / 100)}
        >
          randomize
        </Button>
      </section>

      {/* Load design */}
      {(onOpenLibrary ?? onImportFile) && (
        <section>
          <SectionHeader label="load design" help={<>
            <p><strong>open</strong> — pick a frame from the asset library to use as the starting grid.</p>
            <p><strong>import</strong> — load a .dmx.json file from disk.</p>
          </>} />
          <div className="flex flex-col gap-2">
            {onOpenLibrary && (
              <Button
                variant="ghost"
                className="flex-1 font-mono text-xs"
                tooltip="Seed from a saved library design"
                onClick={onOpenLibrary}
              >
                open
              </Button>
            )}
            {onImportFile && (
              <Button
                variant="ghost"
                className="flex-1 font-mono text-xs"
                tooltip="Import a .dmx.json file from disk"
                onClick={onImportFile}
              >
                import
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
