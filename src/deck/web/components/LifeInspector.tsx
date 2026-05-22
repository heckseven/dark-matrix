import { useRef, useState } from 'react';
import { Button } from './ui/button.js';
import { Slider } from './ui/slider.js';
import { Text } from './ui/text.js';
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

export function LifeInspector({ biome, onChange, onRandomize, onOpenLibrary, onImportFile }: {
  biome: BiomePreset;
  onChange(b: BiomePreset): void;
  onRandomize(density: number): void;
  onOpenLibrary?(): void;
  onImportFile?(): void;
}) {
  const [density, setDensity] = useState(35);
  const spawnRate = biome.spawnRate ?? 0;

  return (
    <div className="flex flex-col gap-6 p-4 font-mono text-xs overflow-y-auto h-full">

      {/* Algorithm */}
      <section>
        <Text as="p" size="xs" variant="muted" className="mb-3 uppercase tracking-wider">algorithm</Text>
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
        <Text as="p" size="xs" variant="muted" className="mb-3 uppercase tracking-wider">parameters</Text>

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
      </section>

      {/* Generate */}
      <section>
        <Text as="p" size="xs" variant="muted" className="mb-3 uppercase tracking-wider">generate</Text>

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
          <Text as="p" size="xs" variant="muted" className="mb-3 uppercase tracking-wider">load design</Text>
          <div className="flex gap-2">
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
