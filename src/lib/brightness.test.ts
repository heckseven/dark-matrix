import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readLux, computeBrightness, startBrightnessLoop } from './brightness.js';
import type { Config } from './config.js';
import { DEFAULT_CONFIG } from './config.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
const mockReadFile = vi.mocked(readFile);

const cfg = (overrides: Partial<Config['brightness']> = {}): Config => ({
  ...DEFAULT_CONFIG,
  brightness: { ...DEFAULT_CONFIG.brightness, ...overrides },
});

describe('readLux', () => {
  it('reads integer from file, trimming whitespace', async () => {
    mockReadFile.mockResolvedValueOnce('342\n' as never);
    expect(await readLux('/sys/fake')).toBe(342);
  });
});

describe('computeBrightness', () => {
  const base = DEFAULT_CONFIG.brightness;

  it('clamps to min when result is below min', () => {
    expect(computeBrightness(0, { ...base, multiplier: 0, offset: 0, min: 7 })).toBe(7);
  });

  it('clamps to max when result is above max', () => {
    expect(computeBrightness(10000, { ...base, multiplier: 1, offset: 0, max: 255 })).toBe(255);
  });

  it('applies multiplier + offset for midrange lux', () => {
    // lux=100, multiplier=0.071, offset=7 → 14.1 → 14
    expect(computeBrightness(100, { ...base, multiplier: 0.071, offset: 7, min: 0, max: 255 })).toBe(14);
  });
});

describe('startBrightnessLoop', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sensor mode: calls onBrightness on each poll tick', async () => {
    mockReadFile.mockResolvedValue('1000\n' as never);
    const onBrightness = vi.fn();
    const c = cfg({ mode: 'sensor', multiplier: 0.1, offset: 0, min: 0, max: 255 });
    const dispose = startBrightnessLoop(c, onBrightness);

    await vi.advanceTimersByTimeAsync(c.daemon.poll_interval_ms);
    expect(onBrightness).toHaveBeenCalledTimes(1);
    const pct = onBrightness.mock.calls[0][0] as number;
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);

    dispose();
  });

  it('disposer stops polling', async () => {
    mockReadFile.mockResolvedValue('100\n' as never);
    const onBrightness = vi.fn();
    const c = cfg({ mode: 'sensor' });
    const dispose = startBrightnessLoop(c, onBrightness);
    dispose();

    await vi.advanceTimersByTimeAsync(c.daemon.poll_interval_ms * 3);
    expect(onBrightness).not.toHaveBeenCalled();
  });

  it('manual mode: calls onBrightness once immediately and does not poll', async () => {
    const onBrightness = vi.fn();
    const c = cfg({ mode: 'manual', manual_value: 128 });
    const dispose = startBrightnessLoop(c, onBrightness);

    expect(onBrightness).toHaveBeenCalledTimes(1);
    expect(onBrightness).toHaveBeenCalledWith(Math.round(128 / 255 * 100));

    await vi.advanceTimersByTimeAsync(c.daemon.poll_interval_ms * 3);
    expect(onBrightness).toHaveBeenCalledTimes(1);
    dispose();
  });
});
