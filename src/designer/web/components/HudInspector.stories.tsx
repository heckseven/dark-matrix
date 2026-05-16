import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { HudInspector } from './HudInspector.js';
import type { HudWidget } from '../types/hud-preset.js';

const meta = {
  title: 'App/HUD/HudInspector',
  component: HudInspector,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Right-column panel inspector for a single HUD module slot.',
          '',
          'Two views:',
          '- **Picker** — scrollable list of panel categories (clocks, data, ai, audio, image, animation). Shown when no widget is assigned or after "← select different" / "✕ close".',
          '- **Settings** — per-panel settings with a header row containing "← select different" (returns to picker, scrolled to this category) and "✕" (returns to picker at top).',
          '',
          'Remount via `key` whenever the selected side or preset changes so view state resets correctly.',
        ].join('\n'),
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

/** No preset selected — shows panel picker. */
export const NullState: Story = {};

/** Picker with a clock assigned — elegant face marked active. */
export const PickerWithClock: Story = {
  args: {
    widget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
  },
  // Note: component initialises to settings when widget is non-null.
  // Use the story as a live demo — click "← select different" to reach the picker.
};

/** Clock settings — elegant face selected. */
export const ClockSettings: Story = {
  args: {
    widget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
  },
};

/** Clock settings — analogue face. */
export const ClockAnalogue: Story = {
  args: {
    widget: { widget: 'clock', face: 'analogue' } satisfies HudWidget,
  },
};

/** Data settings — line style with all quadrants set. */
export const DataSettings: Story = {
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

/** Data settings — bars style. */
export const DataBars: Story = {
  args: {
    widget: {
      widget: 'data',
      style: 'bars',
    } satisfies HudWidget,
  },
};
