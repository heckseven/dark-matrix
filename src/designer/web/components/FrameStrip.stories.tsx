import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';
import { FrameStrip } from './FrameStrip';
import { designerStore, ROWS, DEFAULT_WIDTH } from '../store.js';

const COLS = DEFAULT_WIDTH;

function makePixels(fn: (c: number, r: number) => number): string {
  const data = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      data[c * ROWS + r] = fn(c, r);
  return btoa(String.fromCharCode(...data));
}

const PATTERNS = [
  makePixels((c, r) => Math.round(((c * ROWS + r) / (COLS * ROWS - 1)) * 255)),
  makePixels((c, r) => ((c + r) % 2 === 0 ? 255 : 0)),
  makePixels((c, r) => (r < Math.floor(ROWS / 2) ? 255 : 64)),
];

function syncFrameCount(target: number) {
  const t = Math.max(1, target);
  for (let n = designerStore.getState().frames.length; n < t; n++) {
    designerStore.getState().addFrame(n - 1);
  }
  for (let n = designerStore.getState().frames.length; n > t; n--) {
    designerStore.getState().removeFrame(n - 1);
  }
}

function FrameStripStory({ frameCount }: { frameCount: number }) {
  useEffect(() => {
    syncFrameCount(frameCount);
    const frames = designerStore.getState().frames.map((f, i) => ({
      ...f,
      pixels: PATTERNS[i % PATTERNS.length]!,
    }));
    designerStore.setState({ frames });
  }, [frameCount]);
  return <FrameStrip />;
}
FrameStripStory.displayName = 'FrameStrip';

const meta = {
  title: 'App/Design/FrameStrip',
  component: FrameStripStory,
  parameters: {
    docs: {
      description: {
        component: 'Scrollable strip of frame thumbnails. Supports click-to-select, drag-to-reorder, per-frame delay, and frame add/delete.',
      },
    },
  },
  argTypes: {
    frameCount: {
      control: { type: 'range', min: 1, max: 6, step: 1 },
      description: 'Number of frames in the store.',
    },
  },
  args: { frameCount: 1 },
} satisfies Meta<typeof FrameStripStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const MultiFrame: Story = {
  args: { frameCount: 3 },
  play: async ({ canvas }) => {
    const items = canvas.getAllByLabelText(/^Frame \d+$/);
    await expect(items).toHaveLength(3);
  },
};
