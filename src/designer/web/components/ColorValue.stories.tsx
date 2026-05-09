import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';

const MONO: React.CSSProperties = { fontFamily: 'monospace', fontSize: 14 };
const MIN_L = 48;

function grayColor(v: number) {
  const l = Math.round(MIN_L + (v / 255) * (255 - MIN_L));
  return `rgb(${l},${l},${l})`;
}

// ── A: Scrubber ───────────────────────────────────────────────────────────────
// Bracket-enclosed number. Drag left/right or scroll to change. Zero visual chrome.

function ScrubberDemo({ initial }: { initial: number }) {
  const [val, setVal] = useState(initial);
  const drag = useRef<{ x: number; v: number } | null>(null);
  return (
    <span
      style={{ ...MONO, cursor: 'ew-resize', userSelect: 'none', display: 'inline-flex', alignItems: 'center' }}
      onPointerDown={e => { (e.currentTarget as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, v: val }; }}
      onPointerMove={e => { if (!drag.current) return; setVal(Math.max(0, Math.min(255, drag.current.v + Math.round((e.clientX - drag.current.x) * 1.5)))); }}
      onPointerUp={() => { drag.current = null; }}
      onWheel={e => setVal(v => Math.max(0, Math.min(255, v - Math.sign(e.deltaY))))}
    >
      <span style={{ color: '#555' }}>[</span>
      <span style={{ color: 'white', display: 'inline-block', minWidth: '3ch', textAlign: 'center' }}>{val}</span>
      <span style={{ color: '#555' }}>]</span>
    </span>
  );
}

// ── B: Cell Palette ───────────────────────────────────────────────────────────
// Row of mini pixel cells spanning 0–255. Matches canvas cell aesthetic.
// Active cell gets L-bracket cursor marks.

const PALETTE_N = 9;
const PCELL = 14;
const paletteSteps = Array.from({ length: PALETTE_N }, (_, i) => Math.round((i / (PALETTE_N - 1)) * 255));

function snapToStep(v: number) {
  return paletteSteps.reduce((b, s) => Math.abs(s - v) < Math.abs(b - v) ? s : b, paletteSteps[0]!);
}

function CellPaletteDemo({ initial }: { initial: number }) {
  const [val, setVal] = useState(() => snapToStep(initial));
  const bw = '1px solid white';
  const corner: React.CSSProperties = { position: 'absolute', width: 4, height: 4, pointerEvents: 'none' };

  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {paletteSteps.map(s => {
        const active = s === val;
        return (
          <div
            key={s}
            onClick={() => setVal(s)}
            style={{ position: 'relative', width: PCELL, height: PCELL, background: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            {active && <>
              <span style={{ ...corner, top: 0, left: 0,    borderTop: bw, borderLeft: bw }} />
              <span style={{ ...corner, top: 0, right: 0,   borderTop: bw, borderRight: bw }} />
              <span style={{ ...corner, bottom: 0, left: 0,  borderBottom: bw, borderLeft: bw }} />
              <span style={{ ...corner, bottom: 0, right: 0, borderBottom: bw, borderRight: bw }} />
            </>}
            <span style={{ ...MONO, fontSize: 10, color: grayColor(s), lineHeight: 1 }}>{s === 0 ? '•' : '∗'}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── C: Gradient Bar ───────────────────────────────────────────────────────────
// Thin gradient strip — click or drag to pick. Hairline thumb indicates position.

function GradientBarDemo({ initial }: { initial: number }) {
  const [val, setVal] = useState(initial);
  const barRef = useRef<HTMLDivElement>(null);

  function pick(clientX: number) {
    const bar = barRef.current;
    if (!bar) return;
    const { left, width } = bar.getBoundingClientRect();
    setVal(Math.round(Math.max(0, Math.min(1, (clientX - left) / width)) * 255));
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <div
        ref={barRef}
        style={{ position: 'relative', width: 140, height: 8, background: 'linear-gradient(to right, #000, #fff)', cursor: 'crosshair', flexShrink: 0 }}
        onPointerDown={e => { (e.currentTarget as Element).setPointerCapture(e.pointerId); pick(e.clientX); }}
        onPointerMove={e => { if (e.buttons) pick(e.clientX); }}
      >
        <div style={{
          position: 'absolute', top: -3, bottom: -3, width: 1,
          left: `${(val / 255) * 100}%`,
          background: val > 128 ? '#000' : '#fff',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }} />
      </div>
      <span style={{ ...MONO, fontSize: 12, color: '#888', minWidth: '3ch' }}>{val}</span>
    </div>
  );
}

// ── D: Density Chars ──────────────────────────────────────────────────────────
// Clickable ASCII block characters as preset brightness steps.
// ·  ░  ▒  ▓  █  — five levels, underlined when active.

const DENSITY = [
  { glyph: '·', v: 0 },
  { glyph: '░', v: 64 },
  { glyph: '▒', v: 128 },
  { glyph: '▓', v: 192 },
  { glyph: '█', v: 255 },
] as const;

function snapToDensity(v: number) {
  return DENSITY.reduce((b, d) => Math.abs(d.v - v) < Math.abs(b.v - v) ? d : b, DENSITY[0]!);
}

function DensityCharsDemo({ initial }: { initial: number }) {
  const [active, setActive] = useState(() => snapToDensity(initial));
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {DENSITY.map(d => (
        <span
          key={d.v}
          onClick={() => setActive(d)}
          style={{
            ...MONO,
            cursor: 'pointer',
            color: d === active ? 'white' : '#444',
            borderBottom: d === active ? '1px solid white' : '1px solid transparent',
            padding: '2px 5px 1px',
            userSelect: 'none',
          }}
        >
          {d.glyph}
        </span>
      ))}
    </div>
  );
}

// ── E: Rotary Knob ─────────────────────────────────────────────────────────────
// Canvas-rendered dial. Drag up to increase, down to decrease. Scroll also works.

const KR = 16;
const KSIZE = (KR + 4) * 2;

function RotaryDemo({ initial }: { initial: number }) {
  const [val, setVal] = useState(initial);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = KSIZE * dpr;
    canvas.height = KSIZE * dpr;
    canvas.style.width = `${KSIZE}px`;
    canvas.style.height = `${KSIZE}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = KSIZE / 2, cy = KSIZE / 2;
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const sweep = start + (val / 255) * (end - start);

    ctx.clearRect(0, 0, KSIZE, KSIZE);

    ctx.beginPath();
    ctx.arc(cx, cy, KR - 1, start, end);
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, KR - 1, start, sweep);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + (KR - 6) * Math.cos(sweep), cy + (KR - 6) * Math.sin(sweep));
    ctx.lineTo(cx + (KR + 1) * Math.cos(sweep), cy + (KR + 1) * Math.sin(sweep));
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [val]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <canvas
        ref={canvasRef}
        style={{ cursor: 'ns-resize', display: 'block' }}
        onPointerDown={e => { (e.currentTarget as Element).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: val }; }}
        onPointerMove={e => { if (!drag.current) return; setVal(Math.max(0, Math.min(255, drag.current.v - Math.round((e.clientY - drag.current.y) * 1.5)))); }}
        onPointerUp={() => { drag.current = null; }}
        onWheel={e => setVal(v => Math.max(0, Math.min(255, v - Math.sign(e.deltaY))))}
      />
      <span style={{ ...MONO, fontSize: 12, color: '#888', minWidth: '3ch' }}>{val}</span>
    </div>
  );
}

// ── F & G: Scrub Input (shared core) ─────────────────────────────────────────
// Click the text to enter edit mode; click-drag anywhere to scrub.
// When not editing: ew-resize cursor, pointer events blocked on the input so
// the wrapper captures all drags. Click without dragging focuses the input.

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
      style={{ ...MONO, display: 'inline-flex', alignItems: 'center', fontSize: 14, cursor: editing ? 'default' : 'ew-resize', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span style={{ color: '#555' }}>[</span>
      <input
        ref={inputRef}
        type="number"
        min={0} max={255}
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

function ScrubInputDemo({ initial }: { initial: number }) {
  const [val, setVal] = useState(initial);
  return <ScrubInput val={val} onChange={setVal} />;
}

// ── G: Char Preview ───────────────────────────────────────────────────────────
// Scrub input paired with a live •/∗ glyph rendered at actual brightness.

function CharPreviewDemo({ initial }: { initial: number }) {
  const [val, setVal] = useState(initial);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ ...MONO, fontSize: 20, color: grayColor(val), lineHeight: 1, width: '1ch', textAlign: 'center' }}>
        {val === 0 ? '•' : '∗'}
      </span>
      <ScrubInput val={val} onChange={setVal} />
    </span>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

function ColorValueDemo({ initial }: { initial: number }) {
  return <span style={{ ...MONO, color: '#444', fontSize: 12 }}>initial={initial}</span>;
}

const meta = {
  title: 'Design/ColorValue',
  component: ColorValueDemo,
  tags: [],
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: 'Five candidate designs for selecting a brightness value (0–255). All support an `initial` seed via the controls panel.',
      },
    },
  },
  argTypes: {
    initial: { control: { type: 'range', min: 0, max: 255, step: 1 }, description: 'Starting brightness.' },
  },
  args: { initial: 128 },
} satisfies Meta<typeof ColorValueDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `[ 128 ]` — drag left/right or scroll to change. No chrome, single line. */
export const A_Scrubber: Story = {
  name: 'A — Scrubber',
  render: ({ initial }) => <ScrubberDemo initial={initial} />,
};

/** Nine mini pixel cells 0→255. Active cell gets L-bracket cursor. */
export const B_CellPalette: Story = {
  name: 'B — Cell Palette',
  render: ({ initial }) => <CellPaletteDemo initial={initial} />,
};

/** 8px tall gradient strip — click or drag to set value. */
export const C_GradientBar: Story = {
  name: 'C — Gradient Bar',
  render: ({ initial }) => <GradientBarDemo initial={initial} />,
};

/** · ░ ▒ ▓ █ — five preset levels as ASCII block chars. */
export const D_DensityChars: Story = {
  name: 'D — Density Chars',
  render: ({ initial }) => <DensityCharsDemo initial={initial} />,
};

/** Canvas rotary dial. Drag up/down or scroll to adjust. */
export const E_Rotary: Story = {
  name: 'E — Rotary',
  render: ({ initial }) => <RotaryDemo initial={initial} />,
};

/** Bracket input with scrubbing — drag the `[` / `]` brackets to scrub, click the number to type. */
export const F_ScrubInput: Story = {
  name: 'F — Scrub Input',
  render: ({ initial }) => <ScrubInputDemo initial={initial} />,
};

/** Character preview alongside scrub input — glyph reflects brightness live. */
export const G_CharPreview: Story = {
  name: 'G — Char Preview',
  render: ({ initial }) => <CharPreviewDemo initial={initial} />,
};

/** All options stacked for direct comparison. */
export const Comparison: Story = {
  render: ({ initial }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
      {(
        [
          ['A — Scrubber',      <ScrubberDemo    key="a" initial={initial} />],
          ['B — Cell Palette',  <CellPaletteDemo key="b" initial={initial} />],
          ['C — Gradient Bar',  <GradientBarDemo key="c" initial={initial} />],
          ['D — Density Chars', <DensityCharsDemo key="d" initial={initial} />],
          ['E — Rotary',        <RotaryDemo      key="e" initial={initial} />],
          ['F — Scrub Input',   <ScrubInputDemo  key="f" initial={initial} />],
          ['G — Char Preview',  <CharPreviewDemo key="g" initial={initial} />],
        ] as [string, React.ReactNode][]
      ).map(([label, node]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ ...MONO, fontSize: 11, color: '#444', minWidth: 130 }}>{label}</span>
          {node}
        </div>
      ))}
    </div>
  ),
};
