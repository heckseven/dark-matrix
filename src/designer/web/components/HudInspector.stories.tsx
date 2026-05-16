import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { HudInspector } from './HudInspector.js';
import type { HudWidget } from '../types/hud-preset.js';

const meta = {
  title: 'HUD/HudInspector',
  component: HudInspector,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Widget inspector for editing a single HUD panel slot. Switches between clock face grid and data quadrant selectors.',
      },
    },
  },
  args: {
    widget: null,
    onChange: fn(),
  },
} satisfies Meta<typeof HudInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No preset selected — shows empty state. */
export const NullState: Story = {};

/** Clock mode — elegant face selected. */
export const ClockMode: Story = {
  args: {
    widget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
  },
};

/** Clock mode — analogue face. */
export const ClockAnalogue: Story = {
  args: {
    widget: { widget: 'clock', face: 'analogue' } satisfies HudWidget,
  },
};

/** Data mode — line style with all quadrants set. */
export const DataMode: Story = {
  args: {
    widget: {
      widget: 'data',
      style: 'line',
      top_left: 'cpu',
      top_right: 'ram',
      bottom_left: 'net_rx',
      bottom_right: 'net_tx',
    } satisfies HudWidget,
  },
};

/** Data mode — bars style. */
export const DataBars: Story = {
  args: {
    widget: {
      widget: 'data',
      style: 'bars',
    } satisfies HudWidget,
  },
};
