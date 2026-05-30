import type { Meta, StoryObj } from '@storybook/react-vite';
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
