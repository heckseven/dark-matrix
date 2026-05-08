import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';
import { Button } from './button';

const meta = {
  component: Button,
  tags: ['ai-generated'],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Click me' },
  play: async ({ canvas }) => {
    const btn = canvas.getByRole('button', { name: /click me/i });
    await expect(btn).toHaveAttribute('type', 'button');
  },
};

export const Primary: Story = {
  args: { children: 'Submit', variant: 'primary' },
};

export const Ghost: Story = {
  args: { children: 'Cancel', variant: 'ghost' },
};

export const Destructive: Story = {
  args: { children: '×', variant: 'destructive', size: 'icon' },
};

export const Disabled: Story = {
  args: { children: 'Undo', disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /undo/i })).toBeDisabled();
  },
};

export const CssCheck: Story = {
  args: { children: 'Submit', variant: 'primary' },
  play: async ({ canvas }) => {
    const btn = canvas.getByRole('button', { name: /submit/i });
    // bg-primary = hsl(142, 70%, 45%) = rgb(34, 195, 93) — fails if globals.css tokens did not load
    await expect(getComputedStyle(btn).backgroundColor).toBe('rgb(34, 195, 93)');
  },
};
