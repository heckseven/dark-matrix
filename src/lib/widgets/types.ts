import type { ZodType } from 'zod';

export interface WidgetDescriptor<T extends { widget: string }> {
  readonly type: T['widget'];
  readonly schema: ZodType<T>;
  readonly defaultConfig: T;
  readonly category: string;
  readonly hasSettings: (config: T) => boolean;
}
