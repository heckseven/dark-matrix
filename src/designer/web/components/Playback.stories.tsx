import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Playback } from './Playback';
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

function PlaybackStory({ frameCount }: { frameCount: number }) {
  useEffect(() => { syncFrameCount(frameCount); }, [frameCount]);
  return <Playback />;
}
PlaybackStory.displayName = 'Playback';

const meta = {
  title: 'Components/Playback',
  component: PlaybackStory,
  tags: ['autodocs'],
  argTypes: {
    frameCount: {
      control: { type: 'range', min: 1, max: 6, step: 1 },
      description: 'Number of frames in the store',
    },
  },
  args: { frameCount: 1 },
} satisfies Meta<typeof PlaybackStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const MultiFrame: Story = {
  args: { frameCount: 3 },
};
