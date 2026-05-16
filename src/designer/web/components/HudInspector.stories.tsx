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

/** Picker with a clock assigned — elegant face marked active in the panel list. */
export const PickerWithClock: Story = {
  args: {
    widget: { widget: 'clock', face: 'elegant' } satisfies HudWidget,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Select different panel' }));
    expect(canvas.getByRole('button', { name: 'elegant', pressed: true })).toBeVisible();
  },
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

/** Data settings — system preset (line, all 4 metrics). */
export const DataSystem: Story = {
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

/** Picker with data assigned — system preset tile marked active. */
export const PickerWithData: Story = {
  ...DataSystem,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Select different panel' }));
    expect(canvas.getByRole('button', { name: 'system', pressed: true })).toBeVisible();
  },
};

/** Data settings — fill preset (area chart, all 4 metrics). */
export const DataFill: Story = {
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

/** Data settings — scroll preset (cpu core history). */
export const DataScroll: Story = {
  args: {
    widget: {
      widget: 'data',
      style: 'scroll',
    } satisfies HudWidget,
  },
};

/** Data settings — cpu cores preset (symmetric column per CPU group). */
export const DataCpuCores: Story = {
  args: {
    widget: {
      widget: 'data',
      style: 'cores',
    } satisfies HudWidget,
  },
};

/** AI picker — tool heatmap widget selected, stays in picker (no settings). */
export const HeatmapAi: Story = {
  args: {
    widget: { widget: 'heatmap' } satisfies HudWidget,
  },
};
