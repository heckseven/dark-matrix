import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { useArgs } from 'storybook/preview-api';
import { Tabs } from './tabs.js';

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
        ].join('\n'),
      },
    },
  },
  argTypes: {
    options: {
      control: 'object',
      description: 'Tab items — strings or `{ value, label }` objects.',
    },
    value: {
      control: 'text',
      description: 'Currently selected value.',
    },
    'aria-label': {
      control: 'text',
      description: 'Accessible group label. Required.',
    },
    className: {
      control: 'text',
      description: 'Extra classes on the group wrapper.',
    },
  },
  args: {
    options: ['clock', 'data', 'net', 'cpu', 'mem'],
    value: 'clock',
    'aria-label': 'Widget type',
    onChange: fn(),
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All props configurable via controls. Clicking a tab updates the selection. */
export const Playground: Story = {
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

/** Three-option control with custom labels. */
export const ThreeOptions: Story = {
  args: {
    options: [
      { value: 'line',  label: 'line' },
      { value: 'bars',  label: 'bars' },
      { value: 'spark', label: 'spark' },
    ],
    value: 'bars',
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
