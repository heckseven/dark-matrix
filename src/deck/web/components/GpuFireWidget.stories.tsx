import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatrixPreview } from './MatrixPreview.js';

// ── Grid ──────────────────────────────────────────────────────────────────

const COLS       = 9;
const ROWS       = 34;
const FIRE_TOP   = 6;             // rows 0–4: temp digits; row 5: gap; rows 6–33: fire
const FIRE_H     = ROWS - FIRE_TOP; // 28 rows of fire zone
const TICK_MS    = 80;            // ~12.5 fps
const MAX_SPARKS = 60;            // steady-state ceiling at full load (~3.5/tick × ~17-tick lifetime)

// ── Digit glyphs — same encoding as heatcore (2 cols × 5 rows, col-major) ─
// glyph[col * 5 + row], col ∈ {0,1}, row ∈ {0..4}

const GLYPHS: ReadonlyArray<readonly number[]> = [
  [1,1,1,1,1, 1,1,1,1,1], // 0
  [1,1,1,1,1, 0,0,0,0,0], // 1
  [1,0,1,1,1, 1,1,0,0,1], // 2
  [1,0,1,0,1, 1,1,1,1,1], // 3
  [1,1,1,0,0, 0,1,1,1,1], // 4
  [1,1,1,0,1, 1,0,1,1,0], // 5
  [1,1,1,1,1, 0,0,1,1,1], // 6
  [1,0,0,0,0, 1,1,1,1,1], // 7
  [1,0,1,1,1, 1,0,1,1,1], // 8
  [1,1,1,0,0, 1,1,1,1,1], // 9
];

function drawDigit(buf: Uint8Array, digit: number, colStart: number): void {
  const g = GLYPHS[Math.max(0, Math.min(9, digit))]!;
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 5; r++) {
      if (g[c * 5 + r] && colStart + c < COLS) {
        buf[(colStart + c) * ROWS + r] = 255;
      }
    }
  }
}

// Three digit positions: hundreds @ cols 0–1, tens @ cols 3–4, ones @ cols 6–7.
// Hundreds slot is blank when temp < 100 so "72°" reads as [  ][7][2].
function drawTemp(buf: Uint8Array, tempC: number): void {
  const t = Math.max(0, Math.min(199, Math.round(tempC)));
  if (t >= 100) drawDigit(buf, Math.floor(t / 100), 0);
  drawDigit(buf, Math.floor((t % 100) / 10), 3);
  drawDigit(buf, t % 10, 6);
}

// Array.from avoids spread-argument stack limits on large Uint8Arrays.
function toB64(buf: Uint8Array): string {
  return btoa(Array.from(buf, b => String.fromCharCode(b)).join(''));
}

// ── Shared animation loop ─────────────────────────────────────────────────
// Drives setInterval, writes the temperature overlay, and commits each frame.
// `tick` receives the current load (0–1) and writes pixel values into `frame`.
// loadRef/tempRef/tickRef are stable refs — intentionally excluded from deps.

function useFireLoop(
  loadRef: RefObject<number>,
  tempRef: RefObject<number>,
  tick: (load: number, frame: Uint8Array) => void,
): string {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const [pixels, setPixels] = useState(() => toB64(new Uint8Array(COLS * ROWS)));

  useEffect(() => {
    const id = setInterval(() => {
      const frame = new Uint8Array(COLS * ROWS);
      tickRef.current(loadRef.current ?? 0, frame);
      drawTemp(frame, tempRef.current ?? 72);
      setPixels(toB64(frame));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return pixels;
}

// ── Variant 1: doom — heat-diffusion cellular automaton ───────────────────
// Bottom rows seeded at `load` intensity; heat diffuses upward with random
// sideways spread and per-step decay. Organic, non-uniform edge turbulence.

function useDoomFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const grid = useRef(new Float32Array(COLS * ROWS));
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    const g = grid.current;

    for (let col = 0; col < COLS; col++) {
      g[col * ROWS + (ROWS - 1)] = load;
      g[col * ROWS + (ROWS - 2)] = load * (0.85 + Math.random() * 0.15);
    }

    for (let row = ROWS - 2; row >= FIRE_TOP; row--) {
      for (let col = 0; col < COLS; col++) {
        const below = g[col * ROWS + row + 1] ?? 0;
        const l     = g[Math.max(0, col - 1) * ROWS + row + 1] ?? 0;
        const r     = g[Math.min(COLS - 1, col + 1) * ROWS + row + 1] ?? 0;
        const rnd   = Math.random();
        const src   = rnd < 0.25 ? l : rnd < 0.5 ? r : below;
        g[col * ROWS + row] = Math.max(0, src - (0.025 + Math.random() * 0.018));
      }
    }

    for (let i = 0; i < COLS * ROWS; i++) {
      if ((g[i] ?? 0) > 0.14) frame[i] = 255;
    }
  });
}

// ── Variant 2: pillar — independent column heights with tip flicker ────────
// Each column eases toward a load-modulated target with a per-column sine
// phase offset, giving a candelabra feel at medium loads.

const PILLAR_PHASES = [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9, 5.6] as const;

function usePillarFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const heights = useRef(new Float32Array(COLS));
  const tRef    = useRef(0);
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    tRef.current += 0.14;
    const t = tRef.current;
    const h = heights.current;

    for (let col = 0; col < COLS; col++) {
      const osc = Math.sin(t + (PILLAR_PHASES[col] ?? 0)) * 0.11 * Math.sqrt(load);
      const tgt = Math.max(0, Math.min(1, load + osc));
      h[col] = (h[col] ?? 0) * 0.84 + tgt * 0.16;
    }

    for (let col = 0; col < COLS; col++) {
      const fireRows = Math.round((h[col] ?? 0) * (FIRE_H - 1));
      const solidTop = Math.max(FIRE_TOP, ROWS - fireRows);

      for (let row = solidTop; row < ROWS; row++) frame[col * ROWS + row] = 255;

      const rnd = Math.random();
      if (rnd < 0.45 && solidTop > FIRE_TOP)
        frame[col * ROWS + (solidTop - 1)] = 255;
      if (rnd < 0.18 && solidTop > FIRE_TOP + 1)
        frame[col * ROWS + (solidTop - 2)] = 255;
    }
  });
}

// ── Variant 3: sparks — upward particle shower ────────────────────────────
// Sparse at idle, dense at full load. Very different rhythm from the CA variants.

type Spark = { col: number; row: number; speed: number };

function useSparkFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const sparks = useRef<Spark[]>([]);
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    const s = sparks.current;

    for (const sp of s) {
      sp.row -= sp.speed;
      if (Math.random() < 0.22)
        sp.col = Math.max(0, Math.min(COLS - 1, sp.col + (Math.random() < 0.5 ? -1 : 1)));
    }

    sparks.current = s.filter(sp => sp.row >= FIRE_TOP);

    const mean  = load * 3.5;
    const count = Math.floor(mean) + (Math.random() < mean % 1 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      sparks.current.push({
        col:   Math.floor(Math.random() * COLS),
        row:   ROWS - 1 - Math.floor(Math.random() * 3),
        speed: 0.4 + Math.random() * 1.2 * load,
      });
    }

    if (sparks.current.length > MAX_SPARKS)
      sparks.current = sparks.current.slice(-MAX_SPARKS);

    for (const sp of sparks.current) {
      const row = Math.round(sp.row);
      if (row >= FIRE_TOP && row < ROWS) frame[sp.col * ROWS + row] = 255;
    }
  });
}

// ── Variant 4: bloom — solid base with stochastic dithered top edge ───────
// Dense lit block grows upward from the bottom; the top portion re-dithers
// every frame, giving a soft feathered edge.

function useBloomFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    const totalH = Math.round(load * FIRE_H);
    const solidH = Math.round(totalH * 0.65);
    const edgeH  = totalH - solidH;

    for (let col = 0; col < COLS; col++) {
      for (let i = 0; i < solidH; i++) {
        const row = ROWS - 1 - i;
        if (row >= FIRE_TOP) frame[col * ROWS + row] = 255;
      }
      for (let i = 0; i <= edgeH + 2; i++) {
        const row = ROWS - 1 - solidH - i;
        if (row < FIRE_TOP) break;
        const prob = Math.max(0, 1 - i / (edgeH + 1));
        if (Math.random() < prob) frame[col * ROWS + row] = 255;
      }
    }
  });
}

// ── Variant 5: wave — sinusoidal top edge with full-column fill ───────────
// Two sine waves (different freq/phase per column) define the flame contour;
// everything below is lit, making it breathe as a single shape.

function useWaveFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const tRef = useRef(0);
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    tRef.current += 0.11;
    const t     = tRef.current;
    const baseH = load * FIRE_H * 0.83;

    for (let col = 0; col < COLS; col++) {
      const w1     = Math.sin(t * 1.8 + col * 0.85) * 2.5 * Math.sqrt(load);
      const w2     = Math.sin(t * 0.55 + col * 1.6) * 3.0 * Math.sqrt(load);
      const h      = Math.max(0, Math.round(baseH + w1 + w2));
      const topRow = Math.max(FIRE_TOP, ROWS - h);

      for (let row = topRow; row < ROWS; row++) frame[col * ROWS + row] = 255;

      if (topRow > FIRE_TOP && Math.random() < 0.42)
        frame[col * ROWS + (topRow - 1)] = 255;
    }
  });
}

// ── Slider ────────────────────────────────────────────────────────────────

function Slider({ label, min, max, value, onChange, unit }: {
  label: string; min: number; max: number; value: number;
  onChange: (v: number) => void; unit?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'monospace', fontSize: 11, color: '#aaa' }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range" min={min} max={max} value={value}
        aria-valuetext={`${value}${unit ?? ''}`}
        aria-describedby={`${id}-val`}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 110 }}
      />
      <span
        id={`${id}-val`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ color: '#ccc', minWidth: 36 }}
      >
        {value}{unit ?? ''}
      </span>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

function GpuFireWidget({ initLoad = 60, initTemp = 72 }: { initLoad?: number; initTemp?: number }) {
  const [loadPct, setLoadPct] = useState(initLoad);
  const [tempC, setTempC]     = useState(initTemp);

  // Mutable refs so interval callbacks always read the latest values without
  // restarting the interval on every slider change.
  const loadRef = useRef(loadPct / 100);
  const tempRef = useRef(tempC);
  loadRef.current = loadPct / 100;
  tempRef.current = tempC;

  const doomPx   = useDoomFire(loadRef,   tempRef);
  const pillarPx = usePillarFire(loadRef, tempRef);
  const sparkPx  = useSparkFire(loadRef,  tempRef);
  const bloomPx  = useBloomFire(loadRef,  tempRef);
  const wavePx   = useWaveFire(loadRef,   tempRef);

  const variants = [
    { name: 'doom',   px: doomPx   },
    { name: 'pillar', px: pillarPx },
    { name: 'sparks', px: sparkPx  },
    { name: 'bloom',  px: bloomPx  },
    { name: 'wave',   px: wavePx   },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Slider label="gpu load" min={0} max={100} value={loadPct} onChange={setLoadPct} unit="%" />
        <Slider label="temp"     min={0} max={150} value={tempC}   onChange={setTempC}   unit="°" />
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
        {variants.map(v => (
          <figure
            key={v.name}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: 0 }}
          >
            <MatrixPreview pixels={v.px} width={9} />
            <figcaption style={{ color: '#999', fontSize: 11, fontFamily: 'monospace' }}>
              {v.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────

const meta = {
  title: 'App/HUD/GpuFireWidget',
  // No `tags: ['autodocs']` — mirrors the no-autodocs convention for HUD widget
  // stories (ClaudeWidgets, TimerRenderers). initLoad/initTemp are wired as
  // Storybook controls so the preset stories can be adjusted interactively.
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: [
          'Five fire visualization variants for a GPU/dGPU usage widget.',
          '',
          '**doom** — heat-diffusion CA; organic, non-uniform.',
          '**pillar** — per-column height with sine oscillation; candelabra feel.',
          '**sparks** — upward particle shower; sparse at idle, dense at full load.',
          '**bloom** — solid base + dithered top edge; soft feathered shape.',
          '**wave** — sinusoidal contour fill; single breathing fire shape.',
          '',
          'Temperature (top) uses the same 2×5 heatcore digit glyphs.',
          'Three digit slots: hundreds (blank <100°), tens, ones.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    initLoad: { control: { type: 'range', min: 0, max: 100 }, description: 'Initial GPU load %' },
    initTemp: { control: { type: 'range', min: 0, max: 150 }, description: 'Initial temperature °C' },
  },
  component: GpuFireWidget,
} satisfies Meta<typeof GpuFireWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All five variants side by side — use the sliders to compare across load levels. */
export const AllVariants: Story = {
  args: { initLoad: 60, initTemp: 72 },
};

/** Idle state (~12% load, 45°C) — spark vs. ember character at low intensity. */
export const Idle: Story = {
  args: { initLoad: 12, initTemp: 45 },
};

/** Medium load (55%, 72°C) — good baseline for comparing shape and rhythm. */
export const Medium: Story = {
  args: { initLoad: 55, initTemp: 72 },
};

/** Full blaze (100%, 94°C) — flame reaches or kisses the temperature digits. */
export const FullBlaze: Story = {
  args: { initLoad: 100, initTemp: 94 },
};
