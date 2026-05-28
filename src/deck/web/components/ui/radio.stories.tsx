import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { expect, userEvent } from 'storybook/test';
import { Radio } from './radio.js';
import { Text } from './text.js';

const meta = {
  title: 'Components/Radio',
  component: Radio,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'A styled `<input type="radio">`. All standard radio attributes are forwarded.',
          '',
          '**Usage**',
          '- Always wrap radio inputs in a `<fieldset>` with a `<legend>` for accessibility.',
          '- Use `name` to group radios. Use `value` + `checked` + `onChange` for controlled usage.',
          '- Pair each `<Radio>` with a visible label inside a `<label>` element.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    checked: { control: 'boolean', description: 'Checked state for controlled usage.' },
    defaultChecked: { control: 'boolean', description: 'Initial checked state for uncontrolled usage.' },
    disabled: { control: 'boolean', description: 'Prevents interaction and reduces opacity to 40%.' },
    name: { control: 'text', description: 'Groups radios with the same name.' },
    value: { control: 'text', description: 'Value submitted with the form.' },
    onChange: { description: 'Change handler for controlled usage.' },
  },
  args: { onChange: fn() },
} satisfies Meta<typeof Radio>;

export default meta;
type Story = StoryObj<typeof meta>;

const disabledA11yParams = {
  a11y: { context: { exclude: ['[aria-hidden="true"]'] } },
};

/** State and disabled configurable via controls. */
export const Playground: Story = {
  args: { defaultChecked: false, 'aria-label': 'Option' },
  render: (args) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <Radio {...args} />
      <Text as="span" size="xs">Option label</Text>
    </label>
  ),
};

export const Checked: Story = {
  args: { defaultChecked: true, 'aria-label': 'Option' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio')).toBeChecked();
  },
};

export const Unchecked: Story = {
  args: { defaultChecked: false, 'aria-label': 'Option' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio')).not.toBeChecked();
  },
};

export const Disabled: Story = {
  args: { disabled: true, 'aria-label': 'Option' },
  parameters: disabledA11yParams,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio')).toBeDisabled();
  },
};

export const DisabledChecked: Story = {
  args: { defaultChecked: true, disabled: true, 'aria-label': 'Option' },
  parameters: disabledA11yParams,
};

/** Canonical usage: radio group inside a fieldset. */
export const WithGroup: Story = {
  render: () => {
    const [value, setValue] = React.useState('sensor');
    const options = [
      { value: 'sensor', label: 'sensor' },
      { value: 'time',   label: 'time'   },
      { value: 'manual', label: 'manual' },
    ];
    return (
      <fieldset className="border-0 p-0 m-0">
        <legend className="font-mono text-xs text-foreground/50 mb-2">brightness mode</legend>
        <div className="flex flex-col gap-1.5">
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 cursor-pointer">
              <Radio
                name="brightness-mode"
                value={o.value}
                checked={value === o.value}
                onChange={() => setValue(o.value)}
              />
              <Text as="span" size="xs">{o.label}</Text>
            </label>
          ))}
        </div>
      </fieldset>
    );
  },
  play: async ({ canvas }) => {
    const radios = canvas.getAllByRole('radio');
    await expect(radios).toHaveLength(3);
    await expect(radios[0]).toBeChecked();
    await userEvent.click(radios[1]!);
    await expect(radios[1]).toBeChecked();
    await expect(radios[0]).not.toBeChecked();
  },
};

/** Inline horizontal layout. */
export const Inline: Story = {
  render: () => {
    const [value, setValue] = React.useState('low');
    const options = ['low', 'normal', 'critical'];
    return (
      <fieldset className="border-0 p-0 m-0">
        <legend className="font-mono text-xs text-foreground/50 mb-2">urgency</legend>
        <div className="flex items-center gap-4">
          {options.map(o => (
            <label key={o} className="flex items-center gap-1.5 cursor-pointer">
              <Radio name="urgency" value={o} checked={value === o} onChange={() => setValue(o)} />
              <Text as="span" size="xs">{o}</Text>
            </label>
          ))}
        </div>
      </fieldset>
    );
  },
};
