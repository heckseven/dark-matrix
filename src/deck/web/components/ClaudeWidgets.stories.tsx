import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatrixPreview } from './MatrixPreview.js';
import {
  createClaudeTetrisRenderer,
  createClaudeSandRenderer,
} from '../../../animations/claude-renderers.js';
import type { ClaudeRendererApi } from '../../../animations/claude-renderers.js';

function toPixels(frame: Uint8Array): string {
  return btoa(String.fromCharCode(...frame));
}

function useRenderer(
  factory: () => ClaudeRendererApi,
  intervalMs: number,
  onTick?: (r: ClaudeRendererApi, tick: number) => void,
): string {
  const rendererRef = useRef<ClaudeRendererApi | null>(null);
  if (!rendererRef.current) rendererRef.current = factory();
  const tickRef = useRef(0);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const [pixels, setPixels] = useState(() => toPixels(rendererRef.current!.render()));

  useEffect(() => {
    const r = rendererRef.current!;
    const id = setInterval(() => {
      tickRef.current++;
      onTickRef.current?.(r, tickRef.current);
      setPixels(toPixels(r.render()));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  useEffect(() => () => rendererRef.current?.stop(), []);

  return pixels;
}

function SpeedButtons({ speed, onChange }: { speed: number; onChange: (s: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {([1, 7] as const).map(s => (
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

// ── Tetris ────────────────────────────────────────────────────────────────

function TetrisDemo() {
  const [speed, setSpeed] = useState(1);
  const pixels = useRenderer(
    createClaudeTetrisRenderer,
    Math.round(100 / speed),
    (r, tick) => {
      if (tick % 6 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'story' });
    },
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <MatrixPreview pixels={pixels} width={9} />
      <SpeedButtons speed={speed} onChange={setSpeed} />
    </div>
  );
}

// ── Sand ──────────────────────────────────────────────────────────────────

function SandDemo() {
  const pixels = useRenderer(
    createClaudeSandRenderer,
    100,
    (r, tick) => {
      if (tick % 6 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'story' });
    },
  );
  return <MatrixPreview pixels={pixels} width={9} />;
}

function SandBurst() {
  const pixels = useRenderer(
    createClaudeSandRenderer,
    100,
    (r, tick) => {
      // Burst of agent_spawn events to fill quickly and show drain
      if (tick % 2 === 0) r.onEvent({ type: 'agent_spawn', sessionId: 'story' });
    },
  );
  return <MatrixPreview pixels={pixels} width={9} />;
}

// ── Side-by-side ──────────────────────────────────────────────────────────

function BothDemo() {
  const tetrisPixels = useRenderer(
    createClaudeTetrisRenderer,
    100,
    (r, tick) => {
      if (tick % 6 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'story' });
    },
  );
  const sandPixels = useRenderer(
    createClaudeSandRenderer,
    100,
    (r, tick) => {
      if (tick % 6 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'story' });
    },
  );
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <MatrixPreview pixels={sandPixels} width={9} />
        <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>sand</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <MatrixPreview pixels={tetrisPixels} width={9} />
        <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>tetris</span>
      </div>
    </div>
  );
}

// ── 5h Hourglass ──────────────────────────────────────────────────────────
// Cell positions are derived directly from the user's hourglass.dmx.json design.
// Frame 2 = starting state (top full), Frame 4 = completion state (bottom full).

const _HG_BOUNDARY_PIXELS = '////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////////////8AAAAAAAAAAAAAAAAAAP//////////////////////////////AAAAAAAAAAD/////////////////////////////////////AAAAAP////////////////////////////////////////////////////////////////////////////////////8AAAAA/////////////////////////////////////wAAAAAAAAAA//////////////////////////////8AAAAAAAAAAAAAAAAAAP////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////';
const _HG_START_PIXELS    = '////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAA////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAP//////////////////////AAAAAAAAAAAAAAAAAAAAAAD///////////////////8AAAAAAAAAAAAAAAAAAAAAAAAA/////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const _HG_FULL_PIXELS     = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////////////AAAAAAAAAAAAAAAAAAAAAAAAAP///////////////////wAAAAAAAAAAAAAAAAAAAAAA//////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAA////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAA/////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////';
const _HG_COL_ORDER = [4, 3, 5, 2, 6, 1, 7, 0, 8]; // center-outward

function _makeHgInitialSettled(): Uint8Array {
  const buf = Uint8Array.from(atob(_HG_START_PIXELS), c => c.charCodeAt(0));
  const s = new Uint8Array(9 * 34);
  for (let i = 0; i < 9 * 34; i++) if ((buf[i] ?? 0) > 0) s[i] = 1;
  return s;
}

function useHourglassSand(intervalMs: number): string {
  const boundaryRef = useRef<Uint8Array | null>(null);
  if (!boundaryRef.current)
    boundaryRef.current = Uint8Array.from(atob(_HG_BOUNDARY_PIXELS), c => c.charCodeAt(0));
  const settledRef = useRef<Uint8Array | null>(null);
  if (!settledRef.current) settledRef.current = _makeHgInitialSettled();

  const [pixels, setPixels] = useState(() => {
    const settled = settledRef.current!;
    const frame = new Uint8Array(9 * 34);
    for (let i = 0; i < 9 * 34; i++) if (settled[i]) frame[i] = 200;
    return btoa(String.fromCharCode(...frame));
  });

  useEffect(() => {
    const id = setInterval(() => {
      const settled = settledRef.current!;
      const boundary = boundaryRef.current!;
      const inBounds = (c: number, r: number) =>
        c >= 0 && c < 9 && r >= 0 && r < 34 && (boundary[c * 34 + r] ?? 0) > 0;

      // Two-buffer CA: check settled (original) for sources, next for destinations.
      // Prevents chain reactions — each grain moves at most one step per tick.
      const next = new Uint8Array(9 * 34);
      let anyMoved = false;

      for (let row = 33; row >= 0; row--) {
        for (const col of _HG_COL_ORDER) {
          const idx = col * 34 + row;
          if (!settled[idx]) continue;
          const nr = row + 1;
          if (nr >= 34) { next[idx] = 1; continue; }

          const downIdx = col * 34 + nr;
          if (inBounds(col, nr) && !settled[downIdx] && !next[downIdx]) {
            next[downIdx] = 1; anyMoved = true; continue;
          }
          const dirs: [-1 | 1, 1 | -1] = Math.random() < 0.5 ? [-1, 1] : [1, -1];
          let fell = false;
          for (const d of dirs) {
            const nc = col + d;
            const diagIdx = nc * 34 + nr;
            if (inBounds(nc, nr) && !settled[diagIdx] && !next[diagIdx]) {
              next[diagIdx] = 1; anyMoved = true; fell = true; break;
            }
          }
          if (!fell) next[idx] = 1;
        }
      }

      settledRef.current = anyMoved ? next : _makeHgInitialSettled();
      const frame = new Uint8Array(9 * 34);
      for (let i = 0; i < 9 * 34; i++) if (settledRef.current[i]) frame[i] = 200;
      setPixels(btoa(String.fromCharCode(...frame)));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return pixels;
}

function _buildHgCells(pixels: string, rowFrom: number, rowTo: number): [number, number][] {
  const buf = Uint8Array.from(atob(pixels), c => c.charCodeAt(0));
  const cells: [number, number][] = [];
  const step = rowFrom <= rowTo ? 1 : -1;
  for (let row = rowFrom; row !== rowTo + step; row += step) {
    for (const col of _HG_COL_ORDER) {
      if ((buf[col * 34 + row] ?? 0) > 0) cells.push([col, row]);
    }
  }
  return cells;
}

const _HG_TOP_CELLS    = _buildHgCells(_HG_START_PIXELS, 0, 16);   // top → neck (drain order)
const _HG_BOTTOM_CELLS = _buildHgCells(_HG_FULL_PIXELS,  33, 17);  // bottom → neck (fill order)

function renderHourglass5h(usagePct: number): string {
  const frame = new Uint8Array(9 * 34);
  const elapsed = Math.round(Math.max(0, Math.min(1, usagePct)) * _HG_TOP_CELLS.length);
  for (let i = elapsed; i < _HG_TOP_CELLS.length; i++) {
    const [c, r] = _HG_TOP_CELLS[i]!;
    frame[c * 34 + r] = 200;
  }
  for (let i = 0; i < elapsed && i < _HG_BOTTOM_CELLS.length; i++) {
    const [c, r] = _HG_BOTTOM_CELLS[i]!;
    frame[c * 34 + r] = 200;
  }
  return btoa(String.fromCharCode(...frame));
}

function HourglassAt({ pct }: { pct: number }) {
  const h = Math.floor(pct * 5);
  const m = Math.round((pct * 5 - h) * 60);
  const label = m === 0 ? `${h}h` : `${h}h${m}m`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <MatrixPreview pixels={renderHourglass5h(pct)} width={9} />
      <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>{label}</span>
    </div>
  );
}

function HourglassStagesDemo() {
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {([0, 0.25, 0.5, 0.75, 1] as const).map(pct => (
        <HourglassAt key={pct} pct={pct} />
      ))}
    </div>
  );
}

function HourglassCycleDemo() {
  const [speed, setSpeed] = useState(1);
  const pixels = useHourglassSand(Math.round(100 / speed));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <MatrixPreview pixels={pixels} width={9} />
      <SpeedButtons speed={speed} onChange={setSpeed} />
    </div>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────

const meta = {
  title: 'App/HUD/ClaudeWidgets',
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: [
          'Live previews of the two Claude HUD widget animations.',
          '',
          '**sand** — grains fall from the center column on each tool-use event and pile up hourglass-style. When the pile reaches the top row the settled cells drain off the bottom, then accumulation resumes.',
          '',
          '**tetris** — autonomous simulation of an imperfect Tetris player. The AI places pieces to fill the lowest area (70%) or makes a random mistake (30%). Line clears flash before the rows collapse. A full board triggers a dissolve-and-restart.',
        ].join('\n'),
      },
    },
  },
  component: BothDemo,
} satisfies Meta<typeof BothDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Sand and tetris side by side at steady tool-use cadence. */
export const Both: Story = {
  render: () => <BothDemo />,
};

/** Tetris only — autonomous imperfect player. */
export const Tetris: Story = {
  render: () => <TetrisDemo />,
};

/** Sand — steady tool-use cadence (1 grain burst every 600 ms). */
export const Sand: Story = {
  render: () => <SandDemo />,
};

/**
 * Sand — rapid agent_spawn events every 200 ms. Pile fills quickly and the
 * drain animation fires frequently, showing the full fill → drain cycle.
 */
export const SandFastFill: Story = {
  render: () => <SandBurst />,
};

/** 5h usage hourglass at 0h, 1h15m, 2h30m, 3h45m, and 5h. */
export const HourglassStages: Story = {
  render: () => <HourglassStagesDemo />,
};

/** 5h usage hourglass cycling 0 → 5h over ~10 s. Use the 1x / 7x buttons to control speed. */
export const HourglassCycle: Story = {
  render: () => <HourglassCycleDemo />,
};
