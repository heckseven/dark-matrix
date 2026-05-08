import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Toolbar } from './Toolbar';

const meta = {
  component: Toolbar,
  tags: ['ai-generated'],
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const BwMode: Story = {
  beforeEach() {
    import('../store.js').then(({ designerStore }) => {
      designerStore.getState().setMode('bw');
    });
  },
};

export const GrayMode: Story = {
  beforeEach() {
    import('../store.js').then(({ designerStore }) => {
      designerStore.getState().setMode('gray');
    });
  },
};
