import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { BrightnessTab } from './BrightnessTab.js';
import type { BrightnessValue } from './BrightnessTab.js';

const defaults: BrightnessValue = {
  mode: 'sensor',
  sensor_path: '/sys/bus/iio/devices/iio:device0/in_illuminance_raw',
  multiplier: 0.071,
  offset: 7,
  min: 7,
  max: 255,
  hysteresis: 10,
  manual_value: 100,
};

const meta = {
  title: 'App/Config/Brightness',
  component: BrightnessTab,
  parameters: {
    layout: 'padded',
  },
  args: {
    value: defaults,
    onChange: fn(),
  },
} satisfies Meta<typeof BrightnessTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ManualMode: Story = {
  args: {
    value: { ...defaults, mode: 'manual' },
  },
};

export const MinMaxConflict: Story = {
  args: {
    value: { ...defaults, min: 200, max: 100 },
  },
};
