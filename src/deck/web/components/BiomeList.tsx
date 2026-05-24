import { Button } from './ui/button.js';
import { MatrixItem } from './MatrixItem.js';
import { MatrixItemList } from './MatrixItemList.js';
import type { BiomePreset } from '../types/life-types.js';
import { ROWS } from '../store.js';

const EMPTY_9 = btoa(String.fromCharCode(...new Uint8Array(9 * ROWS)));

function snapshotPixels(snap: string | undefined): { pixels: string; width: 9 | 18 } {
  if (!snap) return { pixels: EMPTY_9, width: 9 };
  try {
    const bytes = atob(snap).length;
    if (bytes === 18 * ROWS) return { pixels: snap, width: 18 };
    return { pixels: snap, width: 9 };
  } catch {
    return { pixels: EMPTY_9, width: 9 };
  }
}

export function BiomeList({ biomes, activeName, selectedName, onSelect, onActivate, onCreate, onInsert, onDelete, onDuplicate, onRename, onMove }: {
  biomes: BiomePreset[];
  activeName: string | null;
  selectedName: string | null;
  onSelect(name: string): void;
  onActivate(name: string): void;
  onCreate(): void;
  onInsert(afterIdx: number): void;
  onDelete(name: string): void;
  onDuplicate(name: string): void;
  onRename(oldName: string, newName: string): void;
  onMove(fromIdx: number, toIdx: number): void;
}) {
  return (
    <MatrixItemList
      items={biomes}
      getKey={biome => biome.name}
      renderItem={(biome, idx, dragProps) => {
        const { pixels, width } = snapshotPixels(biome.gridSnapshot);
        const isActive   = activeName === biome.name;
        const isSelected = selectedName === biome.name;
        return (
          <MatrixItem
            name={biome.name}
            aria-label={isActive ? `${biome.name} (active)` : biome.name}
            width={width}
            pixels={pixels}
            isActive={isActive}
            isSelected={isSelected}
            onSelect={() => onSelect(biome.name)}
            onRename={newName => onRename(biome.name, newName)}
            dragIdx={dragProps.dragIdx}
            onDragOver={dragProps.onDragOver}
            onDrop={dragProps.onDrop}
            controlsTop={
              <>
                <Button
                  variant="ghost"
                  className="w-8"
                  aria-label="Move biome up"
                  tooltip="Move up"
                  tooltipSide="right"
                  disabled={idx === 0}
                  onClick={e => { e.stopPropagation(); onMove(idx, idx - 1); }}
                >↑</Button>
                <Button
                  variant="ghost"
                  className="w-8"
                  aria-label="Move biome down"
                  tooltip="Move down"
                  tooltipSide="right"
                  disabled={idx === biomes.length - 1}
                  onClick={e => { e.stopPropagation(); onMove(idx, idx + 1); }}
                >↓</Button>
              </>
            }
            controlsBottom={
              <>
                {isActive ? (
                  <Button variant="primary" className="w-8" aria-label="Active biome" tooltip="Active biome" tooltipSide="right" onClick={e => e.stopPropagation()}>∗</Button>
                ) : (
                  <Button variant="ghost" className="w-8" aria-label="Set as active" tooltip="Set as active" tooltipSide="right" onClick={e => { e.stopPropagation(); onActivate(biome.name); }}>•</Button>
                )}
                <Button variant="ghost" className="w-8" aria-label="Clone biome" tooltip="Clone" tooltipSide="right" onClick={e => { e.stopPropagation(); onDuplicate(biome.name); }}>⧉</Button>
                {biomes.length > 1 && (
                  <Button variant="ghost" className="w-8" aria-label="Delete biome" tooltip="Delete" tooltipSide="right" onClick={e => { e.stopPropagation(); onDelete(biome.name); }}>×</Button>
                )}
              </>
            }
          />
        );
      }}
      onMove={onMove}
      onInsert={onInsert}
      insertLabel={idx => `Insert biome after ${idx + 1}`}
      onAdd={onCreate}
      addLabel="Add biome"
      emptyText="no biomes"
      aria-label="Biomes"
    />
  );
}
