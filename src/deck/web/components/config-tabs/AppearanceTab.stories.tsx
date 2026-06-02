import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppearanceTab } from './AppearanceTab.js';

const meta = {
  title: 'App/Config/Appearance',
  component: AppearanceTab,
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof AppearanceTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default — no value, controls at their defaults, accent input empty. */
export const Default: Story = {};

/** Dark mode locked — light picker dimmed. */
export const DarkLocked: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'dark' },
  },
};

/** Light mode locked — dark picker dimmed. */
export const LightLocked: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'light' },
  },
};

/** Auto mode with different presets per scheme. */
export const AutoMixedPresets: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'phosphor', color_scheme: 'auto' },
  },
};

/** Phosphor dark / mono light. */
export const PhosphorDarkMonoLight: Story = {
  args: {
    value: { dark_preset: 'phosphor', light_preset: 'mono', color_scheme: 'auto' },
  },
};

/** Accent override set — color input shows value and reset button. */
export const AccentOverride: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'dark', accent: '#fe428f' },
  },
};
