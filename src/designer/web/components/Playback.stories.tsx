import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Playback } from './Playback';

const meta = {
  component: Playback,
  tags: ['ai-generated'],
} satisfies Meta<typeof Playback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultiFrame: Story = {
  beforeEach() {
    import('../store.js').then(({ designerStore }) => {
      const s = designerStore.getState();
      s.addFrame(0);
      s.addFrame(1);
    });
  },
};
