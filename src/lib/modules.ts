import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

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
const FRAMEWORK_SERIAL = 'ID_SERIAL_SHORT=FRAKDEBZ0100000000';
const TTY_ACM_RE = /^\/dev\/ttyACM\d+$/;

function spawnUdevadm(devicePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('udevadm', ['info', '-q', 'property', devicePath], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    if (proc.stdout === null) {
      reject(new Error('udevadm stdout is null'));
      return;
    }
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`udevadm exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

export async function enumerateMatrixModules(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(SERIAL_DIR);
  } catch {
    return [];
  }

  const results: string[] = [];

  await Promise.all(
    entries.map(async (entry) => {
      const byPath = `${SERIAL_DIR}/${entry}`;
      let resolved: string;
      try {
        resolved = await fs.realpath(byPath);
      } catch {
        return;
      }
      if (!TTY_ACM_RE.test(resolved)) return;

      let output: string;
      try {
        output = await spawnUdevadm(byPath);
      } catch {
        return;
      }

      if (output.split('\n').some((line) => line.trim() === FRAMEWORK_SERIAL)) {
        results.push(byPath);
      }
    }),
  );

  return results;
}
