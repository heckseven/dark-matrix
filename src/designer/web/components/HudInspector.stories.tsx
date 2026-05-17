import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn, userEvent, within, expect } from 'storybook/test';
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
          'Three-layer panel inspector for a single HUD module slot.',
          '',
          '- **Layer 1 — categories**: text menu (clocks, data, ai, audio; image/animation dimmed as coming soon).',
          '- **Layer 2 — grid**: all options in the category, all animated continuously. Audio category has a monitor/mic toggle and connects to real FFT data (falls back to mock in Storybook).',
          '- **Layer 3 — settings**: data (line/fill) quadrant selectors. Back returns to Layer 2.',
          '',
          'Entry state: Layer 3 if a data (line/fill) widget is assigned, Layer 2 of the widget\'s category otherwise, Layer 1 if no widget. Remount via `key` when selected side or preset changes.',
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

/** No widget assigned — shows category list. */
export const NullState: Story = {};

/** Category list with a clock assigned — 'clocks' row has active indicator. */
export const CategoriesWithClock: Story = {
  args: {
    widget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Back to categories' }));
    expect(canvas.getByRole('button', { name: 'clocks' })).toBeVisible();
  },
};

/** Clock grid — all 7 faces animate; elegant is active. */
export const ClockGrid: Story = {
  args: {
    widget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
  },
};

/** Clock grid — analogue face active. */
export const ClockAnalogue: Story = {
  args: {
    widget: { widget: 'clock', face: 'analogue' } satisfies HudWidget,
  },
};

/** Data settings — line style (Layer 3), system preset. */
export const DataSettingsLine: Story = {
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

/** Data settings — fill style. */
export const DataSettingsFill: Story = {
  args: {
    widget: {
      widget: 'data',
      style: 'fill',
      top_left: 'cpu',
      top_right: 'ram',
      bottom_left: 'net_rx',
      bottom_right: 'net_tx',
    } satisfies HudWidget,
  },
};

/** Data grid — scroll preset active (Layer 2, no settings). */
export const DataGridScroll: Story = {
  args: {
    widget: { widget: 'data', style: 'scroll' } satisfies HudWidget,
  },
};

/** Data grid — cpu cores preset active (Layer 2, no settings). */
export const DataGridCores: Story = {
  args: {
    widget: { widget: 'data', style: 'cores' } satisfies HudWidget,
  },
};

/** Data grid accessed from data settings via back button. */
export const DataGridFromSettings: Story = {
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Back to data' }));
    expect(canvas.getByRole('button', { name: 'system', pressed: true })).toBeVisible();
  },
};

/** AI grid — heatmap (only option in the category). */
export const AiHeatmap: Story = {
  args: {
    widget: { widget: 'heatmap' } satisfies HudWidget,
  },
};

/** Audio grid — dark matter style active; mic toggle visible. */
export const AudioDarkMatter: Story = {
  args: {
    widget: { widget: 'audio', style: 'dark-matter' } satisfies HudWidget,
  },
};

/** Audio grid — specter style active. */
export const AudioSpecter: Story = {
  args: {
    widget: { widget: 'audio', style: 'specter' } satisfies HudWidget,
  },
};
