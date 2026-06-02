import { z } from 'zod';
import type { WidgetDescriptor } from './types.js';

export type DataStyle = 'line' | 'fill' | 'scroll' | 'cores' | 'heatcore' | 'gpuburn';
export type DataMetric = 'cpu' | 'ram' | 'net_rx' | 'net_tx';
export type DataWidget = {
  widget: 'data';
  style?: DataStyle;
  top_left?: DataMetric;
  top_right?: DataMetric;
  bottom_left?: DataMetric;
  bottom_right?: DataMetric;
};

export const dataSchema = z.object({
  widget: z.literal('data'),
  style: z.enum(['line', 'fill', 'scroll', 'cores', 'heatcore', 'gpuburn']).optional().catch(undefined as unknown as DataStyle),
  top_left: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(),
  top_right: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(),
  bottom_left: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(),
  bottom_right: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(),
});

export const dataDefault: DataWidget = { widget: 'data', style: 'line' };

export const dataBase = {
  type: 'data' as const,
  schema: dataSchema as z.ZodType<DataWidget>,
  defaultConfig: dataDefault,
  category: 'data',
  hasSettings: (w: DataWidget): boolean =>
    w.style === 'line' || w.style === 'fill' || w.style === 'scroll' || w.style === undefined,
} satisfies WidgetDescriptor<DataWidget>;
