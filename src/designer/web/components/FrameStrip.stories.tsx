import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { FrameStrip } from './FrameStrip';
import { designerStore } from '../store.js';

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
  useEffect(() => { syncFrameCount(frameCount); }, [frameCount]);
  return <FrameStrip />;
}
FrameStripStory.displayName = 'FrameStrip';

const meta = {
  title: 'Components/FrameStrip',
  component: FrameStripStory,
  tags: ['autodocs'],
  argTypes: {
    frameCount: {
      control: { type: 'range', min: 1, max: 6, step: 1 },
      description: 'Number of frames in the store',
    },
  },
  args: { frameCount: 1 },
} satisfies Meta<typeof FrameStripStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const MultiFrame: Story = {
  args: { frameCount: 3 },
};
