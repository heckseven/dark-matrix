import { useState } from 'react';
import { Button } from './ui/button.js';
import { Slider } from './ui/slider.js';
import { Text } from './ui/text.js';
import type { BiomePreset, LifeAlgorithm } from '../types/life-types.js';

const ALGORITHMS: { id: LifeAlgorithm; label: string; notation: string; tag: string }[] = [
  { id: 'conway',   label: "Conway's",  notation: 'B3/S23',        tag: 'classic'     },
  { id: 'highlife', label: 'HighLife',  notation: 'B36/S23',       tag: 'replication' },
  { id: 'daynight', label: 'Day&Night', notation: 'B3678/S34678',  tag: 'symmetry'    },
];

export function LifeInspector({ biome, onChange, onRandomize }: {
  biome: BiomePreset;
  onChange(b: BiomePreset): void;
  onRandomize(density: number): void;
}) {
  const [density, setDensity] = useState(35);

  return (
    <div className="flex flex-col gap-6 p-4 font-mono text-xs overflow-y-auto h-full">

      {/* Algorithm picker */}
      <section>
        <Text as="p" size="xs" variant="muted" className="mb-2 uppercase tracking-wider">algorithm</Text>
        <div className="flex flex-col gap-1">
          {ALGORITHMS.map(a => {
            const selected = biome.algorithm === a.id;
            return (
              <button
                key={a.id}
                onClick={() => onChange({ ...biome, algorithm: a.id })}
                className={`text-left px-3 py-2 rounded transition-colors border ${
                  selected
                    ? 'border-foreground bg-foreground/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground'
                }`}
              >
                <div className="font-mono text-xs">{a.label}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] opacity-60">{a.notation}</span>
                  <span className="text-[10px] opacity-40">·</span>
                  <span className="text-[10px] opacity-50">{a.tag}</span>
                </div>
              </button>
            );
          })}
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
    </div>
  );
}
