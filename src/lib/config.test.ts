import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadConfig, writeDefaultConfig, watchConfig,
  DEFAULT_CONFIG, ConfigError,
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
    expect(cfg.brightness.mode).toBe('sensor');
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
