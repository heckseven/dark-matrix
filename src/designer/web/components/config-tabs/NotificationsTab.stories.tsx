import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { NotificationsTab } from './NotificationsTab.js';
import type { NotificationRule } from './NotificationsTab.js';

const meta = {
  title: 'App/Config/Notifications',
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

/** Two rules: Slack with urgency filter, system-daemon with no animation. */
export const WithRules: Story = {
  args: {
    value: [
      { app_name_glob: 'Slack', urgency: 'normal', animation: 'scroll' },
      { app_name_glob: 'system-daemon', animation: 'none' },
    ] satisfies NotificationRule[],
  },
};

/** DMX rule — shows the dmx_path input field. */
export const DmxRule: Story = {
  args: {
    value: [
      { app_name_glob: '*', animation: 'dmx', dmx_path: 'notification.dmx.json' },
    ] satisfies NotificationRule[],
  },
};
