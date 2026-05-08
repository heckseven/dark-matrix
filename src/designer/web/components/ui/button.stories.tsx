import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';
import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['default', 'primary', 'ghost', 'destructive'] },
    size: { control: 'select', options: ['default', 'icon', 'sm'] },
    disabled: { control: 'boolean' },
    children: { control: 'text' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All variants and sizes configurable via controls. */
export const Playground: Story = {
  args: { children: 'Button', variant: 'default', size: 'default' },
};

export const Default: Story = {
  args: { children: 'Click me' },
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

/** Regression guard: verifies globals.css design tokens loaded in the test runner. */
export const CssCheck: Story = {
  tags: ['!dev'],
  args: { children: 'Submit', variant: 'primary' },
  play: async ({ canvas }) => {
    const btn = canvas.getByRole('button', { name: /submit/i });
    await expect(getComputedStyle(btn).backgroundColor).toBe('rgb(34, 195, 93)');
  },
};
