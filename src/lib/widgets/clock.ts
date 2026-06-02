import { z } from 'zod';
import type { WidgetDescriptor } from './types.js';

export type ClockFace = 'binary-audio' | 'elegant' | 'stretch' | 'analog' | 'binary-blocks' | 'binary-tall' | 'binary-diamond' | 'twinz' | 'razor' | 'blade';
export type ClockWidget = { widget: 'clock'; face?: ClockFace };

export const clockSchema = z.object({
  widget: z.literal('clock'),
  face: z.enum(['binary-audio', 'elegant', 'stretch', 'analog', 'binary-blocks', 'binary-tall', 'binary-diamond', 'twinz', 'razor', 'blade']).optional().catch('elegant' as ClockFace),
});

export const clockDefault: ClockWidget = { widget: 'clock', face: 'elegant' };

export const clockBase = {
  type: 'clock' as const,
  schema: clockSchema as z.ZodType<ClockWidget>,
  defaultConfig: clockDefault,
  category: 'time',
  hasSettings: (_: ClockWidget): boolean => false,
} satisfies WidgetDescriptor<ClockWidget>;
