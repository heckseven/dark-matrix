import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { AppearanceTab } from './AppearanceTab.js';

const meta = {
  title: 'App/Config/Appearance',
  component: AppearanceTab,
  args: {
    value: { hud_presets: [] },
  },
} satisfies Meta<typeof AppearanceTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithPresets: Story = {
  args: {
    value: { hud_presets: [{ name: 'default' }, { name: 'night' }] },
  },
};
