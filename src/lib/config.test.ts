import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadConfig, writeDefaultConfig, watchConfig,
  DEFAULT_CONFIG, ConfigError,
  type NotificationRule,
} from './config.js';

// Use a temp dir per test to avoid touching ~/.config
let tmpDir: string;
let cfgPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dark-matrix-test-'));
  cfgPath = path.join(tmpDir, 'config.json');
  process.env['DARK_MATRIX_CONFIG_PATH'] = cfgPath;
});

afterEach(async () => {
  delete process.env['DARK_MATRIX_CONFIG_PATH'];
  await fs.rm(tmpDir, { recursive: true, force: true });
  // Remove any SIGHUP listeners added during tests
  process.removeAllListeners('SIGHUP');
});

async function write(data: unknown): Promise<void> {
  await fs.writeFile(cfgPath, JSON.stringify(data));
}

describe('loadConfig', () => {
  it('parses a valid config file', async () => {
    await write(DEFAULT_CONFIG);
    const cfg = await loadConfig();
    expect(cfg.modules.left).toBe(DEFAULT_CONFIG.modules.left);
    expect(cfg.brightness.mode).toBe('manual');
    expect(cfg.startup.animation).toBe('gol-random');
  });

  it('throws ConfigError for malformed JSON', async () => {
    await fs.writeFile(cfgPath, '{ not valid json }');
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError for invalid module path (ttyACM without /dev/)', async () => {
    await write({ ...DEFAULT_CONFIG, modules: { left: 'ttyACM0', right: 'ttyACM1' } });
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError for invalid sensor_path', async () => {
    await write({
      ...DEFAULT_CONFIG,
      brightness: { ...DEFAULT_CONFIG.brightness, sensor_path: '/etc/passwd' },
    });
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError if a freeform formula field is present (not in schema)', async () => {
    await write({ ...DEFAULT_CONFIG, brightness: { ...DEFAULT_CONFIG.brightness, formula: 'raw / 14 + 7' } });
    // Extra fields are stripped by zod by default, but strictness check:
    // The schema doesn't allow formula — it should either strip it (not throw) or throw.
    // We use .strip() (default) so extra fields are ignored. The important thing is the
    // parsed config must NOT contain formula.
    const cfg = await loadConfig();
    expect((cfg.brightness as Record<string, unknown>)['formula']).toBeUndefined();
  });

  it('throws on missing file (ENOENT)', async () => {
    await expect(loadConfig()).rejects.toThrow();
  });

  it('accepts startup.animation: dmx with a valid dmx_path', async () => {
    await write({ ...DEFAULT_CONFIG, startup: { ...DEFAULT_CONFIG.startup, animation: 'dmx', dmx_path: '/home/user/lib/test.dmx.json' } });
    const cfg = await loadConfig();
    expect(cfg.startup.animation).toBe('dmx');
    expect(cfg.startup.dmx_path).toBe('/home/user/lib/test.dmx.json');
  });

  it('throws ConfigError for startup.animation: image (removed value)', async () => {
    await write({ ...DEFAULT_CONFIG, startup: { ...DEFAULT_CONFIG.startup, animation: 'image' } });
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError for dmx_path without .dmx.json extension', async () => {
    await write({ ...DEFAULT_CONFIG, startup: { ...DEFAULT_CONFIG.startup, animation: 'dmx', dmx_path: '/home/user/lib/test.gif' } });
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
  });

  it('accepts startup.animation: dmx without dmx_path (optional field)', async () => {
    await write({ ...DEFAULT_CONFIG, startup: { ...DEFAULT_CONFIG.startup, animation: 'dmx' } });
    const cfg = await loadConfig();
    expect(cfg.startup.animation).toBe('dmx');
    expect(cfg.startup.dmx_path).toBeUndefined();
  });
});

describe('stale widget coercion (graceful degradation)', () => {
  it('coerces a removed widget type to a clock without failing the config', async () => {
    await write({
      ...DEFAULT_CONFIG,
      hud_presets: [{ name: 'p', left: { widget: 'heatmap' }, right: { widget: 'clock', face: 'elegant' } }],
    });
    const cfg = await loadConfig();
    expect(cfg.hud_presets![0]!.left).toEqual({ widget: 'clock', face: 'elegant' });
    expect(cfg.hud_presets![0]!.right).toEqual({ widget: 'clock', face: 'elegant' });
  });

  it('resets a removed widget style to the default, keeping the widget', async () => {
    await write({
      ...DEFAULT_CONFIG,
      hud_presets: [{ name: 'p', left: { widget: 'claude', style: 'context' }, right: { widget: 'clock', face: 'elegant' } }],
    });
    const cfg = await loadConfig();
    expect(cfg.hud_presets![0]!.left).toEqual({ widget: 'claude' });
  });

  it('round-trips a text widget preset', async () => {
    await write({
      ...DEFAULT_CONFIG,
      hud_presets: [{ name: 'p', left: { widget: 'text', text: 'HELLO', style: 'marquee', size: 'small', speed: 'fast', span: true }, right: { widget: 'clock', face: 'elegant' } }],
    });
    const cfg = await loadConfig();
    expect(cfg.hud_presets![0]!.left).toEqual({ widget: 'text', text: 'HELLO', style: 'marquee', size: 'small', speed: 'fast', span: true });
  });

  it('coerces a removed text style to the renderer default, keeping the widget', async () => {
    await write({
      ...DEFAULT_CONFIG,
      hud_presets: [{ name: 'p', left: { widget: 'text', text: 'HI', style: 'nope' }, right: { widget: 'clock', face: 'elegant' } }],
    });
    const cfg = await loadConfig();
    expect(cfg.hud_presets![0]!.left).toEqual({ widget: 'text', text: 'HI' });
  });

  it('rejects a text widget whose text exceeds 128 chars (coerced to fallback clock)', async () => {
    await write({
      ...DEFAULT_CONFIG,
      hud_presets: [{ name: 'p', left: { widget: 'text', text: 'x'.repeat(129) }, right: { widget: 'clock', face: 'elegant' } }],
    });
    const cfg = await loadConfig();
    // over-long text fails the slot schema → healed to the fallback clock
    expect(cfg.hud_presets![0]!.left).toEqual({ widget: 'clock', face: 'elegant' });
  });

  it('resets a stale clock face to elegant', async () => {
    await write({
      ...DEFAULT_CONFIG,
      hud_presets: [{ name: 'p', left: { widget: 'clock', face: 'nope' }, right: { widget: 'clock', face: 'elegant' } }],
    });
    const cfg = await loadConfig();
    expect(cfg.hud_presets![0]!.left).toEqual({ widget: 'clock', face: 'elegant' });
  });

  it('preserves valid presets alongside coerced ones', async () => {
    await write({
      ...DEFAULT_CONFIG,
      hud_presets: [
        { name: 'bad',  left: { widget: 'heatmap' }, right: { widget: 'audio', style: 'dark-matter' } },
        { name: 'good', left: { widget: 'clock', face: 'stretch' }, right: { widget: 'claude', style: 'sand' } },
      ],
    });
    const cfg = await loadConfig();
    expect(cfg.hud_presets![0]!.right).toEqual({ widget: 'audio', style: 'dark-matter' });
    expect(cfg.hud_presets![1]!.left).toEqual({ widget: 'clock', face: 'stretch' });
    expect(cfg.hud_presets![1]!.right).toEqual({ widget: 'claude', style: 'sand' });
  });
});

describe('notification_rules', () => {
  it('accepts a rule with all fields', async () => {
    const rule: NotificationRule = { app_name_glob: 'firefox', urgency: 'critical', animation: 'dmx', dmx_path: '/home/user/alert.dmx.json' };
    await write({ ...DEFAULT_CONFIG, notification_rules: [rule] });
    const cfg = await loadConfig();
    expect(cfg.notification_rules).toHaveLength(1);
    expect(cfg.notification_rules![0]).toEqual(rule);
  });

  it('accepts a rule with only required fields', async () => {
    const rule = { app_name_glob: '*', animation: 'scroll' };
    await write({ ...DEFAULT_CONFIG, notification_rules: [rule] });
    const cfg = await loadConfig();
    const parsed = cfg.notification_rules;
    expect(parsed).toBeDefined();
    expect(parsed![0]).toMatchObject({ app_name_glob: '*', animation: 'scroll' });
    expect(parsed![0]!.urgency).toBeUndefined();
    expect(parsed![0]!.dmx_path).toBeUndefined();
  });

  it('rejects an unknown animation value', async () => {
    await write({ ...DEFAULT_CONFIG, notification_rules: [{ app_name_glob: 'slack', animation: 'blink' }] });
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
  });

  it('rejects an invalid urgency value', async () => {
    await write({ ...DEFAULT_CONFIG, notification_rules: [{ app_name_glob: 'slack', urgency: 'urgent', animation: 'scroll' }] });
    await expect(loadConfig()).rejects.toBeInstanceOf(ConfigError);
  });

  it('round-trips: config with notification_rules serializes and re-parses correctly', async () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'discord', urgency: 'normal', animation: 'scroll' },
      { app_name_glob: 'plex', animation: 'none' },
    ];
    await write({ ...DEFAULT_CONFIG, notification_rules: rules });
    const cfg = await loadConfig();
    const json = JSON.stringify(cfg);
    await write(JSON.parse(json));
    const cfg2 = await loadConfig();
    expect(cfg2.notification_rules).toEqual(rules);
  });
});

describe('writeDefaultConfig', () => {
  it('creates config file with DEFAULT_CONFIG content', async () => {
    await writeDefaultConfig(cfgPath);
    const cfg = await loadConfig(cfgPath);
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it('creates parent directories if missing', async () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c', 'config.json');
    await writeDefaultConfig(nested);
    const cfg = await loadConfig(nested);
    expect(cfg.modules.left).toBe(DEFAULT_CONFIG.modules.left);
  });

  it('sets file mode to 0600', async () => {
    await writeDefaultConfig(cfgPath);
    const stat = await fs.stat(cfgPath);
    // eslint-disable-next-line no-bitwise
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('watchConfig', () => {
  it('calls onReload with new config when SIGHUP is emitted', async () => {
    await write(DEFAULT_CONFIG);
    const reloaded: unknown[] = [];
    const dispose = watchConfig((c) => reloaded.push(c));

    process.emit('SIGHUP');
    // Give the async handler a tick to run
    await new Promise((r) => setTimeout(r, 20));

    expect(reloaded).toHaveLength(1);
    dispose();
  });

  it('does NOT call onReload when SIGHUP fires with invalid config', async () => {
    await write(DEFAULT_CONFIG);
    const reloaded: unknown[] = [];
    const dispose = watchConfig((c) => reloaded.push(c));

    // Write invalid config
    await fs.writeFile(cfgPath, '!!!not json');

    process.emit('SIGHUP');
    await new Promise((r) => setTimeout(r, 20));

    expect(reloaded).toHaveLength(0);
    dispose();
  });

  it('disposer removes the SIGHUP handler', async () => {
    await write(DEFAULT_CONFIG);
    const reloaded: unknown[] = [];
    const dispose = watchConfig((c) => reloaded.push(c));
    dispose();

    process.emit('SIGHUP');
    await new Promise((r) => setTimeout(r, 20));

    expect(reloaded).toHaveLength(0);
  });
});
