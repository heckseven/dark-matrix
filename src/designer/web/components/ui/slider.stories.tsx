import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Slider } from './slider';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  tags: ['autodocs'],
  argTypes: {
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
    defaultValue: { control: 'number' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full range configurable via controls. */
export const Playground: Story = {
  args: { min: 0, max: 255, defaultValue: 128 },
};

export const Default: Story = {
  args: { min: 0, max: 255, defaultValue: 128 },
};

export const MinValue: Story = {
  args: { min: 0, max: 255, defaultValue: 0 },
};

export const MaxValue: Story = {
  args: { min: 0, max: 255, defaultValue: 255 },
};
