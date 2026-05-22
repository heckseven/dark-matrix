import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { StartupTab } from './StartupTab.js';

const meta = {
  title: 'App/Config/Startup',
  component: StartupTab,
  parameters: { layout: 'padded' },
  args: {
    value: { animation: 'gol-random' as const, scroll_text: '' },
    onChange: fn(),
  },
} satisfies Meta<typeof StartupTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <StartupTab
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};

export const ScrollMode: Story = {
  args: {
    value: { animation: 'scroll' as const, scroll_text: 'DARK MATRIX' },
  },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <StartupTab
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};

export const DmxMode: Story = {
  args: {
    value: { animation: 'dmx' as const, scroll_text: '', dmx_path: 'my_animation.dmx.json' },
  },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <StartupTab
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};
