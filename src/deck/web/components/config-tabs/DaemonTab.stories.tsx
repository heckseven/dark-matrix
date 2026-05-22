import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { DaemonTab } from './DaemonTab.js';

const meta = {
  title: 'App/Config/Daemon',
  component: DaemonTab,
  parameters: { layout: 'padded' },
  args: {
    value: {
      poll_interval_ms: 500,
      idle_animation: 'heatmap' as const,
      idle_after_ms: 300000,
    },
    onChange: fn(),
  },
} satisfies Meta<typeof DaemonTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <DaemonTab
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};

export const GifMode: Story = {
  args: {
    value: {
      poll_interval_ms: 500,
      idle_animation: 'gif' as const,
      idle_after_ms: 300000,
      idle_gif_path: 'matrix.gif',
      idle_gif_mode: 'bw' as const,
      idle_gif_dual: true,
    },
  },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <DaemonTab
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};

export const AudioEqMode: Story = {
  args: {
    value: {
      poll_interval_ms: 500,
      idle_animation: 'audio-eq' as const,
      idle_after_ms: 300000,
      idle_eq_source: 'monitor' as const,
    },
  },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <DaemonTab
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};
