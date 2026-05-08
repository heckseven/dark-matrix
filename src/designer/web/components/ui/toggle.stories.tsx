import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';
import { Toggle } from './toggle';

const meta = {
  title: 'Components/Toggle',
  component: Toggle,
  tags: ['autodocs'],
  argTypes: {
    pressed: { control: 'boolean' },
    disabled: { control: 'boolean' },
    children: { control: 'text' },
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All props configurable via controls. */
export const Playground: Story = {
  args: { children: 'BW', pressed: false },
};

export const Default: Story = {
  args: { children: 'BW', pressed: false },
};

export const Pressed: Story = {
  args: { children: 'Gray', pressed: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /gray/i })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Disabled: Story = {
  args: { children: 'Preview BW', disabled: true },
};
