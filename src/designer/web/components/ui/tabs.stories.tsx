import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { useArgs } from 'storybook/preview-api';
import { Tabs, TABS_VARIANTS } from './tabs.js';
import type { TabsVariant } from './tabs.js';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Segmented tab / toggle-group control. Replaces the inline `<div role="group">` + `<button>` pattern.',
          '',
          '**Usage**',
          '- Always provide `aria-label` — the group label is the only context screen readers have.',
          '- `options` accepts strings (`["clock","data"]`) or `{ value, label }` objects for custom display text.',
          '- Wire into `HudInspector` or any segmented control by setting `value` and `onChange`.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: TABS_VARIANTS,
      description: 'Visual design variant.',
    },
    value: {
      control: 'text',
      description: 'Currently selected value.',
    },
    'aria-label': {
      control: 'text',
      description: 'Accessible group label. Required.',
    },
  },
  args: {
    options: ['clock', 'data'],
    value: 'clock',
    'aria-label': 'Widget type',
    onChange: fn(),
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All props configurable via controls. Clicking a tab updates the selection. */
export const Playground: Story = {
  args: { variant: 'segment' },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <Tabs
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};

// ── 10 design options ─────────────────────────────────────────────────────

function Demo({ variant }: { variant: TabsVariant }) {
  const [value, setValue] = useState('clock');
  const themes: Record<TabsVariant, string> = {
    segment: 'Minimal — clean inverted fill',
    terminal: 'Terminal — green phosphor [bracket] notation',
    amber:    'Terminal — amber CRT underline',
    dos:      'Old computers — DOS system menu',
    c64:      'Old computers — Commodore 64',
    neon:     'Cyberpunk — cyan border glow',
    plasma:   'Cyberpunk — fuchsia border glow',
    crash:    'Hackers — Crash Override bold blocks',
    acid:     'Hackers — Acid Burn hot pink',
    matrix:   'Hackers — >_ matrix prompt',
    shelf:    'Terminal — box-drawing bracket underline',
  };
  return (
    <div className="flex flex-col gap-2 min-w-fit">
      <Tabs
        options={['clock', 'data']}
        value={value}
        onChange={setValue}
        variant={variant}
        aria-label={`${variant} tab demo`}
      />
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs text-white/55">{variant}</span>
        <span className="font-mono text-[10px] text-white/25">{themes[variant]}</span>
      </div>
    </div>
  );
}

/**
 * Ten design variants across four themes: terminal, old computers, cyberpunk, and Hackers (1995).
 * All are interactive — click to toggle selection.
 */
export const DesignOptions: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-x-16 gap-y-10">
      {TABS_VARIANTS.map(v => <Demo key={v} variant={v} />)}
    </div>
  ),
};

/** Three-option control with custom labels. */
export const ThreeOptions: Story = {
  args: {
    options: [
      { value: 'line',  label: 'line' },
      { value: 'bars',  label: 'bars' },
      { value: 'spark', label: 'spark' },
    ],
    value: 'bars',
    variant: 'segment',
    'aria-label': 'Data style',
  },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <Tabs
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};
