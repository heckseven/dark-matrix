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

/** Text marquee rules — desktop-notification and suppress. */
export const TextRules: Story = {
  args: {
    value: [
      { app_name_glob: 'Slack', animation: 'text' },
      { app_name_glob: 'system-daemon', animation: 'suppress' },
    ] satisfies NotificationRule[],
  },
};

/** Desktop notification with text (replace) — existing default behavior. */
export const TextReplace: Story = {
  args: {
    value: [
      { source: 'desktop-notification', app_name_glob: '*', animation: 'text' },
    ] satisfies NotificationRule[],
  },
};

/** Design overlay — design file over HUD for 5 seconds. */
export const DesignOverlaySlack: Story = {
  args: {
    value: [
      {
        source: 'desktop-notification',
        app_name_glob: 'Slack',
        animation: 'design',
        asset_path: 'skulltalkk.dmx.json',
        composite: 'overlay',
        duration_ms_override: 5000,
      },
    ] satisfies NotificationRule[],
  },
};

/** Design animation overlay — runs design over HUD. */
export const DesignOverlay: Story = {
  args: {
    value: [
      {
        source: 'desktop-notification',
        app_name_glob: 'Calendar',
        animation: 'design',
        asset_path: 'reminder.dmx.json',
        composite: 'overlay',
        duration_ms_override: 3000,
      },
    ] satisfies NotificationRule[],
  },
};

/** EC switch source — mute/unmute events use text overlay. */
export const EcSwitchSource: Story = {
  args: {
    value: [
      { source: 'ec-switch', animation: 'text', composite: 'overlay' },
    ] satisfies NotificationRule[],
  },
};

/** VM source with content glob — matches specific VM events. */
export const VmContentGlob: Story = {
  args: {
    value: [
      { source: 'vm', content_glob: 'VM UP*', animation: 'design', asset_path: 'vm-up.dmx.json', duration_ms_override: 4000 },
      { source: 'vm', content_glob: 'VM DN*', animation: 'suppress' },
    ] satisfies NotificationRule[],
  },
};

/** Mixed rules — multiple sources and styles. */
export const Mixed: Story = {
  args: {
    value: [
      { source: 'ec-switch', animation: 'text', text_style: 'neon', composite: 'overlay' },
      { source: 'desktop-notification', app_name_glob: 'Slack', animation: 'design', asset_path: 'alert.dmx.json', duration_ms_override: 5000 },
      { source: 'desktop-notification', app_name_glob: '*', animation: 'text', text_style: 'bigglyph' },
      { source: 'vm', animation: 'suppress' },
    ] satisfies NotificationRule[],
  },
};
