import { z } from 'zod';
import { ZEN_STYLE_VALUES } from '../../animations/zen-renderers.js';
import type { WidgetDescriptor } from './types.js';

export type ZenStyle = typeof ZEN_STYLE_VALUES[number];
export type ZenWidget = { widget: 'zen'; style?: ZenStyle };

export const zenSchema = z.object({
  widget: z.literal('zen'),
  style: z.enum(ZEN_STYLE_VALUES).optional().catch(undefined as unknown as ZenStyle),
});

export const zenDefault: ZenWidget = { widget: 'zen', style: 'waves' };

export const zenBase = {
  type: 'zen' as const,
  schema: zenSchema as z.ZodType<ZenWidget>,
  defaultConfig: zenDefault,
  category: 'zen',
  hasSettings: (_: ZenWidget): boolean => false,
} satisfies WidgetDescriptor<ZenWidget>;
