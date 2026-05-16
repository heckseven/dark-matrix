import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent } from 'storybook/test';
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
  useEffect(() => {
    syncFrameCount(frameCount);
    designerStore.getState().setActiveFrame(0);
    designerStore.getState().setPlaying(false);
  }, [frameCount]);
  return <Playback />;
}
PlaybackStory.displayName = 'Playback';

const meta = {
  title: 'App/Design/Playback',
  component: PlaybackStory,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Playback controls: previous, play/pause, next, and frame counter. Connects to the designer store.',
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
} satisfies Meta<typeof PlaybackStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const MultiFrame: Story = {
  args: { frameCount: 3 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /previous frame/i })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: /next frame/i })).not.toBeDisabled();
  },
};

export const PlayPause: Story = {
  args: { frameCount: 3 },
  play: async ({ canvas }) => {
    const play = canvas.getByRole('button', { name: /^play$/i });
    await expect(play).not.toBeDisabled();
    await userEvent.click(play);
    const pause = canvas.getByRole('button', { name: /pause/i });
    await expect(pause).toBeInTheDocument();
    await userEvent.click(pause);
    await expect(canvas.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
  },
};
