import type { ClockFace, ClockWidget } from '../../../lib/widgets/clock.js';
import type { TimerWidget } from '../../../lib/widgets/timer.js';
import type { DataStyle, DataMetric, DataWidget } from '../../../lib/widgets/data.js';
import type { AudioStyle, AudioWidget } from '../../../lib/widgets/audio.js';
import type { ImageWidget } from '../../../lib/widgets/image.js';
import type { LifeWidget } from '../../../lib/widgets/life.js';
import type { ClaudeStyle, ClaudeWidget } from '../../../lib/widgets/claude.js';
import type { ZenStyle, ZenWidget } from '../../../lib/widgets/zen.js';
import type { TextStyle, TextSize, TextSpeed, TextFlicker, TextTransition, TextWidget } from '../../../lib/widgets/text.js';

export type { ClockFace, DataStyle, DataMetric, AudioStyle, ClaudeStyle, ZenStyle, TextStyle, TextSize, TextSpeed, TextFlicker, TextTransition };

export type HudWidget = ClockWidget | TimerWidget | DataWidget | AudioWidget | ImageWidget | LifeWidget | ClaudeWidget | ZenWidget | TextWidget;

export type HudTrigger =
  | { type: 'time'; from: string; to: string }
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
