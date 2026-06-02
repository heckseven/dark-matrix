import { z } from 'zod';
import { TEXT_STYLES, TEXT_SIZES, TEXT_SPEEDS, TEXT_FLICKERS, TEXT_TRANSITIONS } from '../../animations/text-renderers.js';
import type { WidgetDescriptor } from './types.js';

export type TextStyle = typeof TEXT_STYLES[number];
export type TextSize = typeof TEXT_SIZES[number];
export type TextSpeed = typeof TEXT_SPEEDS[number];
export type TextFlicker = typeof TEXT_FLICKERS[number];
export type TextTransition = typeof TEXT_TRANSITIONS[number];

export type TextWidget = {
  widget: 'text';
  text: string;
  style?: TextStyle;
  size?: TextSize;
  speed?: TextSpeed;
  span?: boolean;
  flicker?: TextFlicker;
  transition?: TextTransition;
  loopDelayMs?: number;
};

export const textSchema = z.object({
  widget: z.literal('text'),
  text: z.string().max(128),
  style: z.enum(TEXT_STYLES).optional().catch(undefined as unknown as TextStyle),
  size: z.enum(TEXT_SIZES).optional().catch(undefined as unknown as TextSize),
  speed: z.enum(TEXT_SPEEDS).optional().catch(undefined as unknown as TextSpeed),
  span: z.boolean().optional(),
  flicker: z.enum(TEXT_FLICKERS).optional().catch(undefined as unknown as TextFlicker),
  transition: z.enum(TEXT_TRANSITIONS).optional().catch(undefined as unknown as TextTransition),
  loopDelayMs: z.number().int().min(0).max(60000).optional(),
});

export const textDefault: TextWidget = { widget: 'text', text: '' };

export const textBase = {
  type: 'text' as const,
  schema: textSchema as z.ZodType<TextWidget>,
  defaultConfig: textDefault,
  category: 'strings',
  hasSettings: (_: TextWidget): boolean => true,
} satisfies WidgetDescriptor<TextWidget>;
