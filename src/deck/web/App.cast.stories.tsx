import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { App } from './App.js';
import { deckStore } from './store.js';
import type { Config } from './types/config-types.js';

const MOCK_CONFIG: Config = {
  modules: {
    left: '/dev/serial/by-path/usb-left',
    right: '/dev/serial/by-path/usb-right',
  },
  brightness: { mode: 'manual', multiplier: 0.14, offset: 7, min: 7, max: 255, hysteresis: 10, manual_value: 100 },
  startup: { animation: 'gol-random', scroll_text: 'DARK MATRIX' },
  daemon: { poll_interval_ms: 500, idle_animation: 'heatmap', idle_after_ms: 300000 },
};

function CastStory({ columns }: { columns: Config['cast_columns'] }) {
  useEffect(() => {
    deckStore.getState().loadConfigData({ ...MOCK_CONFIG, cast_columns: columns });
    deckStore.getState().setActiveMode('cast');
  }, [columns]);
  return <App />;
}
CastStory.displayName = 'App';

const meta = {
  title: 'App/Cast',
  component: CastStory,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof CastStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No columns configured — shows the "add channel" prompt. */
export const Empty: Story = {
  args: { columns: [] },
};

/** Single Twitch channel filling the full width. */
export const SingleColumn: Story = {
  args: { columns: [{ provider: 'twitch', channel: 'moonbeam' }] },
};

/** Three channels sharing the space equally. */
export const MultiColumn: Story = {
  args: {
    columns: [
      { provider: 'twitch', channel: 'moonbeam' },
      { provider: 'twitch', channel: 'codecraft' },
      { provider: 'twitch', channel: 'zephyr_x' },
    ],
  },
};

/** Mix of expanded and collapsed columns. */
export const WithCollapsed: Story = {
  args: {
    columns: [
      { provider: 'twitch', channel: 'moonbeam' },
      { provider: 'twitch', channel: 'codecraft', collapsed: true },
      { provider: 'twitch', channel: 'zephyr_x' },
    ],
  },
};
