import type { Meta, StoryObj } from '@storybook/react-vite';
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
          '- **Layer 1 — category select**: `[ category ▾]` dropdown in the header replaces the old full-panel category list.',
          '- **Layer 2 — grid**: all options in the category, all animated continuously. Audio category has a monitor/mic toggle and connects to real FFT data (falls back to mock in Storybook).',
          '- **Layer 3 — settings**: data (line/fill) quadrant selectors. Back returns to Layer 2.',
          '',
          'Entry state: Layer 3 if a data (line/fill/unstyled) or life/random widget is assigned, Layer 2 of the widget\'s category otherwise (defaults to time if no widget). Remount via `key` when selected side or preset changes.',
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

/** No widget assigned — opens on time grid (default category). */
export const NullState: Story = {};

/** Clock widget assigned — opens directly on the time grid with elegant face selected. */
export const CategoriesWithClock: Story = {
  args: {
    widget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('button', { name: 'elegant', pressed: true })).resolves.toBeVisible();
  },
};

/** Clock grid — all 7 faces animate; elegant is active. */
export const ClockGrid: Story = {
  args: {
    widget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
  },
};

/** Clock grid — analog face active. */
export const ClockAnalog: Story = {
  args: {
    widget: { widget: 'clock', face: 'analog' } satisfies HudWidget,
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

/** Data settings — scroll preset (per-quadrant metric configuration). */
export const DataGridScroll: Story = {
  args: {
    widget: {
      widget: 'data',
      style: 'scroll',
      top_left: 'cpu',
      top_right: 'ram',
      bottom_left: 'net_rx',
      bottom_right: 'net_tx',
    } satisfies HudWidget,
  },
};

/** Data grid — cores preset active (Layer 2, no settings). */
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

/** Zen grid — waves style active; opens directly on zen category. */
export const ZenFluid: Story = {
  args: {
    widget: { widget: 'zen', style: 'waves' } satisfies HudWidget,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('button', { name: 'waves', pressed: true })).resolves.toBeVisible();
  },
};
