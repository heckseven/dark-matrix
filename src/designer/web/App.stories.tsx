import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { userEvent, expect } from 'storybook/test';
import { App } from './App';
import { designerStore, ROWS, DEFAULT_WIDTH } from './store.js';
import type { Frame } from './store.js';

const W = DEFAULT_WIDTH;

function px(fn: (c: number, r: number) => number): string {
  const d = new Uint8Array(W * ROWS);
  for (let c = 0; c < W; c++) for (let r = 0; r < ROWS; r++) d[c * ROWS + r] = fn(c, r);
  return btoa(String.fromCharCode(...d));
}

const PATTERNS = {
  blank:    px(() => 0),
  gradient: px((c, r) => Math.round(((c * ROWS + r) / (W * ROWS - 1)) * 255)),
  checker:  px((c, r) => ((c + r) % 2 === 0 ? 255 : 0)),
  topHalf:  px((_c, r) => (r < Math.floor(ROWS / 2) ? 255 : 64)),
  botHalf:  px((_c, r) => (r < Math.floor(ROWS / 2) ? 64 : 255)),
  columns:  px((c) => (c % 2 === 0 ? 255 : 32)),
};

const SEQ = [PATTERNS.blank, PATTERNS.gradient, PATTERNS.checker, PATTERNS.topHalf, PATTERNS.botHalf, PATTERNS.columns];

function makeFrames(count: number, delayMs = 100): Frame[] {
  return Array.from({ length: count }, (_, i) => ({ pixels: SEQ[i % SEQ.length]!, delayMs }));
}

function setup(frames: Frame[], opts: {
  mode?: 'bw' | 'gray';
  isPlaying?: boolean;
  activeFrameIdx?: number;
  zoom?: number;
  previewTarget?: 'left' | 'right' | 'both' | 'mirror';
  activeMode?: import('./store.js').AppMode | null;
} = {}) {
  designerStore.getState().loadProject({ frames, width: W, mode: opts.mode ?? 'bw', loop: true });
  designerStore.setState({ isPlaying: opts.isPlaying ?? false, zoom: opts.zoom ?? 1 });
  designerStore.getState().setActiveMode(opts.activeMode !== undefined ? opts.activeMode : 'design');
  if (opts.activeFrameIdx !== undefined) designerStore.setState({ activeFrameIdx: opts.activeFrameIdx });
  if (opts.previewTarget !== undefined) designerStore.getState().setPreviewTarget(opts.previewTarget);
}

interface AppStoryArgs {
  mode: 'bw' | 'gray';
  frameCount: number;
  isPlaying: boolean;
  zoom: number;
  previewTarget: 'left' | 'right' | 'both' | 'mirror';
}

function AppStory({ mode, frameCount, isPlaying, zoom, previewTarget }: AppStoryArgs) {
  useEffect(() => {
    setup(makeFrames(frameCount), { mode, isPlaying, zoom, previewTarget });
  }, [mode, frameCount, isPlaying, zoom, previewTarget]);
  return <App />;
}
AppStory.displayName = 'App';

const meta = {
  title: 'App/Design',
  component: AppStory,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    mode: {
      control: 'radio',
      options: ['bw', 'gray'],
      description: 'Drawing mode.',
    },
    frameCount: {
      control: { type: 'range', min: 1, max: 6, step: 1 },
      description: 'Number of frames.',
    },
    isPlaying: {
      control: 'boolean',
      description: 'Animation playback state.',
    },
    zoom: {
      control: 'select',
      options: [0.5, 1, 2, 3, 4],
      description: 'Canvas zoom level.',
    },
    previewTarget: {
      control: 'radio',
      options: ['left', 'right', 'both', 'mirror'],
      description: 'Which hardware panel(s) to target.',
    },
  },
  args: { mode: 'bw', frameCount: 1, isPlaying: false, zoom: 1, previewTarget: 'left' },
} satisfies Meta<typeof AppStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default state: single blank frame, BW mode. */
export const Playground: Story = {};

/** Gray mode with the extended palette and grayscale slider visible. */
export const GrayMode: Story = {
  args: { mode: 'gray', frameCount: 2 },
};

/** Four frames loaded with distinct patterns; frame strip is scrollable at this count. */
export const MultiFrame: Story = {
  args: { frameCount: 4 },
};

/** Animation running — playback advances through frames on their own delays. */
export const Playing: Story = {
  args: { frameCount: 4, isPlaying: true },
};

/** Canvas scaled to 50% — layout reflows to keep the canvas centered. */
export const ZoomedOut: Story = {
  args: { zoom: 0.5 },
};

/** Canvas scaled to 400% — pixel cells are large; scrolling may be needed. */
export const ZoomedIn: Story = {
  args: { zoom: 4 },
};

/** Wide 18-col canvas in mirror mode — drawing one half mirrors the other in real time. */
export const MirrorMode: Story = {
  args: { previewTarget: 'mirror', frameCount: 1 },
};

/** Gray mode with live preview active — footer shows the degraded-preview warning. */
export const DegradedPreview: Story = {
  args: { mode: 'gray', frameCount: 1 },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('button', { name: 'live preview: off' });
    await userEvent.click(toggle);
    await expect(canvas.getByText('degraded live preview when using grey values')).toBeInTheDocument();
  },
};
