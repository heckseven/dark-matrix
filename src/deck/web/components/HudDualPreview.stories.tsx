import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { HudDualPreview } from './HudDualPreview.js';
import type { HudWidget } from '../types/hud-preset.js';

const CLOCK_LEFT: HudWidget = { widget: 'clock', face: 'elegant' };
const CLOCK_RIGHT: HudWidget = { widget: 'clock', face: 'analogue' };
const DATA_LINE: HudWidget = { widget: 'data', style: 'line' };
const DATA_BARS: HudWidget = { widget: 'data', style: 'cores' };

const meta = {
  title: 'App/HUD/HudDualPreview',
  component: HudDualPreview,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Live animated dual-panel preview. Click either half to select that side. Corner brackets indicate the selected side.',
      },
    },
  },
  args: {
    leftWidget: CLOCK_LEFT,
    rightWidget: CLOCK_RIGHT,
    selectedSide: 'left' as const,
    onSelectSide: fn(),
  },
} satisfies Meta<typeof HudDualPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Left side selected, clock + clock. */
export const LeftSelected: Story = {};

/** Right side selected. */
export const RightSelected: Story = {
  args: { selectedSide: 'right' },
};

/** Clock + clock. */
export const ClockClock: Story = {
  args: {
    leftWidget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
    rightWidget: { widget: 'clock', face: 'binary-tall' } satisfies HudWidget,
  },
};

/** Data + data. */
export const DataData: Story = {
  args: {
    leftWidget: DATA_LINE,
    rightWidget: DATA_BARS,
  },
};

/** Mixed: data left, clock right. */
export const Mixed: Story = {
  args: {
    leftWidget: DATA_LINE,
    rightWidget: CLOCK_RIGHT,
    selectedSide: 'right',
  },
};

/** Null widgets — both panels empty. */
export const BothNull: Story = {
  args: {
    leftWidget: null,
    rightWidget: null,
  },
};
