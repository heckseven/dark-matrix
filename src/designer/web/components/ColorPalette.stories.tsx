import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Button } from './ui/button.js';

const MONO: React.CSSProperties = { fontFamily: 'monospace', fontSize: 14, lineHeight: '14px' };
const MIN_L = 48;

function grayColor(v: number): string {
  if (v === 0) return '#1a1a1a';
  const l = Math.round(MIN_L + (v / 255) * (255 - MIN_L));
  return `rgb(${l},${l},${l})`;
}

function glyph(v: number) { return v === 0 ? '•' : '∗'; }

// ── Scrub input (same pattern as ColorValue F/G) ───────────────────────────────

function ScrubInput({ val, onChange }: { val: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);

  useEffect(() => {
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

// ── Swatch row ─────────────────────────────────────────────────────────────────

type SwatchData = { id: string; value: number; preset: boolean };

function SwatchRow({ swatch, selected, focused, onSelect, onChange }: {
  swatch: SwatchData;
  selected: boolean;
  focused: boolean;
  onSelect: () => void;
  onChange?: (v: number) => void;
}) {
  const v = swatch.value;
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, height: 16 }}>
      {focused && onChange && (
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
        {glyph(v)}
      </span>
    </div>
  );
}

// ── Palette ────────────────────────────────────────────────────────────────────

const PRESET_VALUES = [255, 204, 153, 102, 51, 0];
const PRESETS: SwatchData[] = PRESET_VALUES.map(v => ({ id: `preset-${v}`, value: v, preset: true }));

function ColorPaletteDemo() {
  const [swatches, setSwatches] = useState<SwatchData[]>(PRESETS);
  const [selectedId, setSelectedId] = useState<string>(PRESETS[0]!.id);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const nextId = useRef(0);

  function selectSwatch(id: string) {
    setSelectedId(id);
    const s = swatches.find(s => s.id === id);
    setFocusedId(s && !s.preset ? id : null);
  }

  function addSwatch() {
    const id = `custom-${nextId.current++}`;
    setSwatches(s => [...s, { id, value: 128, preset: false }]);
    setSelectedId(id);
    setFocusedId(id);
  }

  function updateSwatch(id: string, value: number) {
    setSwatches(s => s.map(s => s.id === id ? { ...s, value } : s));
  }

  return (
    <div
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, paddingLeft: 64 }}
      onPointerDown={e => {
        if (!(e.target as HTMLElement).closest('[data-swatch]')) setFocusedId(null);
      }}
    >
      {swatches.map(s => (
        <div key={s.id} data-swatch="">
          <SwatchRow
            swatch={s}
            selected={selectedId === s.id}
            focused={focusedId === s.id}
            onSelect={() => selectSwatch(s.id)}
            onChange={!s.preset ? v => updateSwatch(s.id, v) : undefined}
          />
        </div>
      ))}
      <Button variant="ghost" size="sm" className="font-mono px-0 self-start" onClick={addSwatch}>+</Button>
    </div>
  );
}

// ── Meta ───────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Design/ColorPalette',
  component: ColorPaletteDemo,
  tags: [],
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: 'Preset grayscale swatches with a custom swatch builder. Click `+` to add a swatch — it appears focused with a scrub input. Click away to unfocus. Click a custom swatch to re-focus it.',
      },
    },
  },
} satisfies Meta<typeof ColorPaletteDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
