import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { ScrubInput } from './scrub-input.js';

const meta = {
  title: 'Components/ScrubInput',
  component: ScrubInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Numeric input with drag-to-scrub. Click and drag horizontally to change the value; click without dragging to enter text-edit mode.',
          '',
          '**Usage**',
          '- Always controlled — pass `value` + `onChange` together.',
          '- `className` sets the collapsed width. `expandedClassName` overrides it when in text-edit mode.',
          '- Arrow keys step ±1; Shift+Arrow steps ±10.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    value: { control: { type: 'number' }, description: 'Current value.' },
    min: { control: { type: 'number' }, description: 'Minimum value (inclusive).' },
    max: { control: { type: 'number' }, description: 'Maximum value (inclusive).' },
    pixelsPerUnit: {
      control: { type: 'range', min: 0.1, max: 10, step: 0.1 },
      description: 'Pointer pixels required to change value by 1. Lower = more sensitive.',
    },
    disabled: { control: 'boolean', description: 'Disables interaction.' },
    className: { control: 'text', description: 'Width class for the collapsed input.' },
    expandedClassName: { control: 'text', description: 'Width class applied when focused for typing. Defaults to className.' },
  },
  args: { onChange: fn() },
} satisfies Meta<typeof ScrubInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(props: Parameters<typeof ScrubInput>[0]) {
  const [v, setV] = useState(props.value);
  return <ScrubInput {...props} value={v} onChange={setV} />;
}

/** Drag to scrub; click to type. */
export const Playground: Story = {
  render: args => <Controlled {...args} />,
  args: { value: 42, min: 0, max: 100, 'aria-label': 'Value' },
};

/** Full 0–255 range used for color channels. */
export const ColorChannel: Story = {
  render: args => <Controlled {...args} />,
  args: { value: 128, min: 0, max: 255, className: 'w-8 text-center', 'aria-label': 'Color channel' },
};

/** When the visible label is narrow, the input expands on focus to show more digits. */
export const ExpandsOnFocus: Story = {
  render: args => <Controlled {...args} />,
  args: { value: 42, min: 0, max: 9999, className: 'w-8 text-center', expandedClassName: 'w-16 text-center', 'aria-label': 'Value' },
};

/** Interaction and value are blocked. */
export const Disabled: Story = {
  render: args => <Controlled {...args} />,
  args: { value: 50, disabled: true, 'aria-label': 'Value' },
};
