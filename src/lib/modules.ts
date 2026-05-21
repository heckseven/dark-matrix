import fs from 'node:fs/promises';
import { SerialPort } from 'serialport';

export interface ModulesConfig {
  left: string;
  right: string;
}

export interface ResolvedModules {
  left: string | null;
  right: string | null;
}

export class InvalidDevicePathError extends Error {
  constructor(public readonly path: string) {
    super(`Invalid device path: ${path}. Must be /dev/serial/by-path/...`);
    this.name = 'InvalidDevicePathError';
  }
}

export class ModuleNotFoundError extends Error {
  constructor(public readonly byPath: string) {
    super(`Module not found at ${byPath}. Run 'dark-matrix calibrate' to reconfigure.`);
    this.name = 'ModuleNotFoundError';
  }
}

const BY_PATH_RE = /^\/dev\/serial\/by-path\/pci-[0-9a-f:.]+-.+$/;
const RESOLVED_RE = /^\/dev\/ttyACM\d+$|^\/dev\/ttyUSB\d+$/;

function validateByPath(path: string): void {
  if (!BY_PATH_RE.test(path)) {
    throw new InvalidDevicePathError(path);
  }
}

async function resolveSide(byPath: string): Promise<string | null> {
  try {
    const resolved = await fs.realpath(byPath);
    if (!RESOLVED_RE.test(resolved)) {
      throw new InvalidDevicePathError(resolved);
    }
    return resolved;
  } catch (err) {
    if (err instanceof InvalidDevicePathError) throw err;
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      console.warn(new ModuleNotFoundError(byPath).message);
      return null;
    }
    throw err;
  }
}

export async function resolveModules(config: ModulesConfig): Promise<ResolvedModules> {
  validateByPath(config.left);
  validateByPath(config.right);

  const [left, right] = await Promise.all([
    resolveSide(config.left),
    resolveSide(config.right),
  ]);

  return { left, right };
}

const SERIAL_DIR = '/dev/serial/by-path';
// Framework LED Matrix Input Module: VID 0x32AC, PID 0x0020
// Source: inputmodule-rs/release/50-framework-inputmodule.rules
const LED_MATRIX_VENDOR = '32ac';
const LED_MATRIX_PRODUCT = '0020';

export async function enumerateMatrixModules(): Promise<string[]> {
  // Find matching devices via serialport's cross-platform VID/PID listing
  let portList: Awaited<ReturnType<typeof SerialPort.list>>;
  try {
    portList = await SerialPort.list();
  } catch {
    return [];
  }

  const matchingPaths = new Set(
    portList
      .filter(p => p.vendorId?.toLowerCase() === LED_MATRIX_VENDOR && p.productId?.toLowerCase() === LED_MATRIX_PRODUCT)
      .map(p => p.path),
  );

  if (matchingPaths.size === 0) return [];

  // Map matched ttyACM paths back to stable by-path entries
  let entries: string[];
  try {
    entries = await fs.readdir(SERIAL_DIR);
  } catch {
    return [...matchingPaths].sort();
  }

  // Deduplicate: keep one by-path entry per resolved ttyACM device.
  // Framework laptops expose each port via both usb-0 and usbv2-0 paths.
  const seenResolved = new Set<string>();
  const candidates: Array<{ byPath: string; resolved: string }> = [];
  await Promise.all(
    entries.map(async (entry) => {
      const byPath = `${SERIAL_DIR}/${entry}`;
      try {
        const resolved = await fs.realpath(byPath);
        if (matchingPaths.has(resolved)) candidates.push({ byPath, resolved });
      } catch {
        // dangling symlink — skip
      }
    }),
  );

  const results: string[] = [];
  for (const { byPath, resolved } of candidates.sort((a, b) => a.byPath.localeCompare(b.byPath))) {
    if (!seenResolved.has(resolved)) {
      seenResolved.add(resolved);
      results.push(byPath);
    }
  }

  return results;
}
