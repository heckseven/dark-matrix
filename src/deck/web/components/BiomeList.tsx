import { useState, useRef, useEffect, Fragment } from 'react';
import { Button } from './ui/button.js';
import { MatrixPreview } from './MatrixPreview.js';
import { Stack } from './ui/stack.js';
import type { BiomePreset, LifeAlgorithm } from '../types/life-types.js';

const ROWS = 34;

const ALGO_BADGE: Record<LifeAlgorithm, string> = {
  conway:   'B3/S23',
  highlife: 'B36/S23',
  daynight: 'B3678/S34678',
  maze:     'B3/S12345',
  coral:    'B3/S45678',
  anneal:   'B4678/S35678',
};

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

function GapZone({ afterIdx, showDrop, setDropTarget, biomeCount, onInsert, onMove }: {
  afterIdx: number;
  showDrop: boolean;
  setDropTarget: (v: number | null) => void;
  biomeCount: number;
  onInsert(): void;
  onMove(from: number, to: number): void;
}) {
  return (
    <div
      className={`h-10 flex items-center gap-1 px-1 transition-opacity ${showDrop ? '' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(afterIdx + 1); }}
      onDrop={e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const from = Number(raw);
        setDropTarget(null);
        if (!Number.isInteger(from) || from < 0 || from >= biomeCount) return;
        const target = afterIdx + 1;
        const to = from < target ? target - 1 : target;
        if (to !== from) onMove(from, to);
      }}
    >
      {showDrop ? (
        <div className="flex-1 h-0.5 bg-green-500 rounded-full pointer-events-none" />
      ) : (
        <>
          <div className="flex-1 h-px bg-border" />
          <Button
            variant="ghost"
            aria-label={`Insert biome after position ${afterIdx + 1}`}
            tooltip={`Insert after ${afterIdx + 1}`}
            onClick={onInsert}
          >
            +
          </Button>
          <div className="flex-1 h-px bg-border" />
        </>
      )}
    </div>
  );
}

function BiomeCard({ biome, idx, biomeCount, isActive, isSelected, dropTarget, onSelect, onActivate, onDelete, onDuplicate, onRename, onMoveUp, onMoveDown, setDropTarget, onDrop }: {
  biome: BiomePreset;
  idx: number;
  biomeCount: number;
  isActive: boolean;
  isSelected: boolean;
  dropTarget: number | null;
  onSelect(): void;
  onActivate(): void;
  onDelete(): void;
  onDuplicate(): void;
  onRename(name: string): void;
  onMoveUp(): void;
  onMoveDown(): void;
  setDropTarget(v: number | null): void;
  onDrop(from: number, onto: number): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitRename() {
    const next = draft.trim() || biome.name;
    setDraft(next);
    setEditing(false);
    if (next !== biome.name) onRename(next);
  }

  const { pixels, width } = snapshotPixels(biome.gridSnapshot);

  return (
    <div
      aria-label={isActive ? `${biome.name} (active)` : biome.name}
      tabIndex={0}
      className="group relative flex flex-col gap-1 p-2 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        setDropTarget(e.clientY < rect.top + rect.height / 2 ? idx : idx + 1);
      }}
      onDrop={e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const from = Number(raw);
        const target = dropTarget;
        setDropTarget(null);
        if (!Number.isInteger(from) || from < 0 || from >= biomeCount || target === null) return;
        const to = from < target ? target - 1 : target;
        if (to !== from) onDrop(from, to);
      }}
    >
      <CornerBrackets active={isSelected || isActive} />

      {/* Top row: thumbnail (left) + button column (right) */}
      <div className="flex flex-row gap-3">
        {/* Draggable thumbnail */}
        <div
          draggable
          aria-hidden="true"
          tabIndex={-1}
          onDragStart={e => { setDragging(true); e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => { setDragging(false); setDropTarget(null); }}
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        >
          <MatrixPreview pixels={pixels} width={width} />
        </div>

        {/* Button column */}
        <Stack justify="between" align="start" className="flex-1 min-w-0">
          <Stack direction="col" gap="none" align="start">
            <Button
              variant="ghost"
              className="w-8"
              aria-label="Move biome up"
              tooltip="Move up"
              tooltipSide="right"
              disabled={idx === 0}
              onClick={e => { e.stopPropagation(); onMoveUp(); }}
            >↑</Button>
            <Button
              variant="ghost"
              className="w-8"
              aria-label="Move biome down"
              tooltip="Move down"
              tooltipSide="right"
              disabled={idx === biomeCount - 1}
              onClick={e => { e.stopPropagation(); onMoveDown(); }}
            >↓</Button>
          </Stack>
          <Stack direction="col" gap="none" align="start">
            {isActive ? (
              <Button variant="primary" className="w-8" aria-label="Active biome" tooltip="Active biome" tooltipSide="right" onClick={e => e.stopPropagation()}>∗</Button>
            ) : (
              <Button variant="ghost" className="w-8" aria-label="Set as active" tooltip="Set as active" tooltipSide="right" onClick={e => { e.stopPropagation(); onActivate(); }}>•</Button>
            )}
            <Button variant="ghost" className="w-8" aria-label="Clone biome" tooltip="Clone" tooltipSide="right" onClick={e => { e.stopPropagation(); onDuplicate(); }}>⧉</Button>
            {biomeCount > 1 && (
              <Button variant="ghost" className="w-8" aria-label="Delete biome" tooltip="Delete" tooltipSide="right" onClick={e => { e.stopPropagation(); onDelete(); }}>×</Button>
            )}
          </Stack>
        </Stack>
      </div>

      {/* Name row */}
      {editing ? (
        <input
          ref={inputRef}
          aria-label={`Rename: ${biome.name}`}
          className="font-mono text-xs bg-transparent border-b border-white text-foreground outline-none w-full"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
            if (e.key === 'Escape') { setDraft(biome.name); setEditing(false); }
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span
          className="font-mono text-xs text-foreground pl-1 block truncate"
          onDoubleClick={e => { e.stopPropagation(); setDraft(biome.name); setEditing(true); }}
        >
          {biome.name}
          <span className="ml-1 text-muted-foreground text-[10px]">{ALGO_BADGE[biome.algorithm]}</span>
        </span>
      )}
    </div>
  );
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
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  return (
    <div
      className="flex flex-col overflow-y-auto flex-1 min-h-0 pr-2 [scrollbar-gutter:stable]"
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      }}
    >
      <ul aria-label="Biomes" className="flex flex-col gap-2 pb-2 pt-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {biomes.length === 0 && (
          <li className="font-mono text-xs text-muted-foreground px-2 py-4">no biomes</li>
        )}
        {dropTarget === 0 && (
          <li aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />
        )}
        {biomes.map((biome, idx) => (
          <Fragment key={biome.name}>
            <li {...(selectedName === biome.name ? { 'aria-current': 'true' as const } : {})}>
              <BiomeCard
                biome={biome}
                idx={idx}
                biomeCount={biomes.length}
                isActive={activeName === biome.name}
                isSelected={selectedName === biome.name}
                dropTarget={dropTarget}
                onSelect={() => onSelect(biome.name)}
                onActivate={() => onActivate(biome.name)}
                onDelete={() => onDelete(biome.name)}
                onDuplicate={() => onDuplicate(biome.name)}
                onRename={newName => onRename(biome.name, newName)}
                onMoveUp={() => onMove(idx, idx - 1)}
                onMoveDown={() => onMove(idx, idx + 1)}
                setDropTarget={setDropTarget}
                onDrop={onMove}
              />
            </li>
            {idx < biomes.length - 1 && (
              <li>
                <GapZone
                  afterIdx={idx}
                  showDrop={dropTarget === idx + 1}
                  setDropTarget={setDropTarget}
                  biomeCount={biomes.length}
                  onInsert={() => onInsert(idx)}
                  onMove={onMove}
                />
              </li>
            )}
          </Fragment>
        ))}
        {dropTarget === biomes.length && (
          <li aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />
        )}
      </ul>
      <Button variant="ghost" aria-label="Add biome" tooltip="Add biome" onClick={onCreate}>+</Button>
    </div>
  );
}
