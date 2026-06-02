import { z } from 'zod';
import type { WidgetDescriptor } from './types.js';

export type TimerStyle = 'elegant' | 'hourglass' | 'twinz';
export type TimerWidget = { widget: 'timer'; style?: TimerStyle; durationMs?: number; repeat?: boolean };

export const timerSchema = z.object({
  widget: z.literal('timer'),
  style: z.enum(['elegant', 'hourglass', 'twinz']).optional().catch(undefined as unknown as TimerStyle),
  durationMs: z.number().int().min(1000).optional(),
  repeat: z.boolean().optional(),
});

export const timerDefault: TimerWidget = { widget: 'timer', style: 'elegant' };

export const timerBase = {
  type: 'timer' as const,
  schema: timerSchema as z.ZodType<TimerWidget>,
  defaultConfig: timerDefault,
  category: 'timer',
  hasSettings: (_: TimerWidget): boolean => true,
} satisfies WidgetDescriptor<TimerWidget>;
