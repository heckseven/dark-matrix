import { describe, it, expect, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const SANDBOX = path.join(os.homedir(), '.config', 'dark-matrix', 'assets');

vi.mock('node:fs/promises', () => ({ stat: vi.fn() }));

import { loadNotificationAsset } from './notification-assets.js';

function mockFileExists() {
  vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as never);
}

function mockFileMissing() {
  vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
}

describe('loadNotificationAsset — sandbox enforcement', () => {
  it('rejects path traversal escape', async () => {
    await expect(loadNotificationAsset('../../../etc/passwd')).rejects.toThrow('outside sandbox');
  });

  it('rejects absolute path outside sandbox', async () => {
    await expect(loadNotificationAsset('/etc/passwd')).rejects.toThrow('outside sandbox');
  });

  it('rejects missing file', async () => {
    mockFileMissing();
    await expect(loadNotificationAsset('test.dmx.json')).rejects.toThrow('asset not found');
  });
});

describe('loadNotificationAsset — unsupported extensions', () => {
  it('throws for .gif file', async () => {
    mockFileExists();
    await expect(loadNotificationAsset('anim.gif')).rejects.toThrow('unsupported asset type');
  });

  it('throws for .png file', async () => {
    mockFileExists();
    await expect(loadNotificationAsset('icon.png')).rejects.toThrow('unsupported asset type');
  });

  it('throws for unknown extension', async () => {
    mockFileExists();
    await expect(loadNotificationAsset('file.xyz')).rejects.toThrow('unsupported asset type');
  });

  it('throws for file with no extension', async () => {
    mockFileExists();
    await expect(loadNotificationAsset('noext')).rejects.toThrow('unsupported asset type');
  });
});

describe('loadNotificationAsset — valid assets', () => {
  it('returns dmx handle for .dmx.json file', async () => {
    mockFileExists();
    const result = await loadNotificationAsset('alert.dmx.json');
    expect(result.kind).toBe('dmx');
    expect(result.path).toBe(path.join(SANDBOX, 'alert.dmx.json'));
  });
});
