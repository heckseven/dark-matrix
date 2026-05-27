import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
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
  const [pixels, setPixels] = useState(() => toPixels(rendererRef.current!.render()));

  useEffect(() => {
    const r = rendererRef.current!;
    const id = setInterval(() => {
      tickRef.current++;
      onTick?.(r, tickRef.current);
      setPixels(toPixels(r.render()));
    }, intervalMs);
    return () => { clearInterval(id); r.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return pixels;
}

// ── Tetris ────────────────────────────────────────────────────────────────

function TetrisDemo() {
  const pixels = useRenderer(
    createClaudeTetrisRenderer,
    100,
    (r, tick) => {
      if (tick % 6 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'story' });
    },
  );
  return <MatrixPreview pixels={pixels} width={9} />;
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
      if (tick % 2 === 0) r.onEvent({ type: 'agent_spawn', tool: undefined, sessionId: 'story' });
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
