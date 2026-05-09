import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { Slider } from './slider';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Range input with two visual variants.',
          '',
          '**Variants**',
          '- `value` (default): monospace track with the current value displayed as a readout at the thumb position.',
          '- `cycling`: monospace track with a character thumb that cycles through a set as the handle moves.',
          '',
          '**Usage**',
          '- Use `defaultValue` for uncontrolled usage. Use `value` + `onChange` for controlled usage.',
          '- Both variants render a fixed-width monospace track; `className` applies to the wrapper element.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['value', 'cycling'],
      description: 'Visual style.',
    },
    min: { control: 'number', description: 'Minimum value.' },
    max: { control: 'number', description: 'Maximum value.' },
    step: { control: 'number', description: 'Increment between values. Defaults to `1`.' },
    defaultValue: { control: 'number', description: 'Initial value for uncontrolled usage.' },
    value: { control: 'number', description: 'Current value for controlled usage. Requires `onChange`.' },
    onChange: { description: 'Change handler for controlled usage.' },
    disabled: { control: 'boolean', description: 'Prevents interaction.' },
  },
  args: { onChange: fn(), min: 0, max: 255, defaultValue: 128 },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Variant and range configurable via controls. */
export const Playground: Story = {
  args: { variant: 'value', 'aria-label': 'Slider' },
};

/** Thumb character cycles through a set as the handle moves. */
export const Cycling: Story = {
  args: { variant: 'cycling', 'aria-label': 'Slider' },
};
