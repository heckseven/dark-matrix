import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { HardwareTab } from './HardwareTab.js';

const meta = {
  title: 'App/Config/Hardware',
  component: HardwareTab,
  parameters: { layout: 'padded' },
  args: {
    value: {
      left:  '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0',
      right: '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0',
    },
    onChange: fn(),
  },
} satisfies Meta<typeof HardwareTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <HardwareTab
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};

export const InvalidPaths: Story = {
  args: {
    value: { left: '/dev/bad', right: 'not-a-path' },
  },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <HardwareTab
        {...args}
        onChange={v => { args.onChange(v); updateArgs({ value: v }); }}
      />
    );
  },
};
