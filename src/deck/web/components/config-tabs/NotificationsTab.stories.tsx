import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { NotificationsTab } from './NotificationsTab.js';
import type { NotificationRule } from './NotificationsTab.js';

const meta = {
  title: 'App/Notifications',
  component: NotificationsTab,
  parameters: {
    layout: 'padded',
  },
  args: {
    value: [],
    onChange: fn(),
  },
} satisfies Meta<typeof NotificationsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No rules configured — shows the "add rule" button and empty state. */
export const Empty: Story = {};

/** Legacy rules — desktop-notification source with app_name_glob. */
export const LegacyRules: Story = {
  args: {
    value: [
      { app_name_glob: 'Slack', animation: 'scroll' },
      { app_name_glob: 'system-daemon', animation: 'none' },
    ] satisfies NotificationRule[],
  },
};

/** Desktop notification with scroll (replace) — existing default behavior. */
export const ScrollReplace: Story = {
  args: {
    value: [
      { source: 'desktop-notification', app_name_glob: '*', animation: 'scroll' },
    ] satisfies NotificationRule[],
  },
};

/** DMX overlay — skulltalkk over HUD for 5 seconds. */
export const DmxOverlaySlack: Story = {
  args: {
    value: [
      {
        source: 'desktop-notification',
        app_name_glob: 'Slack',
        animation: 'dmx',
        asset_path: 'skulltalkk.dmx.json',
        composite: 'overlay',
        duration_ms_override: 5000,
      },
    ] satisfies NotificationRule[],
  },
};

/** DMX animation overlay — runs DMX over HUD. */
export const DmxOverlay: Story = {
  args: {
    value: [
      {
        source: 'desktop-notification',
        app_name_glob: 'Calendar',
        animation: 'dmx',
        asset_path: 'reminder.dmx.json',
        composite: 'overlay',
        duration_ms_override: 3000,
      },
    ] satisfies NotificationRule[],
  },
};

/** EC switch source — mute/unmute events use scroll overlay. */
export const EcSwitchSource: Story = {
  args: {
    value: [
      { source: 'ec-switch', animation: 'scroll', composite: 'overlay' },
    ] satisfies NotificationRule[],
  },
};

/** VM source with content glob — matches specific VM events. */
export const VmContentGlob: Story = {
  args: {
    value: [
      { source: 'vm', content_glob: 'VM UP*', animation: 'dmx', asset_path: 'vm-up.dmx.json', duration_ms_override: 4000 },
      { source: 'vm', content_glob: 'VM DN*', animation: 'none' },
    ] satisfies NotificationRule[],
  },
};

/** Mixed rules — multiple sources and styles. */
export const Mixed: Story = {
  args: {
    value: [
      { source: 'ec-switch', animation: 'scroll', composite: 'overlay' },
      { source: 'desktop-notification', app_name_glob: 'Slack', animation: 'dmx', asset_path: 'alert.dmx.json', duration_ms_override: 5000 },
      { source: 'desktop-notification', app_name_glob: '*', animation: 'scroll' },
      { source: 'vm', animation: 'none' },
    ] satisfies NotificationRule[],
  },
};
