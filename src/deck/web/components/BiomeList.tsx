import { useState, useRef } from 'react';
import { Button } from './ui/button.js';
import type { BiomePreset, LifeAlgorithm } from '../types/life-types.js';

const ALGO_BADGE: Record<LifeAlgorithm, string> = {
  conway:   'B3/S23',
  highlife: 'B36/S23',
  daynight: 'B3678/S34678',
};

function CornerBrackets({ active }: { active: boolean }) {
  const c = { position: 'absolute' as const, width: 16, height: 16, pointerEvents: 'none' as const };
  const b = `1px solid ${active ? 'white' : 'rgba(255,255,255,0.35)'}`;
  return (
    <div aria-hidden="true" className={`absolute inset-0 pointer-events-none transition-opacity ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}>
      <span style={{ ...c, top: 0,    left: 0,    borderTop: b, borderLeft: b }} />
      <span style={{ ...c, top: 0,    right: 0,   borderTop: b, borderRight: b }} />
      <span style={{ ...c, bottom: 0, left: 0,    borderBottom: b, borderLeft: b }} />
      <span style={{ ...c, bottom: 0, right: 0,   borderBottom: b, borderRight: b }} />
    </div>
  );
}

function BiomeCard({ biome, isActive, isSelected, onSelect, onActivate, onDelete, onDuplicate, onRename }: {
  biome: BiomePreset;
  isActive: boolean;
  isSelected: boolean;
  onSelect(): void;
  onActivate(): void;
  onDelete(): void;
  onDuplicate(): void;
  onRename(name: string): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commitRename() {
    const next = draft.trim() || biome.name;
    setDraft(next);
    setEditing(false);
    if (next !== biome.name) onRename(next);
  }

  return (
    <li
      className="relative group cursor-pointer px-3 py-2"
      onClick={onSelect}
      aria-selected={isSelected}
    >
      <CornerBrackets active={isSelected || isActive} />

      {/* name */}
      <div className="flex items-center gap-1 mb-1">
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            className="font-mono text-xs bg-transparent border-b border-white text-foreground outline-none w-full"
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setDraft(biome.name); setEditing(false); }
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="font-mono text-xs text-foreground truncate flex-1"
            onDoubleClick={e => { e.stopPropagation(); setDraft(biome.name); setEditing(true); }}
          >
            {biome.name}
          </span>
        )}
      </div>

      {/* algorithm badge */}
      <span className="font-mono text-[10px] text-muted-foreground">
        {ALGO_BADGE[biome.algorithm]}
      </span>

      {/* action buttons */}
      <div className="absolute right-1 top-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={isActive ? 'Active biome' : 'Set as active biome'}
          tooltip={isActive ? 'active' : 'set active'}
          onClick={onActivate}
        >
          {isActive ? '∗' : '•'}
        </Button>
        <Button variant="ghost" size="sm" aria-label="Duplicate biome" tooltip="duplicate" onClick={onDuplicate}>
          ⧉
        </Button>
        <Button variant="ghost" size="sm" aria-label="Delete biome" tooltip="delete" onClick={onDelete}>
          ×
        </Button>
      </div>
    </li>
  );
}

export function BiomeList({ biomes, activeName, selectedName, onSelect, onActivate, onCreate, onDelete, onDuplicate, onRename }: {
  biomes: BiomePreset[];
  activeName: string | null;
  selectedName: string | null;
  onSelect(name: string): void;
  onActivate(name: string): void;
  onCreate(): void;
  onDelete(name: string): void;
  onDuplicate(name: string): void;
  onRename(oldName: string, newName: string): void;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden font-mono">
      <ul className="flex-1 overflow-y-auto py-2 space-y-1">
        {biomes.length === 0 && (
          <li className="font-mono text-xs text-muted-foreground px-3 py-4">no biomes</li>
        )}
        {biomes.map(b => (
          <BiomeCard
            key={b.name}
            biome={b}
            isActive={b.name === activeName}
            isSelected={b.name === selectedName}
            onSelect={() => onSelect(b.name)}
            onActivate={() => onActivate(b.name)}
            onDelete={() => onDelete(b.name)}
            onDuplicate={() => onDuplicate(b.name)}
            onRename={newName => onRename(b.name, newName)}
          />
        ))}
      </ul>
      <div className="border-t border-border px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onCreate} className="w-full font-mono text-xs">
          + new biome
        </Button>
      </div>
    </div>
  );
}
