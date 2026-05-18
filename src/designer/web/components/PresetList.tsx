import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { Button } from './ui/button.js';
import { Stack } from './ui/stack.js';
import { MatrixPreview } from './MatrixPreview.js';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import { createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataStyle, DataRenderer } from '../../../animations/data-renderers.js';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle, RenderCtx } from '../../../animations/audio-renderers.js';
import { createHeatmapState, bumpTool, renderHeatmap } from '../../../animations/heatmap.js';
import type { HudPresetClient, HudWidget } from '../types/hud-preset.js';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import { useDesignerStore, designerStore } from '../store.js';

const COLS = 9;
const ROWS = 34;

function b64ToUint8(b64: string, expectedBytes: number): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(expectedBytes);
  for (let i = 0; i < expectedBytes; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

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

const _clockCache: Partial<Record<ClockFace, ClockRenderer>> = {};
const _dataCache: Partial<Record<DataStyle, DataRenderer>> = {};
const _audioCache: Partial<Record<AudioStyle, ReturnType<typeof createAudioRenderer>>> = {};
const MOCK_AUDIO_CTX = { bands: [200, 150, 100, 70, 40, 20, 10, 5, 2], fftSize: 2048, gain: 1.5 };

const _heatmapPreview = (() => {
  const s = createHeatmapState();
  for (const t of ['Bash', 'Read', 'Edit', 'Agent', 'Skill', 'ToolSearch', 'TodoWrite', 'Task']) bumpTool(s, t);
  return s;
})();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _clockCache) delete _clockCache[k as ClockFace];
    for (const k in _dataCache) delete _dataCache[k as DataStyle];
    for (const k in _audioCache) delete _audioCache[k as AudioStyle];
  });
}

type AudioFrames = Partial<Record<AudioStyle, { left: string; right: string }>>;
type ImageAnimState = { frameIdx: number; elapsed: number; lastTick: number | null };

function extractHalfB64(asset: AssetMeta, side: 'left' | 'right', frameIdx = 0): string {
  const totalBytes = asset.width * ROWS;
  const srcB64 = asset.frames[frameIdx] ?? asset.firstFrame;
  const full = b64ToUint8(srcB64, totalBytes);
  if (asset.width === 9) return btoa(String.fromCharCode(...full));
  const colOffset = side === 'right' ? COLS : 0;
  const out = new Uint8Array(COLS * ROWS);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      out[col * ROWS + row] = full[(col + colOffset) * ROWS + row] ?? 0;
    }
  }
  return btoa(String.fromCharCode(...out));
}

function renderWidgetToB64(widget: HudWidget | null, side: 'left' | 'right', audioCtx: RenderCtx, audioFrames?: AudioFrames, assetList?: AssetMeta[] | null, imageAnim?: Record<string, ImageAnimState>): string {
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
    } else if (widget.widget === 'audio') {
      const style = widget.style ?? AUDIO_STYLES[0]!.id;
      const cached = audioFrames?.[style]?.[side];
      if (cached) return cached;
      if (!_audioCache[style]) _audioCache[style] = createAudioRenderer(style);
      const frame = _audioCache[style]!(audioCtx);
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      const pixels = side === 'right' ? mirrorFrame(out) : out;
      return btoa(String.fromCharCode(...pixels));
    } else if (widget.widget === 'heatmap') {
      const [lf, rf] = renderHeatmap(_heatmapPreview);
      const frame = side === 'left' ? lf : rf;
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return btoa(String.fromCharCode(...out));
    } else if (widget.widget === 'image') {
      const asset = assetList?.find(a => a.name === widget.file);
      if (!asset) return empty;
      const frameIdx = imageAnim?.[widget.file]?.frameIdx ?? 0;
      return extractHalfB64(asset, side, frameIdx);
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

// ── gap zone (drag drop target between cards) ─────────────────────────────

function GapZone({ afterIdx, showDrop, setDropTarget, presetCount, onInsert, onMove }: {
  afterIdx: number;
  showDrop: boolean;
  setDropTarget: (v: number | null) => void;
  presetCount: number;
  onInsert: () => void;
  onMove: (from: number, to: number) => void;
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
  onActivate,
  onDelete,
  onDuplicate,
  onRename,
  onMoveUp,
  onMoveDown,
  setDropTarget,
  onDrop,
  onEditTriggers,
}: {
  preset: HudPresetClient;
  idx: number;
  presetCount: number;
  isActive: boolean;
  isSelected: boolean;
  pixels: string;
  dropTarget: number | null;
  onSelect: () => void;
  onActivate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (newName: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  setDropTarget: (v: number | null) => void;
  onDrop: (from: number, onto: number) => void;
  onEditTriggers: () => void;
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
      role="option"
      aria-selected={highlighted}
      aria-label={isActive ? `${preset.name} (default)` : preset.name}
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
        if (!Number.isInteger(from) || from < 0 || from >= presetCount || target === null) return;
        const to = from < target ? target - 1 : target;
        if (to !== from) onDrop(from, to);
      }}
    >
      <CornerBrackets active={highlighted} />
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
          <MatrixPreview pixels={pixels} width={18} />
        </div>

        {/* Button column: ↑↓ top-aligned, ∗/• if ⧉ × bottom-aligned */}
        <Stack justify="between" align="start" className="flex-1 min-w-0">
          <Stack direction="col" gap="none" align="start">
            <Button
              variant="ghost"
              aria-label="Move preset up"
              tooltip="Move up"
              disabled={idx === 0}
              onClick={e => { e.stopPropagation(); onMoveUp(); }}
            >↑</Button>
            <Button
              variant="ghost"
              aria-label="Move preset down"
              tooltip="Move down"
              disabled={idx === presetCount - 1}
              onClick={e => { e.stopPropagation(); onMoveDown(); }}
            >↓</Button>
          </Stack>
          <Stack direction="col" gap="none" align="start">
            {isActive ? (
              <Button
                variant="primary"
                aria-label="Default preset"
                tooltip="Default preset"
                disabled
              >∗</Button>
            ) : (
              <Button
                variant="ghost"
                aria-label="Set as default"
                tooltip="Set as default"
                onClick={e => { e.stopPropagation(); onActivate(); }}
              >•</Button>
            )}
            <Button
              variant="ghost"
              aria-label="Edit triggers"
              tooltip="Edit triggers"
              onClick={e => { e.stopPropagation(); onEditTriggers(); }}
            >if</Button>
            <Button
              variant="ghost"
              aria-label="Clone preset"
              tooltip="Clone preset"
              onClick={e => { e.stopPropagation(); onDuplicate(); }}
            >⧉</Button>
            {presetCount > 1 && (
              <Button
                variant="ghost"
                aria-label="Delete preset"
                tooltip="Delete preset"
                onClick={e => { e.stopPropagation(); onDelete(); }}
              >×</Button>
            )}
          </Stack>
        </Stack>
      </div>

      {/* Name row — full width below thumbnail and buttons */}
      {editing ? (
        <input
          ref={inputRef}
          aria-label={`Rename: ${preset.name}`}
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
          className="font-mono text-xs text-foreground/60 pl-1 block truncate"
          onDoubleClick={e => { e.stopPropagation(); setDraft(preset.name); setEditing(true); }}
        >
          {preset.name}
        </span>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────

export type PresetListProps = {
  presets: HudPresetClient[];
  activeName: string | null;
  selectedName: string | null;
  audioCtx?: RenderCtx;
  onSelect: (name: string) => void;
  onActivate: (name: string) => void;
  onCreate: () => void;
  onInsert: (afterIdx: number) => void;
  onDelete: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onMove: (fromIdx: number, toIdx: number) => void;
  onEditTriggers: (name: string) => void;
};

export function PresetList({
  presets,
  activeName,
  selectedName,
  audioCtx = MOCK_AUDIO_CTX,
  onSelect,
  onActivate,
  onCreate,
  onInsert,
  onDelete,
  onDuplicate,
  onRename,
  onMove,
  onEditTriggers,
}: PresetListProps) {
  const [tick, setTick] = useState(0);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const assetList = useDesignerStore(s => s.assetList);

  const audioCtxRef   = useRef(audioCtx);
  const presetsRef    = useRef(presets);
  const assetListRef  = useRef(assetList);
  audioCtxRef.current   = audioCtx;
  presetsRef.current    = presets;
  assetListRef.current  = assetList;
  const audioFramesRef = useRef<AudioFrames>({});
  const imageAnimRef   = useRef<Record<string, ImageAnimState>>({});

  // Load assets if any preset uses an image widget
  useEffect(() => {
    const hasImage = presets.some(p => p.left?.widget === 'image' || p.right?.widget === 'image');
    if (hasImage) void designerStore.getState().loadAssets();
  }, [presets]);

  useEffect(() => {
    const id = setInterval(() => {
      const ctx = audioCtxRef.current;
      const ps  = presetsRef.current;
      // Collect needed styles from current presets
      const needed = new Set<AudioStyle>();
      for (const p of ps) {
        if (p.left?.widget  === 'audio') needed.add(p.left.style  ?? AUDIO_STYLES[0]!.id);
        if (p.right?.widget === 'audio') needed.add(p.right.style ?? AUDIO_STYLES[0]!.id);
      }
      // Render each needed style exactly once per tick
      const frames: AudioFrames = {};
      for (const style of needed) {
        if (!_audioCache[style]) _audioCache[style] = createAudioRenderer(style);
        const raw = _audioCache[style]!(ctx);
        const bw = new Uint8Array(COLS * ROWS);
        for (let i = 0; i < raw.length; i++) bw[i] = (raw[i] ?? 0) > 127 ? 255 : 0;
        frames[style] = { left: btoa(String.fromCharCode(...bw)), right: btoa(String.fromCharCode(...mirrorFrame(bw))) };
      }
      audioFramesRef.current = frames;

      // Advance image animations
      const nowMs = Date.now();
      const imageAnim = imageAnimRef.current;
      const al = assetListRef.current;
      const usedAssets = new Set<string>();
      for (const p of ps) {
        if (p.left?.widget === 'image' && p.left.file) usedAssets.add(p.left.file);
        if (p.right?.widget === 'image' && p.right.file) usedAssets.add(p.right.file);
      }
      for (const name of usedAssets) {
        const asset = al?.find(a => a.name === name);
        if (!asset || asset.frames.length <= 1) continue;
        if (!imageAnim[name]) imageAnim[name] = { frameIdx: 0, elapsed: 0, lastTick: null };
        const s = imageAnim[name]!;
        if (s.lastTick !== null) s.elapsed += nowMs - s.lastTick;
        s.lastTick = nowMs;
        while (s.elapsed >= (asset.delays[s.frameIdx] ?? 100)) {
          s.elapsed -= asset.delays[s.frameIdx] ?? 100;
          s.frameIdx = s.frameIdx < asset.frames.length - 1 ? s.frameIdx + 1 : 0;
        }
      }

      setTick(t => t + 1);
    }, 100);
    return () => clearInterval(id);
  }, []);

  void tick;

  return (
    <div
      className="flex flex-col overflow-y-auto flex-1 min-h-0 pr-2"
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      }}
    >
      <ul role="listbox" aria-label="Presets" className="flex flex-col gap-10 pb-2 pt-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {presets.length === 0 && (
          <li className="font-mono text-xs text-foreground/55 px-2 py-4">no presets</li>
        )}
        {dropTarget === 0 && (
          <li aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />
        )}
        {presets.map((preset, idx) => {
          const af = audioFramesRef.current;
          const ia = imageAnimRef.current;
          const leftPx  = renderWidgetToB64(preset.left,  'left',  audioCtx, af, assetList, ia);
          const rightPx = renderWidgetToB64(preset.right, 'right', audioCtx, af, assetList, ia);
          const pixels  = combinePixels(leftPx, rightPx);
          return (
            <Fragment key={preset.name}>
              <li>
                <PresetCard
                  preset={preset}
                  idx={idx}
                  presetCount={presets.length}
                  isActive={activeName === preset.name}
                  isSelected={selectedName === preset.name}
                  pixels={pixels}
                  dropTarget={dropTarget}
                  onSelect={() => onSelect(preset.name)}
                  onActivate={() => onActivate(preset.name)}
                  onDelete={() => onDelete(preset.name)}
                  onDuplicate={() => onDuplicate(preset.name)}
                  onRename={newName => onRename(preset.name, newName)}
                  onMoveUp={() => onMove(idx, idx - 1)}
                  onMoveDown={() => onMove(idx, idx + 1)}
                  setDropTarget={setDropTarget}
                  onDrop={onMove}
                  onEditTriggers={() => onEditTriggers(preset.name)}
                />
              </li>
              {idx < presets.length - 1 && (
                <li>
                  <GapZone
                    afterIdx={idx}
                    showDrop={dropTarget === idx + 1}
                    setDropTarget={setDropTarget}
                    presetCount={presets.length}
                    onInsert={() => onInsert(idx)}
                    onMove={onMove}
                  />
                </li>
              )}
            </Fragment>
          );
        })}
        {dropTarget === presets.length && (
          <li aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />
        )}
      </ul>

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
