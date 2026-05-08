import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Slider } from './slider';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'A thin wrapper around `<input type="range">`. All standard range attributes are forwarded.',
          '',
          '**Usage**',
          '- Use `defaultValue` for uncontrolled usage. Use `value` + `onChange` for controlled usage — both are mutually exclusive.',
          '- Default width is `5rem`. Override with `className` when a different width is needed.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    min: { control: 'number', description: 'Minimum value.' },
    max: { control: 'number', description: 'Maximum value.' },
    step: { control: 'number', description: 'Increment between values. Defaults to `1`.' },
    defaultValue: { control: 'number', description: 'Initial value for uncontrolled usage.' },
    value: { control: 'number', description: 'Current value for controlled usage. Requires `onChange`.' },
    disabled: { control: 'boolean', description: 'Prevents interaction.' },
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full range configurable via controls. */
export const Playground: Story = {
  args: { min: 0, max: 255, defaultValue: 128 },
};

export const MinValue: Story = {
  args: { min: 0, max: 255, defaultValue: 0 },
};

export const MaxValue: Story = {
  args: { min: 0, max: 255, defaultValue: 255 },
};
