import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { enumerateMatrixModules } from './modules.js';
import { TEXT_STYLES, TEXT_SIZES, TEXT_SPEEDS, TEXT_FLICKERS, TEXT_TRANSITIONS } from '../animations/text-renderers.js';
import { AUDIO_STYLES } from '../animations/audio-renderers.js';
import { ZEN_STYLE_VALUES } from '../animations/zen-renderers.js';

const CAST_VISUALIZER_VALUES = ['off', ...AUDIO_STYLES.map(s => s.id)] as [string, ...string[]];

const BY_PATH_RE = /^\/dev\/(serial\/by-path\/[a-zA-Z0-9:._-]+|ttyACM\d+|ttyUSB\d+)$/;
const SENSOR_PATH_RE = /^\/sys\/bus\/iio\/devices\/iio:device\d+\/in_illuminance_raw$/;

// Style enums use .catch(undefined): a known widget that references a removed
// style keeps its widget type and falls back to the renderer's default style,
// rather than failing the whole config. Clock face .catch('elegant') likewise.
const HudWidgetSchema = z.discriminatedUnion('widget', [
  z.object({ widget: z.literal('clock'), face: z.enum(['binary-audio', 'elegant', 'stretch', 'analog', 'binary-blocks', 'binary-tall', 'binary-diamond', 'twinz', 'razor', 'blade']).optional().catch('elegant') }),
  z.object({ widget: z.literal('data'), style: z.enum(['line', 'fill', 'scroll', 'cores']).optional().catch(undefined), top_left: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(), top_right: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(), bottom_left: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional(), bottom_right: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']).optional() }),
  z.object({ widget: z.literal('audio'), style: z.enum(['vu-glitch', 'circuit', 'spirits', 'scope-dual', 'kick-d', 'waterfall', 'sparks', 'hex', 'specter', 'heat', 'dark-matter', 'spectrum-fall', 'neo', 'cipher', 'wake', 'rhythm', 'drop', 'life-erode-4', 'glitch-sort-b', 'spiral-d', 'strobe', 'glitch-corrupt']).optional().catch(undefined) }),
  z.object({ widget: z.literal('image'), file: z.string().regex(/^[a-zA-Z0-9_\-]+\.dmx\.json$/i).max(73), speed: z.number().min(0.25).max(8).optional(), loop: z.boolean().optional() }),
  z.object({ widget: z.literal('life'), biomeName: z.string().min(1).max(100), randomIntervalMs: z.number().int().min(5000).max(3_600_000).optional() }),
  z.object({ widget: z.literal('claude'), style: z.enum(['snow', 'quota', 'sand', 'tetris']).optional().catch(undefined) }),
  z.object({ widget: z.literal('zen'), style: z.enum(ZEN_STYLE_VALUES).optional().catch(undefined) }),
  z.object({ widget: z.literal('timer'), style: z.enum(['elegant', 'hourglass', 'twinz']).optional().catch(undefined), durationMs: z.number().int().min(1000).optional(), repeat: z.boolean().optional() }),
  z.object({ widget: z.literal('text'), text: z.string().max(128), style: z.enum(TEXT_STYLES).optional().catch(undefined), size: z.enum(TEXT_SIZES).optional().catch(undefined), speed: z.enum(TEXT_SPEEDS).optional().catch(undefined), span: z.boolean().optional(), flicker: z.enum(TEXT_FLICKERS).optional().catch(undefined), transition: z.enum(TEXT_TRANSITIONS).optional().catch(undefined), loopDelayMs: z.number().int().min(0).max(60000).optional() }),
]);

// A preset slot referencing a removed widget *type* (e.g. a deleted widget)
// degrades to a plain clock instead of crashing config load. Healed in memory
// only — the file on disk is left untouched.
const HUD_WIDGET_FALLBACK = { widget: 'clock', face: 'elegant' } as const;
const HudWidgetSlot = HudWidgetSchema.catch(HUD_WIDGET_FALLBACK);

const HudTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('time'), from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) }),
  z.object({ type: z.literal('threshold'), metric: z.enum(['cpu', 'ram', 'net_rx', 'net_tx']), above: z.number().min(0).optional(), below: z.number().min(0).optional() }),
  z.object({ type: z.literal('interface'), name: z.string(), state: z.enum(['up', 'down']) }),
  z.object({ type: z.literal('vm'), name: z.string(), state: z.enum(['running', 'stopped']).optional() }),
  z.object({ type: z.literal('day'), days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])) }),
  z.object({ type: z.literal('date'), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
]);

// Known trigger discriminants. A preset on disk may still reference a removed
// trigger type — idle/active were dropped when the HUD became the unconditional
// resting state — so such entries are filtered out on load rather than failing
// the whole config (healed in memory only; the file on disk is left untouched).
const KNOWN_TRIGGER_TYPES = new Set(['time', 'threshold', 'interface', 'vm', 'day', 'date']);

const HudPresetSchema = z.object({
  name: z.string().min(1),
  left: HudWidgetSlot,
  right: HudWidgetSlot,
  triggers: z.preprocess(
    (v) => Array.isArray(v) ? v.filter(t => t && typeof t === 'object' && KNOWN_TRIGGER_TYPES.has((t as { type?: unknown }).type as string)) : v,
    z.array(HudTriggerSchema).optional(),
  ),
  match: z.enum(['all', 'any']).optional(),
});

const NotificationRuleSchema = z.object({
  app_name_glob: z.string().optional(),
  urgency: z.enum(['low', 'normal', 'critical', 'any']).optional(),
  animation: z.enum(['scroll', 'dmx', 'none']),
  scroll_text: z.string().max(200).optional(),
  scroll_size: z.enum(['tiny', 'small', 'medium', 'large']).optional(),
  dmx_path: z.string().regex(/\.dmx\.json$/i).optional(),
  source: z.enum(['ec-switch', 'vm', 'claude', 'desktop-notification', 'manual', 'twitch']).optional(),
  content_glob: z.string().optional(),
  asset_path: z.string().optional(),
  composite: z.enum(['replace', 'overlay']).optional(),
  overlay_mode: z.enum(['or', 'replace', 'xor', 'halo']).optional(),
  transition: z.enum(['wipe', 'scan', 'slide', 'dissolve', 'flash']).optional(),
  duration_ms_override: z.number().int().positive().optional(),
  loop_count: z.number().int().min(1).optional(),
  mirror: z.boolean().optional(),
  side: z.enum(['left', 'right']).optional(),
});

const CastColumnSchema = z.object({
  provider: z.enum(['twitch']),
  channel: z.string().regex(/^[a-zA-Z0-9_]{1,25}$/),
  collapsed: z.boolean().optional(),
});

const TwitchConfigSchema = z.object({
  client_id: z.string().optional(),
  broadcaster_id: z.string().optional(),
});

const AppearanceSchema = z.object({
  preset: z.enum(['dark-matrix', 'phosphor', 'mono', 'custom']),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  color_scheme: z.enum(['dark', 'light', 'auto']),
}).superRefine((a, ctx) => {
  if (a.preset === 'custom' && !a.accent) {
    ctx.addIssue({ code: 'custom', message: 'accent is required when preset is "custom"', path: ['accent'] });
  }
});

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  uncalibrated: z.boolean().optional(),
  modules: z.object({
    left: z.string().regex(BY_PATH_RE),
    right: z.string().regex(BY_PATH_RE),
  }),
  brightness: z.object({
    mode: z.enum(['sensor', 'time', 'manual']),
    sensor_path: z.string().regex(SENSOR_PATH_RE).optional(),
    multiplier: z.number().min(0).max(10),
    offset: z.number().min(0).max(255),
    min: z.number().int().min(0).max(255),
    max: z.number().int().min(0).max(255),
    hysteresis: z.number().int().min(0),
    manual_value: z.number().int().min(0).max(255),
  }).superRefine((b, ctx) => {
    if (b.mode === 'sensor' && !b.sensor_path) {
      ctx.addIssue({ code: 'custom', message: 'sensor_path is required when mode is "sensor"', path: ['sensor_path'] });
    }
  }),
  startup: z.object({
    animation: z.enum(['gol-random', 'scroll', 'dmx', 'none']),
    scroll_text: z.string().max(100),
    dmx_path: z.string().regex(/\.dmx\.json$/i).optional(),
    overlay_mode: z.enum(['or', 'replace', 'xor', 'halo']).optional(),
    transition: z.enum(['wipe', 'scan', 'slide', 'dissolve', 'flash']).optional(),
    dmx_duration_ms: z.number().int().positive().optional(),
  }),
  daemon: z.object({
    poll_interval_ms: z.number().int().min(100).max(60000),
  }),
  hud: z.object({
    left:  HudWidgetSlot.optional(),
    right: HudWidgetSlot.optional(),
  }).optional(),
  ectool_path: z.string().regex(/^\/[a-zA-Z0-9_\-.\/]+$/).optional(),
  notification_rules: z.array(NotificationRuleSchema).optional(),
  active_hud_preset: z.string().optional(),
  hud_presets: z.array(HudPresetSchema).optional().superRefine((presets, ctx) => {
    if (!presets) return;
    const names = presets.map(p => p.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    for (const d of dupes) ctx.addIssue({ code: 'custom', message: `duplicate preset name: "${d}"`, path: [] });
  }),
  twitch: TwitchConfigSchema.optional(),
  cast_columns: z.array(CastColumnSchema).max(5).optional(),
  cast_visualizer: z.enum(CAST_VISUALIZER_VALUES).optional(),
  cast_audio_source: z.enum(['monitor', 'mic']).optional(),
  appearance: AppearanceSchema.optional(),
  biome_presets: z.array(z.object({
    name: z.string().min(1),
    algorithm: z.enum(['conway', 'highlife', 'daynight', 'maze', 'coral', 'anneal', 'morley', '2x2', 'stains', 'diamoeba']),
    tickMs: z.number().int().min(16).max(2000),
    spawnRate: z.number().int().min(0).max(20).optional(),
    spawnMode: z.enum(['scatter', 'cluster', 'edge']).optional(),
    adaptiveSpawn: z.boolean().optional(),
    adaptiveThreshold: z.number().min(0.01).max(0.5).optional(),
    stasisAction: z.enum(['off', 'inject', 'restart']).optional(),
    stasisTicks: z.number().int().min(1).max(60).optional(),
    invertMode: z.enum(['off', 'threshold']).optional(),
    invertAt: z.number().min(0.1).max(0.99).optional(),
    restoreAt: z.number().min(0.01).max(0.9).optional(),
    gridSnapshot: z.string().max(820).optional(),
    rerunMode: z.enum(['off', 'time', 'generations']).optional(),
    rerunAfterMs: z.number().int().min(5000).max(3_600_000).optional(),
    rerunAfterGenerations: z.number().int().min(50).max(10_000).optional(),
  })).optional().superRefine((presets, ctx) => {
    if (!presets) return;
    const names = presets.map(p => p.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    for (const d of dupes) ctx.addIssue({ code: 'custom', message: `duplicate biome name: "${d}"`, path: [] });
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Appearance = z.infer<typeof AppearanceSchema>;
export type HudPreset = z.infer<typeof HudPresetSchema>;
export type HudTrigger = z.infer<typeof HudTriggerSchema>;
export type NotificationRule = z.infer<typeof NotificationRuleSchema>;

export const DEFAULT_CONFIG: Config = {
  version: 1,
  modules: {
    left: '/dev/serial/by-path/unconfigured-left',
    right: '/dev/serial/by-path/unconfigured-right',
  },
  brightness: {
    mode: 'manual',
    multiplier: 0.7,
    offset: 14,
    min: 14,
    max: 255,
    hysteresis: 10,
    manual_value: 150,
  },
  startup: {
    animation: 'dmx',
    scroll_text: 'DARK MATRIX',
    dmx_path: 'dark-matrix.dmx.json',
  },
  daemon: {
    poll_interval_ms: 500,
  },
  active_hud_preset: 'time_core',
  hud_presets: [
    {
      name: 'time_core',
      left: { widget: 'clock', face: 'stretch' },
      right: { widget: 'data', style: 'cores' },
    },
    {
      name: 'audio_dark',
      left: { widget: 'audio', style: 'dark-matter' },
      right: { widget: 'audio', style: 'dark-matter' },
    },
    {
      name: 'lulz',
      left: { widget: 'image', file: 'lulz.dmx.json' },
      right: { widget: 'image', file: 'lulz.dmx.json' },
    },
  ],
  notification_rules: [
    { source: 'desktop-notification', animation: 'scroll', scroll_size: 'small' },
    { source: 'ec-switch', animation: 'scroll', scroll_size: 'medium' },
    { source: 'claude', content_glob: 'INPUT', animation: 'dmx', asset_path: 'claude_jump.dmx.json', loop_count: 3 },
    { source: 'vm', animation: 'scroll', scroll_size: 'small' },
  ],
};

export class ConfigError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Config validation failed:\n${issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
    this.name = 'ConfigError';
  }
}

export function resolveConfigPath(p?: string): string {
  return (
    p ??
    process.env['DARK_MATRIX_CONFIG_PATH'] ??
    path.join(os.homedir(), '.config', 'dark-matrix', 'config.json')
  );
}

// Write JSON via a temp file + rename so a crash or a concurrent writer never
// leaves a truncated file. rename() is atomic on the same filesystem.
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, filePath);
}

export function resolveSocketPath(): string {
  return (
    process.env['DARK_MATRIX_SOCKET'] ??
    `${process.env['XDG_RUNTIME_DIR'] ?? `/run/user/${process.getuid!()}`}/dark-matrix.sock`
  );
}

export async function loadConfig(p?: string): Promise<Config> {
  const filePath = resolveConfigPath(p);
  const raw = await fs.readFile(filePath, 'utf-8');
  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(raw);
  } catch {
    throw new ConfigError([{ code: 'custom', message: 'Invalid JSON', path: [] }]);
  }
  if (typeof rawParsed !== 'object' || rawParsed === null || Array.isArray(rawParsed)) {
    throw new ConfigError([{ code: 'custom', message: 'Config must be a JSON object', path: [] }]);
  }
  const result = ConfigSchema.safeParse(rawParsed);
  if (!result.success) throw new ConfigError(result.error.issues);
  return result.data;
}

export async function writeDefaultConfig(p?: string): Promise<void> {
  const filePath = resolveConfigPath(p);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2), { mode: 0o600 });
}

export async function bootstrapConfig(p?: string): Promise<void> {
  const found = (await enumerateMatrixModules().catch(() => [])).sort();
  const modules = found.length === 2
    ? { left: found[0]!, right: found[1]! }
    : DEFAULT_CONFIG.modules;

  const IIO_DIR = '/sys/bus/iio/devices';
  const entries = await fs.readdir(IIO_DIR).catch(() => [] as string[]);
  let sensorPath: string | undefined;
  for (const entry of entries) {
    if (!entry.startsWith('iio:device')) continue;
    const candidate = `${IIO_DIR}/${entry}/in_illuminance_raw`;
    if (!SENSOR_PATH_RE.test(candidate)) continue;
    try {
      await fs.access(candidate);
      sensorPath = candidate;
      break;
    } catch {
      // not accessible, try next
    }
  }

  let brightness: Config['brightness'];
  if (sensorPath !== undefined) {
    process.stdout.write(`Detected sensor at ${sensorPath}\n`);
    brightness = { ...DEFAULT_CONFIG.brightness, mode: 'sensor', sensor_path: sensorPath };
  } else {
    process.stdout.write('No IIO sensor found, defaulting to manual brightness\n');
    const { sensor_path: _sp, ...rest } = DEFAULT_CONFIG.brightness;
    brightness = { ...rest, mode: 'manual' };
  }

  const ectoolPath = await findOnPath('ectool');
  if (ectoolPath) process.stdout.write(`Detected ectool at ${ectoolPath}\n`);

  const filePath = resolveConfigPath(p);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const extra = ectoolPath ? { ectool_path: ectoolPath } : {};
  await fs.writeFile(filePath, JSON.stringify({ ...DEFAULT_CONFIG, modules, brightness, ...extra, uncalibrated: true }, null, 2), { mode: 0o600 });
}

async function findOnPath(bin: string): Promise<string | undefined> {
  const dirs = (process.env['PATH'] ?? '').split(':');
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, bin);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // not in this directory
    }
  }
  return undefined;
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
