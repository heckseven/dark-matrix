import type { ClockFace } from '../../../animations/clock-renderers.js';
import type { DataStyle, DataMetric } from '../../../animations/data-renderers.js';
import type { AudioStyle } from '../../../animations/audio-renderers.js';
import type { ClaudeStyle } from '../../../animations/claude-renderers.js';

export type HudWidget =
  | { widget: 'clock'; face?: ClockFace }
  | { widget: 'timer'; style?: 'elegant' | 'hourglass'; durationMs?: number; repeat?: boolean }
  | { widget: 'data'; style?: DataStyle; top_left?: DataMetric; top_right?: DataMetric; bottom_left?: DataMetric; bottom_right?: DataMetric }
  | { widget: 'heatmap' }
  | { widget: 'audio'; style?: AudioStyle }
  | { widget: 'image'; file: string; speed?: number; loop?: boolean }
  | { widget: 'life'; biomeName: string; randomIntervalMs?: number }
  | { widget: 'claude'; style?: ClaudeStyle };

export type HudTrigger =
  | { type: 'time'; from: string; to: string }
  | { type: 'idle' }
  | { type: 'active' }
  | { type: 'threshold'; metric: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; above?: number; below?: number }
  | { type: 'interface'; name: string; state: 'up' | 'down' }
  | { type: 'vm'; name: string; state?: 'running' | 'stopped' }
  | { type: 'day'; days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> }
  | { type: 'date'; month: number; day: number };

export type HudPresetClient = {
  name: string;
  left: HudWidget;
  right: HudWidget;
  triggers?: HudTrigger[];
  match?: 'all' | 'any';
};
