import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TriggerView } from './TriggerView.js';
import type { HudTrigger, HudPresetClient } from '../types/hud-preset.js';

const BASE_PRESET: HudPresetClient = {
  name: 'work hours',
  left:  { widget: 'clock', face: 'elegant' },
  right: { widget: 'data',  style: 'line' },
};

const meta = {
  title: 'App/HUD/TriggerView',
  component: TriggerView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Full-screen trigger editor overlay. Opened from the "if" button on a preset card.',
      },
    },
  },
  args: {
    onDone: fn(),
    onChange: fn(),
    onMatchChange: fn(),
  },
} satisfies Meta<typeof TriggerView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No triggers — preset is always active. */
export const Empty: Story = {
  args: {
    preset: { ...BASE_PRESET, name: 'always on' },
  },
};

/** One of each trigger type. */
export const Playground: Story = {
  args: {
    preset: {
      ...BASE_PRESET,
      triggers: [
        { type: 'time',      from: '09:00', to: '18:00' },
        { type: 'idle' },
        { type: 'active' },
        { type: 'day',       days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
        { type: 'date',      month: 12, day: 25 },
        { type: 'threshold', metric: 'cpu', above: 80 },
        { type: 'interface', name: 'eth0', state: 'up' },
        { type: 'vm',        name: 'dev-box', state: 'running' },
      ] satisfies HudTrigger[],
    },
  },
};

/** Two triggers with match control visible. */
export const WithMatchControl: Story = {
  args: {
    preset: {
      ...BASE_PRESET,
      match: 'any',
      triggers: [
        { type: 'time', from: '09:00', to: '17:00' },
        { type: 'day',  days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      ] satisfies HudTrigger[],
    },
  },
};

/** Threshold trigger where above ≥ below — shows conflict warning. */
export const ThresholdConflict: Story = {
  args: {
    preset: {
      ...BASE_PRESET,
      triggers: [
        { type: 'threshold', metric: 'ram', above: 90, below: 50 },
      ] satisfies HudTrigger[],
    },
  },
};

/** Overnight time window — from is later than to. */
export const OvernightWindow: Story = {
  args: {
    preset: {
      ...BASE_PRESET,
      name: 'night mode',
      triggers: [
        { type: 'time', from: '22:00', to: '06:00' },
      ] satisfies HudTrigger[],
    },
  },
};
