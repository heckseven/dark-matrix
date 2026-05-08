import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';
import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Triggers an action. Text-only — no icon support.',
          '',
          '**Usage**',
          '- Provide an `aria-label` whenever the visible label is a symbol or ASCII art that does not describe the action.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'ghost', 'destructive'],
      description: '`default` — white border, inverts on hover. `primary` — accent fill. `ghost` — no border, subtle hover. `destructive` — white at rest, red on hover.',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Padding scale. `sm` 8×4px · `md` 12×8px · `lg` 16×12px.',
    },
    disabled: {
      control: 'boolean',
      description: 'Prevents interaction and reduces opacity to 40%.',
    },
    children: {
      control: 'text',
      description: 'Button label. Text only.',
    },
    'aria-label': {
      control: 'text',
      description: 'Accessible label. Use when `children` is a symbol or ASCII art that does not describe the action.',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All variants and sizes configurable via controls. */
export const Playground: Story = {
  args: { children: 'Button', variant: 'default', size: 'sm' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-2 items-center">
      <Button variant="default">Default</Button>
      <Button variant="primary">Primary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex gap-2 items-end">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
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
    await expect(getComputedStyle(btn).backgroundColor).toBe('rgb(13, 196, 92)'); // #0DC45C
  },
};
