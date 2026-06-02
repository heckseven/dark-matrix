import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatrixPreview } from './MatrixPreview.js';

// ── Grid ──────────────────────────────────────────────────────────────────

const COLS     = 9;
const ROWS     = 34;
const FIRE_TOP = 6;             // rows 0–4: temp digits; row 5: gap; rows 6–33: fire
const FIRE_H   = ROWS - FIRE_TOP; // 28 rows of fire zone
const TICK_MS  = 50;            // 20 fps — fire needs to move

// ── Digit glyphs — same encoding as heatcore (2 cols × 5 rows, col-major) ─

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

function drawTemp(buf: Uint8Array, tempC: number): void {
  const t = Math.max(0, Math.min(199, Math.round(tempC)));
  if (t >= 100) drawDigit(buf, Math.floor(t / 100), 0);
  drawDigit(buf, Math.floor((t % 100) / 10), 3);
  drawDigit(buf, t % 10, 6);
}

function toB64(buf: Uint8Array): string {
  return btoa(Array.from(buf, b => String.fromCharCode(b)).join(''));
}

// ── Fire buffer ───────────────────────────────────────────────────────────
// Separate float heat buffer: COLS × FIRE_H, col-major.
// fireBuf[col * FIRE_H + fRow], fRow 0 = top of fire zone (display row 6),
// fRow FIRE_H-1 = bottom (display row 33). Heat values 0–1.

function makeFirBuf(): Float32Array { return new Float32Array(COLS * FIRE_H); }

function seedBottom(buf: Float32Array, load: number): void {
  for (let col = 0; col < COLS; col++) {
    buf[col * FIRE_H + (FIRE_H - 1)] = load;
    buf[col * FIRE_H + (FIRE_H - 2)] = load * (0.82 + Math.random() * 0.18);
  }
}

// Stochastic blit: each pixel is lit with probability = its heat value.
// This creates a density gradient — near-base cells almost always lit,
// mid-flame cells ~50% lit, tips sparse and constantly flickering.
function commitFire(fireBuf: Float32Array, frame: Uint8Array): void {
  for (let col = 0; col < COLS; col++) {
    for (let fRow = 0; fRow < FIRE_H; fRow++) {
      if ((fireBuf[col * FIRE_H + fRow] ?? 0) > Math.random()) {
        frame[col * ROWS + FIRE_TOP + fRow] = 255;
      }
    }
  }
}

// Standard DOOM propagation: top-down so each row reads unmodified values
// from below. drift() returns ±column offset; decay() returns heat loss.
function doomStep(
  buf: Float32Array,
  drift: () => number,
  decay: () => number,
): void {
  for (let fRow = 0; fRow < FIRE_H - 1; fRow++) {
    for (let col = 0; col < COLS; col++) {
      const srcCol = Math.max(0, Math.min(COLS - 1, col + drift()));
      const heat   = buf[srcCol * FIRE_H + fRow + 1] ?? 0;
      buf[col * FIRE_H + fRow] = Math.max(0, heat - decay());
    }
  }
}

// ── Shared animation loop ─────────────────────────────────────────────────

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
  }, []); // loadRef/tempRef/tickRef are stable refs — intentionally excluded from deps

  return pixels;
}

// ── Variant 1: plasma — classic DOOM heat diffusion ───────────────────────
// The canonical pixel art fire algorithm. Random ±1 column drift, small
// uniform decay per row. Stochastic rendering turns the heat gradient into
// a density gradient: solid at the base, half-lit mid-flame, sparse tips.
// Decay ~0.025/row → fire reaches top at ~70% load; starts as embers at ~5%.

function usePlasmaFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const buf = useRef(makeFirBuf());
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    seedBottom(buf.current, load);
    doomStep(
      buf.current,
      () => Math.floor(Math.random() * 3) - 1,  // −1, 0, +1
      () => Math.random() * 0.03 + 0.01,         // 0.01–0.04 avg ≈ 0.025
    );
    commitFire(buf.current, frame);
  });
}

// ── Variant 2: gust — wind-blown DOOM ─────────────────────────────────────
// Same as plasma but drift is biased by a slow-oscillating wind signal.
// The whole fire leans left, then right in a ~12 s cycle. At high load the
// lean is subtle; at low load a single gust can briefly snuff the tips.

function useGustFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const buf  = useRef(makeFirBuf());
  const tRef = useRef(0);
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    tRef.current += 0.025;
    const wind = Math.sin(tRef.current) * 1.3; // −1.3 … +1.3
    seedBottom(buf.current, load);
    doomStep(
      buf.current,
      () => {
        const base = Math.floor(Math.random() * 3) - 1;
        return Math.max(-2, Math.min(2, base + Math.round(wind)));
      },
      () => Math.random() * 0.03 + 0.01,
    );
    commitFire(buf.current, frame);
  });
}

// ── Variant 3: torch — three hot-spot columns ─────────────────────────────
// Columns 1, 4, and 7 are seeded at ~1.5× intensity; the columns between
// them receive ~0.35×. At medium load you see three distinct flame tongues.
// At full load the gaps fill in. At low load it's three separate sparks.

function useTorchFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const buf = useRef(makeFirBuf());
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    for (let col = 0; col < COLS; col++) {
      const hot = col === 1 || col === 4 || col === 7;
      const scale  = hot ? 1.4 + Math.random() * 0.2 : 0.3 + Math.random() * 0.15;
      const heat   = Math.min(1, load * scale);
      buf.current[col * FIRE_H + (FIRE_H - 1)] = heat;
      buf.current[col * FIRE_H + (FIRE_H - 2)] = heat * (0.85 + Math.random() * 0.15);
    }
    doomStep(
      buf.current,
      () => Math.floor(Math.random() * 3) - 1,
      () => Math.random() * 0.035 + 0.015, // slightly faster decay keeps columns separate
    );
    commitFire(buf.current, frame);
  });
}

// ── Variant 4: frantic — wide drift, high turbulence ─────────────────────
// Drift ±2 instead of ±1, higher decay. Fire stays shorter and spreads
// wider horizontally — chaotic, choppy, high-frequency flicker. Looks less
// like a steady flame and more like something rapidly burning.

function useFranticFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const buf = useRef(makeFirBuf());
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    // Overseed slightly to compensate for the higher per-row decay
    for (let col = 0; col < COLS; col++) {
      const heat = Math.min(1, load * 1.25);
      buf.current[col * FIRE_H + (FIRE_H - 1)] = heat;
      buf.current[col * FIRE_H + (FIRE_H - 2)] = heat * (0.8 + Math.random() * 0.2);
    }
    doomStep(
      buf.current,
      () => Math.floor(Math.random() * 5) - 2,  // −2, −1, 0, +1, +2
      () => Math.random() * 0.06 + 0.025,        // 0.025–0.085 avg ≈ 0.055
    );
    commitFire(buf.current, frame);
  });
}

// ── Variant 5: pulse — rhythmically surging base heat ─────────────────────
// Standard DOOM propagation but the seed intensity oscillates ±30% around
// `load` at ~0.2 Hz. The fire breathes — rising to full blaze then pulling
// back to embers on a ~5 s cycle. Most visible at 30–70% load.

function usePulseFire(loadRef: RefObject<number>, tempRef: RefObject<number>): string {
  const buf  = useRef(makeFirBuf());
  const tRef = useRef(0);
  return useFireLoop(loadRef, tempRef, (load, frame) => {
    tRef.current += 0.065;
    const scale = 1.0 + 0.3 * Math.sin(tRef.current * 2.5); // 0.7 … 1.3
    seedBottom(buf.current, Math.min(1, load * scale));
    doomStep(
      buf.current,
      () => Math.floor(Math.random() * 3) - 1,
      () => Math.random() * 0.03 + 0.01,
    );
    commitFire(buf.current, frame);
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

  const plasmaPx  = usePlasmaFire(loadRef,  tempRef);
  const gustPx    = useGustFire(loadRef,    tempRef);
  const torchPx   = useTorchFire(loadRef,   tempRef);
  const franticPx = useFranticFire(loadRef, tempRef);
  const pulsePx   = usePulseFire(loadRef,   tempRef);

  const variants = [
    { name: 'plasma',  px: plasmaPx  },
    { name: 'gust',    px: gustPx    },
    { name: 'torch',   px: torchPx   },
    { name: 'frantic', px: franticPx },
    { name: 'pulse',   px: pulsePx   },
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
  // stories (ClaudeWidgets, TimerRenderers).
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: [
          'Five fire visualization variants for a GPU/dGPU usage widget.',
          '',
          'All variants use a DOOM-style heat buffer with **stochastic rendering**:',
          'each pixel is lit with probability equal to its heat value, creating a',
          'density gradient — solid at base, half-lit in the body, sparse flickering tips.',
          '',
          '**plasma** — canonical DOOM CA; random ±1 column drift, small decay.',
          '**gust** — wind-blown; drift biased by a slow sine wave, fire leans and shifts.',
          '**torch** — three hotspot columns (1, 4, 7) create distinct flame tongues.',
          '**frantic** — wider ±2 drift, higher decay; chaotic, choppy, fast-flickering.',
          '**pulse** — base heat surges ±30% at ~0.2 Hz; fire breathes in and out.',
          '',
          'Temperature uses the same 2×5 heatcore digit glyphs.',
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

/** Idle state (~12% load, 45°C) — embers and occasional sparks at low intensity. */
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
