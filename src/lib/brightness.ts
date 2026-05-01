import { readFile } from 'node:fs/promises';
import type { Config } from './config.js';

export type BrightnessConfig = Config['brightness'];

export async function readLux(sensorPath: string): Promise<number> {
  const raw = await readFile(sensorPath, 'utf8');
  return parseInt(raw.trim(), 10);
}

export function computeBrightness(lux: number, cfg: BrightnessConfig): number {
  const raw = Math.round(lux * cfg.multiplier + cfg.offset);
  return Math.max(cfg.min, Math.min(cfg.max, raw));
}

export function startBrightnessLoop(
  cfg: Config,
  onBrightness: (pct: number) => void
): () => void {
  const toPct = (v: number) => Math.round(v / 255 * 100);

  if (cfg.brightness.mode === 'sensor') {
    let handle: ReturnType<typeof setInterval> | null = setInterval(async () => {
      try {
        const lux = await readLux(cfg.brightness.sensor_path);
        onBrightness(toPct(computeBrightness(lux, cfg.brightness)));
      } catch {
        // sensor read failures are non-fatal
      }
    }, cfg.daemon.poll_interval_ms);

    return () => {
      if (handle !== null) {
        clearInterval(handle);
        handle = null;
      }
    };
  }

  // manual and time modes
  onBrightness(toPct(cfg.brightness.manual_value));
  return () => {};
}
