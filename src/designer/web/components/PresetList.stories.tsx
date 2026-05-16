import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { PresetList } from './PresetList.js';
import type { HudPresetClient } from '../types/hud-preset.js';

const PRESET_CLOCK: HudPresetClient = {
  name: 'clock duo',
  left:  { widget: 'clock', face: 'elegant' },
  right: { widget: 'clock', face: 'analogue' },
};

const PRESET_MIXED: HudPresetClient = {
  name: 'stats left',
  left:  { widget: 'data', style: 'line' },
  right: { widget: 'clock', face: 'stretch' },
};

const PRESET_DATA: HudPresetClient = {
  name: 'system watch',
  left:  { widget: 'data', style: 'line' },
  right: { widget: 'data', style: 'bars' },
};

const meta = {
  title: 'App/HUD/PresetList',
  component: PresetList,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Scrollable preset list with thumbnail previews, inline rename, active/selected highlighting, and delete on hover.',
      },
    },
  },
  args: {
    presets: [PRESET_CLOCK, PRESET_MIXED, PRESET_DATA],
    activeName: 'clock duo',
    selectedName: 'stats left',
    onSelect: fn(),
    onCreate: fn(),
    onInsert: fn(),
    onDelete: fn(),
    onDuplicate: fn(),
    onRename: fn(),
    onMove: fn(),
  },
} satisfies Meta<typeof PresetList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: multiple presets, one active, one selected. */
export const Playground: Story = {};

/** Empty state — no presets yet. */
export const Empty: Story = {
  args: {
    presets: [],
    activeName: null,
    selectedName: null,
  },
};

/** Single preset, both active and selected. */
export const SingleSelected: Story = {
  args: {
    presets: [PRESET_CLOCK],
    activeName: 'clock duo',
    selectedName: 'clock duo',
  },
};

/** Many presets with distinct states. */
export const ManyPresets: Story = {
  args: {
    presets: [
      { name: 'default',      left: { widget: 'clock', face: 'elegant' },  right: { widget: 'clock', face: 'elegant' } },
      { name: 'night watch',  left: { widget: 'clock', face: 'binary-tall' }, right: { widget: 'data', style: 'line' } },
      { name: 'system',       left: { widget: 'data', style: 'line' },  right: { widget: 'data', style: 'bars' } },
      { name: 'minimal',      left: { widget: 'clock', face: 'stretch' }, right: { widget: 'clock', face: 'stretch' } },
      { name: 'cores',        left: { widget: 'data', style: 'bars' },  right: { widget: 'clock', face: 'analogue' } },
    ],
    activeName: 'default',
    selectedName: 'system',
  },
};
