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

export const Default: Story = {};

export const Phosphor: Story = {
  args: { value: { preset: 'phosphor', color_scheme: 'dark' } },
};

export const LightMode: Story = {
  args: { value: { preset: 'dark-matrix', color_scheme: 'light' } },
};

export const Custom: Story = {
  args: { value: { preset: 'custom', color_scheme: 'dark', accent: '#22D3EE' } },
};
