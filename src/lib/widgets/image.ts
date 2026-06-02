import { z } from 'zod';
import type { WidgetDescriptor } from './types.js';

export type ImageWidget = { widget: 'image'; file: string; speed?: number; loop?: boolean };

export const imageSchema = z.object({
  widget: z.literal('image'),
  file: z.string().regex(/^[a-zA-Z0-9_\-]+\.dmx\.json$/i).max(73),
  speed: z.number().min(0.25).max(8).optional(),
  loop: z.boolean().optional(),
});

export const imageDefault: ImageWidget = { widget: 'image', file: 'default.dmx.json' };

export const imageBase = {
  type: 'image' as const,
  schema: imageSchema as z.ZodType<ImageWidget>,
  defaultConfig: imageDefault,
  category: 'media',
  hasSettings: (_: ImageWidget): boolean => false,
} satisfies WidgetDescriptor<ImageWidget>;
