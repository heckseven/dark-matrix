import { z } from 'zod';
import { AUDIO_STYLES } from '../../animations/audio-renderers.js';
import type { WidgetDescriptor } from './types.js';

// Derive the enum values at runtime from the canonical list
const AUDIO_STYLE_VALUES = AUDIO_STYLES.map(s => s.id) as [string, ...string[]];

export type AudioStyle = typeof AUDIO_STYLE_VALUES[number];
export type AudioWidget = { widget: 'audio'; style?: AudioStyle };

export const audioSchema = z.object({
  widget: z.literal('audio'),
  style: z.enum(AUDIO_STYLE_VALUES).optional().catch(undefined as unknown as AudioStyle),
});

export const audioDefault: AudioWidget = { widget: 'audio' };

export const audioBase = {
  type: 'audio' as const,
  schema: audioSchema as z.ZodType<AudioWidget>,
  defaultConfig: audioDefault,
  category: 'audio',
  hasSettings: (_: AudioWidget): boolean => false,
} satisfies WidgetDescriptor<AudioWidget>;
