import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const BY_PATH_RE = /^\/dev\/(serial\/by-path\/[a-zA-Z0-9:._-]+|ttyACM\d+|ttyUSB\d+)$/;
const SENSOR_PATH_RE = /^\/sys\/bus\/iio\/devices\/iio:device\d+\/in_illuminance_raw$/;

const HudWidgetSchema = z.discriminatedUnion('widget', [
  z.object({ widget: z.literal('clock'), face: z.enum(['binary-audio', 'elegant', 'stretch', 'analogue', 'binary-blocks', 'binary-tall', 'binary-diamond']) }),
  z.object({ widget: z.literal('data'), style: z.enum(['line', 'bars']).optional(), top_left: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(), top_right: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(), bottom_left: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(), bottom_right: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional() }),
]);

const HudTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('time'), from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) }),
  z.object({ type: z.literal('idle') }),
  z.object({ type: z.literal('active') }),
  z.object({ type: z.literal('threshold'), metric: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']), above: z.number().min(0).optional(), below: z.number().min(0).optional() }),
  z.object({ type: z.literal('interface'), name: z.string(), state: z.enum(['up', 'down']) }),
  z.object({ type: z.literal('vm'), name: z.string(), state: z.enum(['running', 'stopped']).optional() }),
]);

const HudPresetSchema = z.object({
  name: z.string().min(1),
  left: HudWidgetSchema,
  right: HudWidgetSchema,
  triggers: z.array(HudTriggerSchema).optional(),
  match: z.enum(['all', 'any']).optional(),
});

const NotificationRuleSchema = z.object({
  app_name_glob: z.string(),
  urgency: z.enum(['low', 'normal', 'critical', 'any']).optional(),
  animation: z.enum(['scroll', 'dmx', 'none']),
  dmx_path: z.string().regex(/\.dmx\.json$/i).optional(),
});

const ConfigSchema = z.object({
  modules: z.object({
    left: z.string().regex(BY_PATH_RE),
    right: z.string().regex(BY_PATH_RE),
  }),
  brightness: z.object({
    mode: z.enum(['sensor', 'time', 'manual']),
    sensor_path: z.string().regex(SENSOR_PATH_RE),
    multiplier: z.number().min(0).max(10),
    offset: z.number().min(0).max(255),
    min: z.number().int().min(0).max(255),
    max: z.number().int().min(0).max(255),
    hysteresis: z.number().int().min(0),
    manual_value: z.number().int().min(0).max(255),
  }),
  startup: z.object({
    animation: z.enum(['gol-random', 'scroll', 'dmx', 'none']),
    scroll_text: z.string().max(100),
    dmx_path: z.string().regex(/\.dmx\.json$/i).optional(),
  }),
  daemon: z.object({
    poll_interval_ms: z.number().int().min(100).max(60000),
    idle_animation: z.enum(['heatmap', 'audio-eq', 'gol-random', 'scroll', 'gif', 'hud', 'none']),
    idle_after_ms: z.number().int().min(0),
    idle_gif_path: z.string().regex(/\.gif$/i).optional(),
    idle_gif_mode: z.enum(['bw', 'gray']).optional(),
    idle_gif_dual: z.boolean().optional(),
    idle_eq_source: z.enum(['monitor', 'mic']).optional(),
  }),
  hud: z.object({
    left:  HudWidgetSchema.optional(),
    right: HudWidgetSchema.optional(),
  }).optional(),
  notification_rules: z.array(NotificationRuleSchema).optional(),
  hud_presets: z.array(HudPresetSchema).optional().superRefine((presets, ctx) => {
    if (!presets) return;
    const names = presets.map(p => p.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    for (const d of dupes) ctx.addIssue({ code: 'custom', message: `duplicate preset name: "${d}"`, path: [] });
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type HudPreset = z.infer<typeof HudPresetSchema>;
export type HudTrigger = z.infer<typeof HudTriggerSchema>;
export type NotificationRule = z.infer<typeof NotificationRuleSchema>;

export const DEFAULT_CONFIG: Config = {
  modules: {
    left: '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0',
    right: '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0',
  },
  brightness: {
    mode: 'sensor',
    sensor_path: '/sys/bus/iio/devices/iio:device0/in_illuminance_raw',
    multiplier: 0.071,
    offset: 7,
    min: 7,
    max: 255,
    hysteresis: 10,
    manual_value: 100,
  },
  startup: {
    animation: 'gol-random',
    scroll_text: 'DARK MATRIX',
  },
  daemon: {
    poll_interval_ms: 500,
    idle_animation: 'heatmap',
    idle_after_ms: 300000,
  },
};

export class ConfigError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Config validation failed:\n${issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
    this.name = 'ConfigError';
  }
}

function resolveConfigPath(p?: string): string {
  return (
    p ??
    process.env['DARK_MATRIX_CONFIG_PATH'] ??
    path.join(os.homedir(), '.config', 'dark-matrix', 'config.json')
  );
}

export async function loadConfig(p?: string): Promise<Config> {
  const filePath = resolveConfigPath(p);
  const raw = await fs.readFile(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError([{ code: 'custom', message: 'Invalid JSON', path: [] }]);
  }
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) throw new ConfigError(result.error.issues);
  return result.data;
}

export async function writeDefaultConfig(p?: string): Promise<void> {
  const filePath = resolveConfigPath(p);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2), { mode: 0o600 });
}

export function watchConfig(onReload: (c: Config) => void): () => void {
  let current: Config | undefined;

  const handler = () => {
    void (async () => {
      try {
        const c = await loadConfig();
        current = c;
        onReload(c);
      } catch (err) {
        console.warn('dark-matrix: config reload failed, keeping prior config:', err);
      }
    })();
  };

  process.on('SIGHUP', handler);
  return () => process.off('SIGHUP', handler);
}
