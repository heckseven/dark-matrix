import * as React from 'react';
import { useRef, useState } from 'react';
import { Button } from './ui/button.js';
import { Tooltip, TooltipProvider } from './ui/tooltip.js';

const MONO: React.CSSProperties = { fontFamily: 'monospace', fontSize: 14, lineHeight: '14px' };
const MIN_L = 48;

function grayColor(v: number): string {
  if (v === 0) return '#1a1a1a';
  const l = Math.round(MIN_L + (v / 255) * (255 - MIN_L));
  return `rgb(${l},${l},${l})`;
}

function glyphChar(v: number) { return v === 0 ? '•' : '∗'; }

// ── Scrub input ───────────────────────────────────────────────────────────────

function ScrubInput({ val, onChange }: { val: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);

  React.useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  function clamp(v: number) { return Math.max(0, Math.min(255, v)); }

  function onPointerDown(e: React.PointerEvent) {
    if (editing) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: val, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const delta = e.clientX - drag.current.x;
    if (Math.abs(delta) > 2) drag.current.moved = true;
    if (drag.current.moved) onChange(clamp(drag.current.v + Math.round(delta * 1.5)));
  }

  function onPointerUp() {
    if (drag.current && !drag.current.moved) setEditing(true);
    drag.current = null;
  }

  return (
    <span
      style={{ ...MONO, display: 'inline-flex', alignItems: 'center', cursor: editing ? 'default' : 'ew-resize', userSelect: 'none', whiteSpace: 'nowrap' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span style={{ color: '#555' }}>[</span>
      <input
        ref={inputRef}
        type="number" min={0} max={255}
        value={val}
        readOnly={!editing}
        onChange={e => onChange(clamp(parseInt(e.target.value, 10) || 0))}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') inputRef.current?.blur(); }}
        style={{
          ...MONO, width: '3ch', textAlign: 'center',
          background: 'transparent', border: 'none', outline: 'none',
          color: 'white', cursor: editing ? 'text' : 'ew-resize',
          pointerEvents: editing ? 'auto' : 'none',
          MozAppearance: 'textfield',
        }}
      />
      <span style={{ color: '#555' }}>]</span>
    </span>
  );
}

// ── Row cursor (keyboard focus L-brackets) ────────────────────────────────────
// Wrapper is height:16 with 12px content centered at y=2..y=14.
// top:0/bottom:0 gives the 2px gap from content edges.
// left shifts to -60 when the scrub input (left:-58) is visible.

function RowCursor({ editing }: { editing: boolean }) {
  const c: React.CSSProperties = { position: 'absolute', width: 6, height: 6, pointerEvents: 'none' };
  const b = '1px solid white';
  const l = editing ? -60 : -2;
  return (
    <>
      <span style={{ ...c, top: 0, left: l,    borderTop: b, borderLeft: b }} />
      <span style={{ ...c, top: 0, right: -2,  borderTop: b, borderRight: b }} />
      <span style={{ ...c, bottom: 0, left: l,  borderBottom: b, borderLeft: b }} />
      <span style={{ ...c, bottom: 0, right: -2, borderBottom: b, borderRight: b }} />
    </>
  );
}

// ── Swatch row ────────────────────────────────────────────────────────────────

type SwatchData = { id: string; value: number; preset: boolean };

function SwatchRow({ swatch, selected, editing, kbFocused, onSelect, onChange }: {
  swatch: SwatchData;
  selected: boolean;
  editing: boolean;
  kbFocused: boolean;
  onSelect: () => void;
  onChange?: (v: number) => void;
}) {
  const v = swatch.value;
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={`${v}${swatch.preset ? '' : ', custom'}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 12, height: 16 }}
    >
      {kbFocused && <RowCursor editing={editing} />}
      {editing && onChange && (
        <div style={{ position: 'absolute', left: -58, top: -1, zIndex: 1 }}>
          <ScrubInput val={v} onChange={onChange} />
        </div>
      )}
      <div
        style={{ position: 'relative', width: 12, height: 12, flexShrink: 0, cursor: 'pointer' }}
        onClick={onSelect}
      >
        {selected && (
          <div style={{
            position: 'absolute', top: -2, left: -2, width: 16, height: 16,
            border: '1px solid white', pointerEvents: 'none',
          }} />
        )}
        <div style={{
          width: 12, height: 12, boxSizing: 'border-box',
          background: v === 0 ? 'transparent' : `rgb(${v},${v},${v})`,
          border: v === 0 ? '1px solid #333' : 'none',
        }} />
      </div>
      <span
        style={{ ...MONO, color: grayColor(v), cursor: 'pointer', userSelect: 'none' }}
        onClick={onSelect}
      >
        {glyphChar(v)}
      </span>
    </div>
  );
}

// ── ColorPalette ──────────────────────────────────────────────────────────────

const PRESET_VALUES = [255, 204, 153, 102, 51, 0];
const PRESETS: SwatchData[] = PRESET_VALUES.map(v => ({ id: `preset-${v}`, value: v, preset: true }));

export interface ColorPaletteProps {
  value: number;
  onChange: (v: number) => void;
}

export function ColorPalette({ value: _value, onChange }: ColorPaletteProps) {
  const [swatches, setSwatches] = useState<SwatchData[]>(PRESETS);
  const [selectedId, setSelectedId] = useState<string>(PRESETS[0]!.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kbIdx, setKbIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  function selectSwatch(id: string, clearKb = true) {
    const s = swatches.find(s => s.id === id);
    if (!s) return;
    setSelectedId(id);
    onChange(s.value);
    setEditingId(!s.preset ? id : null);
    if (clearKb) setKbIdx(null);
  }

  function updateValue(id: string, v: number) {
    setSwatches(ss => ss.map(s => s.id === id ? { ...s, value: v } : s));
    if (id === selectedId) onChange(v);
  }

  function addSwatch() {
    const id = `custom-${nextId.current++}`;
    setSwatches(ss => [...ss, { id, value: 128, preset: false }]);
    setSelectedId(id);
    setEditingId(id);
    setKbIdx(null);
    onChange(128);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const current = kbIdx ?? Math.max(0, swatches.findIndex(s => s.id === selectedId));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setKbIdx(Math.min(current + 1, swatches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setKbIdx(Math.max(current - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = swatches[current];
      if (target) selectSwatch(target.id, false);
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setKbIdx(null);
    }
  }

  function handleBlur(e: React.FocusEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setKbIdx(null);
      setEditingId(null);
    }
  }

  return (
    <TooltipProvider>
    <div
      ref={containerRef}
      tabIndex={0}
      role="listbox"
      aria-label="Color palette"
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, paddingLeft: 64, outline: 'none' }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onPointerDown={e => {
        if (!(e.target as HTMLElement).closest('[data-swatch]')) setEditingId(null);
      }}
    >
      {swatches.map((s, i) => (
        <Tooltip key={s.id} content={String(s.value)}>
          <div data-swatch="">
            <SwatchRow
              swatch={s}
              selected={selectedId === s.id}
              editing={editingId === s.id}
              kbFocused={kbIdx === i}
              onSelect={() => selectSwatch(s.id)}
              onChange={!s.preset ? v => updateValue(s.id, v) : undefined}
            />
          </div>
        </Tooltip>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="font-mono px-0 self-start mt-0.5"
        onClick={addSwatch}
      >
        +
      </Button>
    </div>
    </TooltipProvider>
  );
}
