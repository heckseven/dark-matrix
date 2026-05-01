import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:fs/promises');
vi.mock('node:child_process');

import fs from 'node:fs/promises';
import * as cp from 'node:child_process';
import {
  resolveModules,
  enumerateMatrixModules,
  InvalidDevicePathError,
  ModuleNotFoundError,
} from './modules.js';

const LEFT_BY_PATH = '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0';
const RIGHT_BY_PATH = '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0';
const LEFT_RESOLVED = '/dev/ttyACM0';
const RIGHT_RESOLVED = '/dev/ttyACM1';

const mockRealpath = vi.mocked(fs.realpath);
const mockReaddir = vi.mocked(fs.readdir);
const mockSpawn = vi.mocked(cp.spawn);

function makeSpawnMock(stdout: string, exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdoutEmitter = new EventEmitter();
  (proc as unknown as Record<string, unknown>).stdout = stdoutEmitter;
  (proc as unknown as Record<string, unknown>).stdin = null;
  (proc as unknown as Record<string, unknown>).stderr = null;

  setImmediate(() => {
    stdoutEmitter.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  });

  return proc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveModules', () => {
  it('returns resolved ttyACM paths for both sides (happy path)', async () => {
    mockRealpath
      .mockResolvedValueOnce(LEFT_RESOLVED)
      .mockResolvedValueOnce(RIGHT_RESOLVED);

    const result = await resolveModules({ left: LEFT_BY_PATH, right: RIGHT_BY_PATH });
    expect(result).toEqual({ left: LEFT_RESOLVED, right: RIGHT_RESOLVED });
    expect(mockRealpath).toHaveBeenCalledWith(LEFT_BY_PATH);
    expect(mockRealpath).toHaveBeenCalledWith(RIGHT_BY_PATH);
  });

  it('returns { left: null, right: null } when symlinks do not exist (ENOENT)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockRealpath.mockRejectedValue(enoent);

    const result = await resolveModules({ left: LEFT_BY_PATH, right: RIGHT_BY_PATH });
    expect(result).toEqual({ left: null, right: null });
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('dark-matrix calibrate');
  });

  it('throws InvalidDevicePathError for a /dev/ttyACM0 path', async () => {
    await expect(
      resolveModules({ left: '/dev/ttyACM0', right: RIGHT_BY_PATH }),
    ).rejects.toThrow(InvalidDevicePathError);
  });

  it('throws InvalidDevicePathError for a bare filename', async () => {
    await expect(
      resolveModules({ left: 'ttyACM0', right: RIGHT_BY_PATH }),
    ).rejects.toThrow(InvalidDevicePathError);
  });
});

describe('enumerateMatrixModules', () => {
  const FRAMEWORK_OUTPUT = [
    'ID_VENDOR=Framework',
    'ID_SERIAL_SHORT=FRAKDEBZ0100000000',
    'ID_USB_DRIVER=cdc_acm',
  ].join('\n');

  const NON_FRAMEWORK_OUTPUT = [
    'ID_VENDOR=Arduino',
    'ID_SERIAL_SHORT=ABC1234',
  ].join('\n');

  it('returns only paths with correct ID_SERIAL_SHORT', async () => {
    mockReaddir.mockResolvedValue([
      'pci-0000:c5:00.3-usb-0:3.3:1.0',
      'pci-0000:c5:00.3-usb-0:4.2:1.0',
      'pci-0000:c5:00.3-usb-0:5.1:1.0',
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    mockRealpath
      .mockResolvedValueOnce('/dev/ttyACM0')
      .mockResolvedValueOnce('/dev/ttyACM1')
      .mockResolvedValueOnce('/dev/ttyUSB0');

    mockSpawn
      .mockReturnValueOnce(makeSpawnMock(FRAMEWORK_OUTPUT))
      .mockReturnValueOnce(makeSpawnMock(FRAMEWORK_OUTPUT))
      .mockReturnValueOnce(makeSpawnMock(NON_FRAMEWORK_OUTPUT));

    const result = await enumerateMatrixModules();
    expect(result).toHaveLength(2);
    expect(result).toContain('/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0');
    expect(result).toContain('/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0');
  });

  it('returns empty array if no Framework modules found', async () => {
    mockReaddir.mockResolvedValue([
      'pci-0000:c5:00.3-usb-0:5.1:1.0',
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    mockRealpath.mockResolvedValueOnce('/dev/ttyACM0');
    mockSpawn.mockReturnValueOnce(makeSpawnMock(NON_FRAMEWORK_OUTPUT));

    const result = await enumerateMatrixModules();
    expect(result).toEqual([]);
  });
});
