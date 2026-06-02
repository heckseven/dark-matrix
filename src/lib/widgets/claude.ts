import { z } from 'zod';
import type { WidgetDescriptor } from './types.js';

export type ClaudeStyle = 'snow' | 'quota' | 'sand' | 'tetris';
export type ClaudeWidget = { widget: 'claude'; style?: ClaudeStyle };

export const claudeSchema = z.object({
  widget: z.literal('claude'),
  style: z.enum(['snow', 'quota', 'sand', 'tetris']).optional().catch(undefined as unknown as ClaudeStyle),
});

export const claudeDefault: ClaudeWidget = { widget: 'claude', style: 'snow' };

export const claudeBase = {
  type: 'claude' as const,
  schema: claudeSchema as z.ZodType<ClaudeWidget>,
  defaultConfig: claudeDefault,
  category: 'agent',
  hasSettings: (_: ClaudeWidget): boolean => false,
} satisfies WidgetDescriptor<ClaudeWidget>;
