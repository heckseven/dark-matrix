import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { TriggerEditor } from './TriggerEditor.js';
import type { HudTrigger } from '../types/hud-preset.js';

const meta = {
  title: 'HUD/TriggerEditor',
  component: TriggerEditor,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Collapsible trigger list editor for HUD presets. Supports time, idle, active, threshold, interface, and vm trigger types.',
      },
    },
  },
  args: {
    triggers: [],
    onChange: fn(),
  },
} satisfies Meta<typeof TriggerEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No triggers configured. */
export const Empty: Story = {};

/** One of each trigger type. */
export const Playground: Story = {
  args: {
    triggers: [
      { type: 'time', from: '09:00', to: '18:00' },
      { type: 'idle' },
      { type: 'active' },
      { type: 'threshold', metric: 'cpu', above: 80 },
      { type: 'interface', name: 'eth0', state: 'up' },
      { type: 'vm', name: 'dev-box', state: 'running' },
    ] satisfies HudTrigger[],
  },
};

/** Single time trigger with from/to filled. */
export const TimeRange: Story = {
  args: {
    triggers: [
      { type: 'time', from: '22:00', to: '06:00' },
    ] satisfies HudTrigger[],
  },
};

/** Threshold trigger where above >= below — shows warning indicator. */
export const ThresholdWithConflict: Story = {
  args: {
    triggers: [
      { type: 'threshold', metric: 'ram', above: 90, below: 50 },
    ] satisfies HudTrigger[],
  },
};

/** Three triggers: time + threshold + vm. */
export const MultiTrigger: Story = {
  args: {
    triggers: [
      { type: 'time', from: '08:00', to: '17:00' },
      { type: 'threshold', metric: 'net_rx', above: 10 },
      { type: 'vm', name: 'homelab' },
    ] satisfies HudTrigger[],
  },
};
