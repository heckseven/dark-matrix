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

/** Default state — no value, all controls at their defaults. Accent shows "preset" selected. */
export const Default: Story = {};

/** Dark mode locked — light picker dimmed, style radio on "dark". */
export const DarkLocked: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'dark' },
  },
};

/** Light mode locked — dark picker dimmed, style radio on "light". */
export const LightLocked: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'light' },
  },
};

/** Auto mode with different presets — both pickers fully active, different selections. */
export const AutoMixedPresets: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'phosphor', color_scheme: 'auto' },
  },
};

/** Phosphor dark / mono light in auto mode. */
export const PhosphorDarkMonoLight: Story = {
  args: {
    value: { dark_preset: 'phosphor', light_preset: 'mono', color_scheme: 'auto' },
  },
};

/** Palette accent selected — gr455 checked in the accent radio list. */
export const AccentPalette: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'dark', accent: '#0dc45c' },
  },
};

/** p1nk palette accent selected. */
export const AccentP1nk: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'dark', accent: '#fe428f' },
  },
};

/** Custom hex accent — "custom" radio checked, hex input visible with value. */
export const AccentCustom: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'dark', accent: '#22D3EE' },
  },
};
