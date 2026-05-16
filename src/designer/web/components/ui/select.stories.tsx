import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { Select } from './select.js';

const OPTIONS = [
  { value: 'cpu',         label: 'cpu' },
  { value: 'ram',         label: 'ram' },
  { value: 'net_rx',      label: 'net rx' },
  { value: 'net_tx',      label: 'net tx' },
  { value: 'temperature', label: 'temperature' },
  { value: 'none',        label: 'none' },
];

const meta = {
  title: 'Components/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Terminal-styled `[ value ]` select. All standard select attributes are forwarded.',
          '',
          '**Usage**',
          '- Use `value` + `onChange` for controlled usage; `defaultValue` for uncontrolled.',
          '- Always pair with a visible `<label>` or `aria-label`.',
          '- Children are `<option>` elements, same as a native select.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    disabled: { control: 'boolean', description: 'Prevents interaction.' },
    value: { control: 'text', description: 'Controlled value.' },
    onChange: { description: 'Change handler — receives the native ChangeEvent.' },
  },
  args: {
    value: 'cpu',
    'aria-label': 'Metric',
    onChange: fn(),
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <Select {...args} onChange={e => { args.onChange?.(e); updateArgs({ value: e.target.value }); }}>
        {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    );
  },
};

export const LongValue: Story = {
  args: { value: 'temperature', 'aria-label': 'Metric' },
  render: (args) => (
    <Select {...args}>
      {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  ),
};
