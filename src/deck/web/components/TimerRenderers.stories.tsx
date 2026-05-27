import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { MatrixPreview } from './MatrixPreview.js';
import {
  renderElegantTimer,
  getElegantTimerMode,
  renderHourglassFrame,
  renderHourglassSpinning,
  HOURGLASS_ROTATION_STEPS,
  createHourglassTimerRenderer,
} from '../../../animations/timer-renderers.js';
import type { HourglassTimerRenderer } from '../../../animations/timer-renderers.js';

function toPixels(frame: Uint8Array): string {
  return btoa(String.fromCharCode(...frame));
}

// ── Speed controls (1x / 7x / 14x / 28x) ────────────────────────────────────

const SPEEDS = [1, 7, 14, 28] as const;
type Speed = (typeof SPEEDS)[number];

function SpeedButtons({ speed, onChange }: { speed: Speed; onChange: (s: Speed) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {SPEEDS.map(s => (
        <button
          key={s}
          aria-label={`Set speed to ${s}x`}
          aria-pressed={speed === s}
          onClick={() => onChange(s)}
          style={{
            fontFamily: 'monospace', fontSize: 11, cursor: 'pointer',
            color: speed === s ? '#fff' : '#888',
            background: 'none',
            border: `1px solid ${speed === s ? '#555' : '#333'}`,
            padding: '2px 8px',
          }}
        >{s}x</button>
      ))}
    </div>
  );
}

// ── Elegant timer — fixed-mode snapshots ─────────────────────────────────────

function ElegantAt({ remainingMs, label }: { remainingMs: number; label: string }) {
  const pixels = toPixels(renderElegantTimer(remainingMs));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <MatrixPreview pixels={pixels} width={9} />
      <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>{label}</span>
    </div>
  );
}

function ElegantStagesDemo() {
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <ElegantAt remainingMs={2 * 3_600_000 + 34 * 60_000} label="hh:mm (2h34m)" />
      <ElegantAt remainingMs={3 * 60_000 + 27_500} label="mm:ss (3m27s)" />
      <ElegantAt remainingMs={45_750} label="ss.cc (45.75s)" />
    </div>
  );
}

// ── Elegant timer — live countdown with speed control ────────────────────────

const ELEGANT_START_MS = 2 * 3_600_000; // 2h — spans all three modes on the way down

function ElegantLiveDemo() {
  const [speed, setSpeed] = useState<Speed>(1);
  const remainingRef = useRef(ELEGANT_START_MS);
  const [pixels, setPixels] = useState(() => toPixels(renderElegantTimer(remainingRef.current)));
  const [mode, setMode] = useState(() => getElegantTimerMode(remainingRef.current));

  useEffect(() => {
    const intervalMs = Math.round(100 / speed);

    const id = setInterval(() => {
      remainingRef.current = Math.max(0, remainingRef.current - 100 * speed);
      if (remainingRef.current === 0) remainingRef.current = ELEGANT_START_MS;
      setPixels(toPixels(renderElegantTimer(remainingRef.current)));
      setMode(getElegantTimerMode(remainingRef.current));
    }, intervalMs);

    return () => clearInterval(id);
  }, [speed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <MatrixPreview pixels={pixels} width={9} />
      <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>{mode}</span>
      <SpeedButtons speed={speed} onChange={setSpeed} />
    </div>
  );
}

// ── Hourglass — static stage snapshots ───────────────────────────────────────

function HourglassAt({ fraction, label }: { fraction: number; label: string }) {
  const pixels = toPixels(renderHourglassFrame(fraction));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <MatrixPreview pixels={pixels} width={9} />
      <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>{label}</span>
    </div>
  );
}

function HourglassStagesDemo() {
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {([0, 0.25, 0.5, 0.75, 1] as const).map(f => (
        <HourglassAt key={f} fraction={f} label={`${Math.round(f * 100)}%`} />
      ))}
    </div>
  );
}

// ── Hourglass — live countdown with speed control ────────────────────────────

const HOURGLASS_TOTAL_MS = 5 * 60_000; // 5-minute demo timer

function HourglassLiveDemo() {
  const [speed, setSpeed] = useState<Speed>(1);
  const rendererRef = useRef<HourglassTimerRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = createHourglassTimerRenderer();
  const remainingRef = useRef(HOURGLASS_TOTAL_MS);
  const [pixels, setPixels] = useState(() =>
    toPixels(rendererRef.current!.render(HOURGLASS_TOTAL_MS, HOURGLASS_TOTAL_MS)),
  );

  useEffect(() => {
    const intervalMs = Math.round(100 / speed);

    const id = setInterval(() => {
      remainingRef.current = Math.max(0, remainingRef.current - 100 * speed);
      setPixels(toPixels(rendererRef.current!.render(remainingRef.current, HOURGLASS_TOTAL_MS)));
    }, intervalMs);

    return () => clearInterval(id);
  }, [speed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <MatrixPreview pixels={pixels} width={9} />
      <SpeedButtons speed={speed} onChange={setSpeed} />
    </div>
  );
}

// ── Hourglass — completion flash cycle ───────────────────────────────────────
// Pre-expired renderer so the flash animation plays immediately on load.

function HourglassFlashDemo() {
  const [speed, setSpeed] = useState<Speed>(1);
  const rendererRef = useRef<HourglassTimerRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = createHourglassTimerRenderer();
  const [pixels, setPixels] = useState(() =>
    toPixels(rendererRef.current!.render(0, HOURGLASS_TOTAL_MS)),
  );

  useEffect(() => {
    const intervalMs = Math.round(100 / speed);

    const id = setInterval(() => {
      setPixels(toPixels(rendererRef.current!.render(0, HOURGLASS_TOTAL_MS)));
    }, intervalMs);

    return () => clearInterval(id);
  }, [speed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <MatrixPreview pixels={pixels} width={9} />
      <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>completion flash</span>
      <SpeedButtons speed={speed} onChange={setSpeed} />
    </div>
  );
}

// ── Hourglass — reset rotation loop ──────────────────────────────────────────
// Cycles through the 9-step column-by-column flip, center-outward.

function HourglassResetDemo() {
  const [speed, setSpeed] = useState<Speed>(1);
  const stepRef = useRef(0);
  const [pixels, setPixels] = useState(() => toPixels(renderHourglassSpinning(0)));

  useEffect(() => {
    const intervalMs = Math.round(100 / speed);

    const id = setInterval(() => {
      setPixels(toPixels(renderHourglassSpinning(stepRef.current)));
      stepRef.current = (stepRef.current + 1) % HOURGLASS_ROTATION_STEPS;
    }, intervalMs);

    return () => clearInterval(id);
  }, [speed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <MatrixPreview pixels={pixels} width={9} />
      <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>reset rotation</span>
      <SpeedButtons speed={speed} onChange={setSpeed} />
    </div>
  );
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'App/HUD/TimerRenderers',
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: [
          'Timer renderer previews for the two HUD timer styles.',
          '',
          '**elegant** — auto-selects display mode from remaining time: HH:MM (≥1h), MM:SS (≥1m), SS.CC (<1m). Orbit dots sweep the perimeter to show sub-unit progress.',
          '',
          '**hourglass** — sand drains top-to-bottom proportional to elapsed time. On expiry: 7 rapid flashes, 1 s hold lit, 180° CW spin, center-out bottom drain, then countdown resumes.',
        ].join('\n'),
      },
    },
  },
  component: ElegantStagesDemo,
} satisfies Meta<typeof ElegantStagesDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Elegant timer at fixed snapshots for each display mode. */
export const ElegantStages: Story = {
  render: () => <ElegantStagesDemo />,
};

/**
 * Elegant timer counting down from 2h through all three display modes.
 * Speed up to watch the HH:MM → MM:SS → SS.CC transitions.
 */
export const ElegantLive: Story = {
  render: () => <ElegantLiveDemo />,
};

/** Hourglass at 0%, 25%, 50%, 75%, and 100% elapsed. */
export const HourglassStages: Story = {
  render: () => <HourglassStagesDemo />,
};

/**
 * Hourglass counting down a 5-minute timer. Sand drains top → bottom.
 * Use 14x or 28x to reach expiry quickly and see the flash cycle.
 */
export const HourglassLive: Story = {
  render: () => <HourglassLiveDemo />,
};

/**
 * Hourglass completion flash — 7 rapid flashes then 1 s held lit, fires when
 * the timer expires. Pre-expired so it plays immediately. Slow it down with 1x
 * to see individual frames; speed up with 28x to watch it loop.
 */
export const HourglassFlash: Story = {
  render: () => <HourglassFlashDemo />,
};

/**
 * Reset rotation — the column-by-column flip (center-outward) that plays after
 * the completion flash when a timer repeats. Loops continuously so you can
 * study each step. Use 1x to see individual columns flip.
 */
export const HourglassReset: Story = {
  render: () => <HourglassResetDemo />,
};
