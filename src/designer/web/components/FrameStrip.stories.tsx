import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { FrameStrip } from './FrameStrip';

const meta = {
  component: FrameStrip,
  tags: ['ai-generated'],
} satisfies Meta<typeof FrameStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleFrame: Story = {};

export const MultiFrame: Story = {
  beforeEach() {
    import('../store.js').then(({ designerStore }) => {
      const s = designerStore.getState();
      s.addFrame(0);
      s.addFrame(1);
    });
  },
};
