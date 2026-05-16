import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { Select, SELECT_VARIANTS } from './select.js';
import type { SelectVariant } from './select.js';

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
          'Styled wrapper around a native `<select>`. All standard select attributes are forwarded.',
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
    variant: { control: 'select', options: SELECT_VARIANTS, description: 'Visual design variant.' },
    disabled: { control: 'boolean', description: 'Prevents interaction.' },
    value: { control: 'text', description: 'Controlled value.' },
  },
  args: {
    value: 'cpu',
    'aria-label': 'Metric',
    onChange: fn(),
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All props configurable via controls. */
export const Playground: Story = {
  args: { variant: 'segment' },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <Select {...args} onChange={e => { args.onChange?.(e); updateArgs({ value: e.target.value }); }}>
        {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    );
  },
};

// ── design options ────────────────────────────────────────────────────────────

const DESCRIPTIONS: Record<SelectVariant, string> = {
  bracket:   'Form — mirrors Input [ ] bracket style',
  segment:   'Form — bordered box, like segment Tabs',
  underline: 'Form — bottom border only, minimal',
  ghost:     'Form — invisible at rest, visible on hover/focus',
  terminal:  'Terminal — green phosphor [brackets]',
  amber:     'Terminal — amber CRT underline',
  dos:       'Old computers — DOS blue background',
  matrix:    'Hackers — >_ matrix prompt prefix',
  pipe:      'Form — left-bar accent',
  slash:     'Code — // comment prefix',
};

function Demo({ variant }: { variant: SelectVariant }) {
  const [value, setValue] = useState('temperature');
  return (
    <div className="flex flex-col gap-2 min-w-fit">
      <Select variant={variant} value={value} onChange={e => setValue(e.target.value)} aria-label={`${variant} demo`}>
        {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs text-white/55">{variant}</span>
        <span className="font-mono text-[10px] text-white/25">{DESCRIPTIONS[variant]}</span>
      </div>
    </div>
  );
}

/**
 * Ten design variants. Click any select to interact.
 */
export const DesignOptions: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-x-16 gap-y-10">
      {SELECT_VARIANTS.map(v => <Demo key={v} variant={v} />)}
    </div>
  ),
};
