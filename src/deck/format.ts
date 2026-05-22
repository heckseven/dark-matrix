import { z } from 'zod';

export interface DmxFrame {
  delayMs: number;
  pixels: string;
}

export interface DmxProject {
  format: 'dark-matrix';
  version: 1;
  width: 9 | 18;
  height: 34;
  mode: 'bw' | 'gray';
  loop: boolean;
  frames: DmxFrame[];
}

const HEIGHT = 34;

const DmxProjectSchema = z
  .object({
    format: z.literal('dark-matrix'),
    version: z.literal(1),
    width: z.union([z.literal(9), z.literal(18)]),
    height: z.literal(34),
    mode: z.enum(['bw', 'gray']),
    loop: z.boolean(),
    frames: z.array(z.object({ delayMs: z.int().nonnegative(), pixels: z.string() })).min(1),
  })
  .superRefine((data, ctx) => {
    const expectedBytes = data.width * HEIGHT;
    for (let i = 0; i < data.frames.length; i++) {
      const frame = data.frames[i]!;
      const actual = Buffer.from(frame.pixels, 'base64').length;
      if (actual !== expectedBytes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['frames', i, 'pixels'],
          message: `pixels must decode to ${expectedBytes} bytes, got ${actual}`,
        });
      }
    }
  });

export function serializeProject(project: DmxProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): DmxProject {
  const raw: unknown = JSON.parse(json);
  const result = DmxProjectSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data as DmxProject;
}

export function frameToBase64(frame: Uint8Array): string {
  return Buffer.from(frame).toString('base64');
}

export function base64ToFrame(b64: string, expectedBytes: number): Uint8Array {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== expectedBytes) {
    throw new Error(`Expected ${expectedBytes} bytes, got ${buf.length}`);
  }
  return new Uint8Array(buf);
}

export function createBlankFrame(width: number): Uint8Array {
  return new Uint8Array(width * HEIGHT);
}
