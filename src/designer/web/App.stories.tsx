import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
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

function setup(frames: Frame[], opts: { mode?: 'bw' | 'gray'; isPlaying?: boolean; activeFrameIdx?: number } = {}) {
  designerStore.getState().loadProject({ frames, width: W, mode: opts.mode ?? 'bw', loop: true });
  designerStore.setState({ isPlaying: opts.isPlaying ?? false });
  if (opts.activeFrameIdx !== undefined) designerStore.setState({ activeFrameIdx: opts.activeFrameIdx });
}

interface AppStoryArgs {
  mode: 'bw' | 'gray';
  frameCount: number;
  isPlaying: boolean;
}

function AppStory({ mode, frameCount, isPlaying }: AppStoryArgs) {
  useEffect(() => {
    setup(makeFrames(frameCount), { mode, isPlaying });
  }, [mode, frameCount, isPlaying]);
  return <App />;
}
AppStory.displayName = 'App';

const meta = {
  title: 'Designer/App',
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
  },
  args: { mode: 'bw', frameCount: 1, isPlaying: false },
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
