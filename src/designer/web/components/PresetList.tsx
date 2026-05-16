import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { Button } from './ui/button.js';
import { Stack } from './ui/stack.js';
import { MatrixPreview } from './MatrixPreview.js';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import { createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataStyle, DataRenderer } from '../../../animations/data-renderers.js';
import type { HudPresetClient, HudWidget } from '../types/hud-preset.js';

const COLS = 9;
const ROWS = 34;

// ── pixel helpers ─────────────────────────────────────────────────────────

const _clockCache: Partial<Record<ClockFace, ClockRenderer>> = {};
const _dataCache: Partial<Record<DataStyle, DataRenderer>> = {};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _clockCache) delete _clockCache[k as ClockFace];
    for (const k in _dataCache) delete _dataCache[k as DataStyle];
  });
}

function renderWidgetToB64(widget: HudWidget | null, side: 'left' | 'right'): string {
  const empty = btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));
  if (!widget) return empty;
  try {
    if (widget.widget === 'clock') {
      const face: ClockFace = widget.face ?? 'elegant';
      if (!_clockCache[face]) _clockCache[face] = createClockRenderer(face);
      const frame = _clockCache[face]!({ now: new Date(), side });
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return btoa(String.fromCharCode(...out));
    } else {
      const style: DataStyle = widget.style ?? 'line';
      if (!_dataCache[style]) _dataCache[style] = createDataRenderer({ style });
      const frame = _dataCache[style]!.render();
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return btoa(String.fromCharCode(...out));
    }
  } catch {
    return empty;
  }
}

function combinePixels(left: string, right: string): string {
  try { return btoa(atob(left) + atob(right)); } catch { return left; }
}

// ── corner brackets ───────────────────────────────────────────────────────

function CornerBrackets({ active }: { active: boolean }) {
  const c = { position: 'absolute' as const, width: 10, height: 10, pointerEvents: 'none' as const };
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

// ── gap zone (drag drop target between cards) ─────────────────────────────

function GapZone({ afterIdx, showDrop, setDropTarget, presetCount, onInsert }: {
  afterIdx: number;
  showDrop: boolean;
  setDropTarget: (v: number | null) => void;
  presetCount: number;
  onInsert: () => void;
}) {
  return (
    <div
      className={`-my-10 h-10 flex items-center gap-1 px-1 transition-opacity ${showDrop ? '' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(afterIdx + 1); }}
      onDrop={e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const from = Number(raw);
        setDropTarget(null);
        if (!Number.isInteger(from) || from < 0 || from >= presetCount) return;
        const target = afterIdx + 1;
        const to = from < target ? target - 1 : target;
        if (to !== from) setDropTarget(null);
      }}
    >
      {showDrop ? (
        <div className="flex-1 h-0.5 bg-green-500 rounded-full pointer-events-none" />
      ) : (
        <>
          <div className="flex-1 h-px bg-border" />
          <Button
            variant="ghost"
            aria-label={`Insert preset after position ${afterIdx + 1}`}
            tooltip={`Insert preset after position ${afterIdx + 1}`}
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

// ── preset card ───────────────────────────────────────────────────────────

function PresetCard({
  preset,
  idx,
  presetCount,
  isActive,
  isSelected,
  pixels,
  dropTarget,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
  onMoveUp,
  onMoveDown,
  setDropTarget,
  onDrop,
}: {
  preset: HudPresetClient;
  idx: number;
  presetCount: number;
  isActive: boolean;
  isSelected: boolean;
  pixels: string;
  dropTarget: number | null;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (newName: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  setDropTarget: (v: number | null) => void;
  onDrop: (from: number, onto: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(preset.name);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitRename() {
    const next = draft.trim() || preset.name;
    setDraft(next);
    setEditing(false);
    if (next !== preset.name) onRename(next);
  }

  const highlighted = isSelected || isActive;

  return (
    <div
      aria-label={preset.name}
      tabIndex={0}
      className="group relative flex flex-row gap-3 p-1 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        if (!Number.isInteger(from) || from < 0 || from >= presetCount || target === null) return;
        const to = from < target ? target - 1 : target;
        if (to !== from) onDrop(from, to);
      }}
    >
      <CornerBrackets active={highlighted} />

      {/* Draggable thumbnail */}
      <div
        draggable
        aria-hidden="true"
        tabIndex={-1}
        onDragStart={e => { setDragging(true); e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragging(false); setDropTarget(null); }}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <MatrixPreview pixels={pixels} width={18} />
      </div>

      {/* Right: mirroring FrameCell's Stack justify="between" */}
      <Stack justify="between" align="start" className="flex-1 min-w-0">
        <Stack gap="xs" align="start">
          <Button
            variant="ghost"
            aria-label="Move preset up"
            tooltip="Move up"
            disabled={idx === 0}
            onClick={e => { e.stopPropagation(); onMoveUp(); }}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            aria-label="Move preset down"
            tooltip="Move down"
            disabled={idx === presetCount - 1}
            onClick={e => { e.stopPropagation(); onMoveDown(); }}
          >
            ↓
          </Button>
        </Stack>
        <Stack gap="xs" align="start">
          <div className="flex">
            <Button
              variant="ghost"
              aria-label="Clone preset"
              tooltip="Clone preset"
              onClick={e => { e.stopPropagation(); onDuplicate(); }}
            >
              ⧉
            </Button>
            {presetCount > 1 && (
              <Button
                variant="ghost"
                aria-label="Delete preset"
                tooltip="Delete preset"
                onClick={e => { e.stopPropagation(); onDelete(); }}
              >
                ×
              </Button>
            )}
          </div>
          {/* Name — replaces the timing input */}
          {editing ? (
            <input
              ref={inputRef}
              className="font-mono text-xs bg-transparent border-b border-white text-foreground outline-none w-full"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { setDraft(preset.name); setEditing(false); }
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="font-mono text-xs text-foreground pl-2 block truncate"
              onDoubleClick={e => { e.stopPropagation(); setDraft(preset.name); setEditing(true); }}
            >
              {isActive && <span aria-label="active" className="inline-block w-1.5 h-1.5 rounded-full bg-white align-middle mr-1" />}
              {preset.name}
            </span>
          )}
        </Stack>
      </Stack>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────

export type PresetListProps = {
  presets: HudPresetClient[];
  activeName: string | null;
  selectedName: string | null;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onInsert: (afterIdx: number) => void;
  onDelete: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onMove: (fromIdx: number, toIdx: number) => void;
};

export function PresetList({
  presets,
  activeName,
  selectedName,
  onSelect,
  onCreate,
  onInsert,
  onDelete,
  onDuplicate,
  onRename,
  onMove,
}: PresetListProps) {
  const [tick, setTick] = useState(0);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const id = setInterval(refresh, 100);
    return () => clearInterval(id);
  }, [refresh]);

  void tick;

  return (
    <div
      className="flex flex-col overflow-y-auto flex-1 min-h-0 pr-2"
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      }}
    >
      <div className="flex flex-col gap-10 pb-2 pt-2">
        {presets.length === 0 && (
          <p className="font-mono text-xs text-foreground/40 px-2 py-4">no presets</p>
        )}
        {dropTarget === 0 && (
          <div aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />
        )}
        {presets.map((preset, idx) => {
          const leftPx  = renderWidgetToB64(preset.left,  'left');
          const rightPx = renderWidgetToB64(preset.right, 'right');
          const pixels  = combinePixels(leftPx, rightPx);
          return (
            <Fragment key={preset.name}>
              <PresetCard
                preset={preset}
                idx={idx}
                presetCount={presets.length}
                isActive={activeName === preset.name}
                isSelected={selectedName === preset.name}
                pixels={pixels}
                dropTarget={dropTarget}
                onSelect={() => onSelect(preset.name)}
                onDelete={() => onDelete(preset.name)}
                onDuplicate={() => onDuplicate(preset.name)}
                onRename={newName => onRename(preset.name, newName)}
                onMoveUp={() => onMove(idx, idx - 1)}
                onMoveDown={() => onMove(idx, idx + 1)}
                setDropTarget={setDropTarget}
                onDrop={onMove}
              />
              {idx < presets.length - 1 && (
                <GapZone
                  afterIdx={idx}
                  showDrop={dropTarget === idx + 1}
                  setDropTarget={setDropTarget}
                  presetCount={presets.length}
                  onInsert={() => onInsert(idx)}
                />
              )}
            </Fragment>
          );
        })}
        {dropTarget === presets.length && (
          <div aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />
        )}
      </div>

      <Button
        variant="ghost"
        aria-label="Add preset"
        tooltip="Add preset"
        onClick={onCreate}
      >
        +
      </Button>
    </div>
  );
}
