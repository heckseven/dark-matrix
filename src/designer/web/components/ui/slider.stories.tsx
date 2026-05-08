import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Slider } from './slider';

const meta = {
  component: Slider,
  tags: ['ai-generated'],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { min: 0, max: 255, defaultValue: 128 },
};

export const MinValue: Story = {
  args: { min: 0, max: 255, defaultValue: 0 },
};

export const MaxValue: Story = {
  args: { min: 0, max: 255, defaultValue: 255 },
};
