import { useState, useRef, useEffect, useCallback } from 'react';
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

// ── corner bracket ────────────────────────────────────────────────────────

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

// ── preset card ───────────────────────────────────────────────────────────

function PresetCard({
  preset,
  isActive,
  isSelected,
  pixels,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
}: {
  preset: HudPresetClient;
  isActive: boolean;
  isSelected: boolean;
  pixels: string;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(preset.name);
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
      className="group relative flex items-center gap-3 rounded-sm p-2 cursor-pointer"
      onClick={onSelect}
    >
      <CornerBrackets active={highlighted} />

      <div className="shrink-0">
        <MatrixPreview pixels={pixels} width={18} />
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isActive && (
          <span
            aria-label="active"
            className="shrink-0 w-1.5 h-1.5 rounded-full bg-white"
          />
        )}
        {editing ? (
          <input
            ref={inputRef}
            className="font-mono text-xs bg-transparent border-b border-white text-foreground outline-none min-w-0 w-full"
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
            className="font-mono text-xs text-foreground truncate"
            onDoubleClick={e => { e.stopPropagation(); setDraft(preset.name); setEditing(true); }}
          >
            {preset.name}
          </span>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label={`duplicate ${preset.name}`}
          className="font-mono text-xs text-foreground/40 hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-1"
          onClick={e => { e.stopPropagation(); onDuplicate(); }}
        >
          ⧉
        </button>
        <button
          type="button"
          aria-label={`delete ${preset.name}`}
          className="font-mono text-xs text-foreground/40 hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-1"
          onClick={e => { e.stopPropagation(); onDelete(); }}
        >
          ✕
        </button>
      </div>
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
  onDelete: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
};

export function PresetList({
  presets,
  activeName,
  selectedName,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
  onRename,
}: PresetListProps) {
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const id = setInterval(refresh, 100);
    return () => clearInterval(id);
  }, [refresh]);

  // suppress unused-variable lint on tick — it's used to trigger re-renders
  void tick;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto flex flex-col gap-1 py-2">
        {presets.length === 0 && (
          <p className="font-mono text-xs text-foreground/40 px-4 py-4">no presets</p>
        )}
        {presets.map(preset => {
          const leftPx = renderWidgetToB64(preset.left, 'left');
          const rightPx = renderWidgetToB64(preset.right, 'right');
          const pixels = combinePixels(leftPx, rightPx);
          return (
            <PresetCard
              key={preset.name}
              preset={preset}
              isActive={activeName === preset.name}
              isSelected={selectedName === preset.name}
              pixels={pixels}
              onSelect={() => onSelect(preset.name)}
              onDelete={() => onDelete(preset.name)}
              onDuplicate={() => onDuplicate(preset.name)}
              onRename={newName => onRename(preset.name, newName)}
            />
          );
        })}
      </div>

      <div className="shrink-0 border-t border-foreground/10 px-2 py-2">
        <button
          type="button"
          className="w-full font-mono text-xs text-foreground/50 hover:text-foreground transition-colors py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-1"
          onClick={onCreate}
        >
          + new preset
        </button>
      </div>
    </div>
  );
}


