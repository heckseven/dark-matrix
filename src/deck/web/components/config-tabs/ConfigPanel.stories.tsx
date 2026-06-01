import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { ConfigPanel } from '../ConfigPanel.js';
import { deckStore } from '../../store.js';
import type { Config } from '../../types/config-types.js';

// ── fixture ──────────────────────────────────────────────────────────────────

const MOCK_CONFIG: Config = {
  modules: {
    left: '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0',
    right: '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0',
  },
  brightness: {
    mode: 'sensor',
    sensor_path: '/sys/bus/iio/devices/iio:device0/in_illuminance_raw',
    multiplier: 0.071,
    offset: 7,
    min: 7,
    max: 255,
    hysteresis: 10,
    manual_value: 100,
  },
  startup: {
    animation: 'gol-random',
    scroll_text: 'DARK MATRIX',
  },
  daemon: {
    poll_interval_ms: 500,
  },
};

// ── fetch mock ───────────────────────────────────────────────────────────────
//
// ConfigPanel fetches /api/config on mount. In Storybook, the fetch will fail
// gracefully (shows "loading…"). Stories that need config loaded pre-seed the
// store directly instead.

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'App/Config/ConfigPanel',
  component: ConfigPanel,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
} satisfies Meta<typeof ConfigPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ──────────────────────────────────────────────────────────────────

/** Default state — fetch fires on mount (will fail gracefully in Storybook, showing "loading…"). */
export const Playground: Story = {
  args: { dualModule: false, topPad: 0 },
  decorators: [
    (Story) => {
      useEffect(() => {
        deckStore.getState().loadConfigData(MOCK_CONFIG);
      }, []);
      return (
        <div style={{ height: '100vh', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Dirty state — unsaved changes indicator (amber dot) visible in the header. */
export const DirtyState: Story = {
  args: { dualModule: false, topPad: 0 },
  decorators: [
    (Story) => {
      useEffect(() => {
        deckStore.getState().loadConfigData(MOCK_CONFIG);
        deckStore.setState({ configDirty: true });
      }, []);
      return (
        <div style={{ height: '100vh', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Dirty state with richer config — notification rules and all optional daemon fields populated. */
export const DirtyWithAllTabs: Story = {
  args: { dualModule: true, topPad: 0 },
  decorators: [
    (Story) => {
      useEffect(() => {
        const config: Config = {
          ...MOCK_CONFIG,
          daemon: {
            poll_interval_ms: 1000,
          },
          startup: {
            animation: 'dmx',
            scroll_text: '',
            dmx_path: '/home/user/startup.dmx.json',
          },
          notification_rules: [
            { app_name_glob: 'slack', urgency: 'normal', animation: 'text' },
            { app_name_glob: '*', animation: 'design', dmx_path: '/home/user/notif.dmx.json' },
          ],
          hud_presets: [
            { name: 'day', left: { widget: 'clock', face: 'elegant' }, right: { widget: 'data' } },
          ],
        };
        deckStore.getState().loadConfigData(config);
        deckStore.setState({ configDirty: true });
      }, []);
      return (
        <div style={{ height: '100vh', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};
