import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { expect, userEvent } from 'storybook/test';
import { Input } from './input';
import { Text } from './text';

const meta = {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'A bracket-styled `[ value ]` input with scroll indicators and expand-on-focus.',
          '',
          '**Overflow behavior**',
          '- Left bracket becomes `‹` when content is scrolled past the left edge.',
          '- Right bracket becomes `›` when content overflows the right edge (collapsed only).',
          '- Expands to `expandedClassName` width on focus; collapses on blur.',
          '',
          '**Usage**',
          '- Use `defaultValue` for uncontrolled usage. Use `value` + `onChange` for controlled usage.',
          '- `className` sets the collapsed width (e.g. `w-12`). `expandedClassName` overrides the expanded width (default `w-48`).',
          '- Pair with a visible label via a `<label>` element or `htmlFor`.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    type: { control: 'select', options: ['text', 'number', 'password', 'email'], description: 'Input type.' },
    placeholder: { control: 'text', description: 'Placeholder text.' },
    disabled: { control: 'boolean', description: 'Prevents interaction and reduces opacity to 40%.' },
    defaultValue: { control: 'text', description: 'Initial value for uncontrolled usage.' },
    value: { control: 'text', description: 'Controlled value. Requires `onChange`.' },
    onChange: { description: 'Change handler for controlled usage.' },
    expandedClassName: { control: 'text', description: 'Width class applied on focus. Defaults to `w-48`.' },
  },
  args: { onChange: fn() },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Type, placeholder, and disabled configurable via controls. */
export const Playground: Story = {
  args: { type: 'text', placeholder: 'type here…', className: 'w-32' },
};

export const Number: Story = {
  args: { type: 'number', min: 0, max: 60000, step: 10, defaultValue: 100, className: 'w-16 text-center', 'aria-label': 'Number input' },
  play: async ({ canvas }) => {
    const input = canvas.getByRole('spinbutton');
    await expect(input).toHaveValue(100);
  },
};

export const Disabled: Story = {
  args: { type: 'text', defaultValue: 'read only', disabled: true, className: 'w-32', 'aria-label': 'Disabled text input' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox')).toBeDisabled();
  },
};

/** Value is visible and focusable but not editable. Brackets are muted to signal non-editable state without removing the field from the tab order. */
export const ReadOnly: Story = {
  args: { type: 'text', value: 'skulltalkk', readOnly: true, className: 'w-32', 'aria-label': 'Read-only text input', onChange: fn() },
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox');
    await expect(input).toHaveAttribute('readonly');
    await expect(input).not.toBeDisabled();
  },
};

/** Canonical usage: input inside a label with a Text sibling. */
export const WithLabel: Story = {
  render: () => (
    <label className="flex items-center gap-2">
      <Text as="span" size="xs" variant="muted">Delay (ms)</Text>
      <Input type="number" min={0} max={60000} step={10} defaultValue={100} className="w-16 text-center" />
    </label>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole('spinbutton');
    await userEvent.clear(input);
    await userEvent.type(input, '200');
    await expect(input).toHaveValue(200);
  },
};
