import type { ClockFace } from '../../../animations/clock-renderers.js';
import type { DataStyle, DataMetric } from '../../../animations/data-renderers.js';

export type HudWidget =
  | { widget: 'clock'; face?: ClockFace }
  | { widget: 'data'; style?: DataStyle; top_left?: DataMetric; top_right?: DataMetric; bottom_left?: DataMetric; bottom_right?: DataMetric };

export type HudTrigger =
  | { type: 'time'; from: string; to: string }
  | { type: 'idle' }
  | { type: 'active' }
  | { type: 'threshold'; metric: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; above?: number; below?: number }
  | { type: 'interface'; name: string; state: 'up' | 'down' }
  | { type: 'vm'; name: string; state?: 'running' | 'stopped' };

export type HudPresetClient = {
  name: string;
  left: HudWidget;
  right: HudWidget;
  triggers?: HudTrigger[];
  match?: 'all' | 'any';
};
