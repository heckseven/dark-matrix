import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { expect, userEvent, within } from 'storybook/test';
import { Radio, type RadioVariant } from './radio.js';
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
          '**Variants**',
          '10 visual styles are available via the `variant` prop. Run the **Design Options** story to compare them interactively and choose one as the project default.',
          '',
          '| Variant | Off | On |',
          '|---------|-----|----|',
          '| `paren` | `( )` | `(•)` |',
          '| `bracket` | `[ ]` | `[•]` |',
          '| `green` | `( )` | `(•)` green glow |',
          '| `cursor` | `  ` | `› ` |',
          '| `circle` | `○` | `●` |',
          '| `angle` | `<·>` | `<•>` |',
          '| `block` | `[ ]` | `[■]` |',
          '| `asterisk` | `( )` | `(*)` |',
          '| `dot` | `·` | `●` |',
          '| `track` | `─·─` | `─●─` |',
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
    variant: {
      control: 'select',
      options: ['paren', 'bracket', 'green', 'cursor', 'circle', 'angle', 'block', 'asterisk', 'dot', 'track'] satisfies RadioVariant[],
      description: 'Visual style.',
    },
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

/** Variant, checked state, and disabled configurable via controls. */
export const Playground: Story = {
  args: { variant: 'paren', defaultChecked: false, 'aria-label': 'Option' },
  render: (args) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <Radio {...args} />
      <Text as="span" size="xs">Option label</Text>
    </label>
  ),
};

/** Checked state. */
export const Checked: Story = {
  args: { defaultChecked: true, 'aria-label': 'Option' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio')).toBeChecked();
  },
};

/** Unchecked state. */
export const Unchecked: Story = {
  args: { defaultChecked: false, 'aria-label': 'Option' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio')).not.toBeChecked();
  },
};

/** Disabled — cannot be interacted with. */
export const Disabled: Story = {
  args: { disabled: true, 'aria-label': 'Option' },
  parameters: disabledA11yParams,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio')).toBeDisabled();
  },
};

/** Disabled + checked. */
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
              <Text as="span" size="xs" className={value === o.value ? 'text-foreground' : 'text-foreground/50'}>
                {o.label}
              </Text>
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

const ALL_VARIANTS: RadioVariant[] = [
  'paren', 'bracket', 'green', 'cursor', 'circle',
  'angle', 'block', 'asterisk', 'dot', 'track',
];

const OPTIONS = [
  { value: 'alpha', label: 'alpha' },
  { value: 'beta',  label: 'beta'  },
  { value: 'gamma', label: 'gamma' },
];

/**
 * All 10 visual variants side-by-side. Each group is interactive — click around
 * to see checked/unchecked states. Pick your favourite and let me know its name.
 */
export const DesignOptions: Story = {
  name: 'Design Options',
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story: 'All 10 variants shown in a 2-column grid with interactive groups. Click the options to compare checked states. Tell me which number/name to use as the default.',
      },
    },
  },
  render: () => {
    const [selected, setSelected] = React.useState<Record<RadioVariant, string>>(
      Object.fromEntries(ALL_VARIANTS.map(v => [v, 'alpha'])) as Record<RadioVariant, string>
    );

    return (
      <div className="grid grid-cols-2 gap-x-10 gap-y-7 p-4 font-mono text-xs">
        {ALL_VARIANTS.map((variant, i) => (
          <fieldset key={variant} className="border-0 p-0 m-0">
            <legend className="text-foreground/40 mb-2">
              {i + 1}. <span className="text-foreground/70">{variant}</span>
            </legend>
            <div className="flex flex-col gap-1.5">
              {OPTIONS.map(o => (
                <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                  <Radio
                    variant={variant}
                    name={`demo-${variant}`}
                    value={o.value}
                    checked={selected[variant] === o.value}
                    onChange={() => setSelected(s => ({ ...s, [variant]: o.value }))}
                  />
                  <span className={selected[variant] === o.value ? 'text-foreground' : 'text-foreground/50'}>
                    {o.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    );
  },
};

/** All variants in a single scannable row — unchecked vs checked. */
export const VariantMatrix: Story = {
  name: 'Variant Matrix',
  parameters: { controls: { disable: true } },
  render: () => (
    <table className="font-mono text-xs border-collapse">
      <thead>
        <tr>
          <th className="text-left text-foreground/40 font-normal pr-6 pb-2">variant</th>
          <th className="text-left text-foreground/40 font-normal pr-6 pb-2">unchecked</th>
          <th className="text-left text-foreground/40 font-normal pb-2">checked</th>
        </tr>
      </thead>
      <tbody>
        {ALL_VARIANTS.map(variant => (
          <tr key={variant}>
            <td className="pr-6 py-0.5 text-foreground/50">{variant}</td>
            <td className="pr-6 py-0.5">
              <Radio variant={variant} name={`matrix-${variant}`} value="off" defaultChecked={false} aria-label={`${variant} unchecked`} />
            </td>
            <td className="py-0.5">
              <Radio variant={variant} name={`matrix-${variant}`} value="on" defaultChecked aria-label={`${variant} checked`} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};
