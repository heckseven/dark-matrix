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

/** Default state — no value prop, component uses its internal defaults. */
export const Default: Story = {};

/** Both presets set to dark-matrix, color scheme locked to dark. Light picker is dimmed. */
export const DarkLocked: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'dark' },
  },
};

/** Both presets set to dark-matrix, color scheme locked to light. Dark picker is dimmed. */
export const LightLocked: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'light' },
  },
};

/** Auto mode with different presets per scheme — dark-matrix in dark, phosphor in light. Both pickers fully active. */
export const AutoMixedPresets: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'phosphor', color_scheme: 'auto' },
  },
};

/** Phosphor for dark, mono for light, auto mode. */
export const PhosphorDarkMonoLight: Story = {
  args: {
    value: { dark_preset: 'phosphor', light_preset: 'mono', color_scheme: 'auto' },
  },
};

/** Accent override set — reset button is visible and color picker shows the override. */
export const AccentOverride: Story = {
  args: {
    value: { dark_preset: 'dark-matrix', light_preset: 'dark-matrix', color_scheme: 'dark', accent: '#22D3EE' },
  },
};
