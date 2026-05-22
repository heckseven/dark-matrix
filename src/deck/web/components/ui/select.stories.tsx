import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useState } from 'react';
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
          'Terminal-styled `[ value ▾]` select. Options via the `options` prop.',
          '',
          '**Usage**',
          '- Use `value` + `onValueChange` for controlled usage; `defaultValue` for uncontrolled.',
          '- Always pair with a visible `<label>` or `aria-label`.',
          '- `fluid` fills the containing block.',
          '- `variant="primary"` renders with green glow for use in HUD UI.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    disabled: { control: 'boolean', description: 'Prevents interaction.' },
    value: { control: 'text', description: 'Controlled value.' },
    placeholder: { control: 'text', description: 'Text shown when no value is selected.' },
    onValueChange: { description: 'Called with the new value string when selection changes.' },
  },
  args: {
    options: OPTIONS,
    value: 'cpu',
    'aria-label': 'Metric',
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value ?? 'cpu');
    return <Select {...args} value={value} onValueChange={setValue} />;
  },
};

export const LongValue: Story = {
  render: (args) => {
    const [value, setValue] = useState('temperature');
    return <Select {...args} value={value} onValueChange={setValue} />;
  },
};

export const WithPlaceholder: Story = {
  render: (args) => {
    const [value, setValue] = useState<string | undefined>(undefined);
    return <Select {...args} {...(value !== undefined ? { value } : {})} placeholder="pick one…" onValueChange={setValue} />;
  },
};

export const Fluid: Story = {
  render: (args) => {
    const [value, setValue] = useState('cpu');
    return (
      <div className="w-64">
        <Select {...args} fluid value={value} onValueChange={setValue} />
      </div>
    );
  },
};
