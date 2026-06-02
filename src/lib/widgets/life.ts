import { z } from 'zod';
import type { WidgetDescriptor } from './types.js';

export type LifeWidget = { widget: 'life'; biomeName: string; randomIntervalMs?: number };

export const lifeSchema = z.object({
  widget: z.literal('life'),
  biomeName: z.string().min(1).max(100),
  randomIntervalMs: z.number().int().min(5000).max(3_600_000).optional(),
});

export const lifeDefault: LifeWidget = { widget: 'life', biomeName: 'random' };

export const lifeBase = {
  type: 'life' as const,
  schema: lifeSchema as z.ZodType<LifeWidget>,
  defaultConfig: lifeDefault,
  category: 'life',
  hasSettings: (w: LifeWidget): boolean => w.biomeName === 'random',
} satisfies WidgetDescriptor<LifeWidget>;
