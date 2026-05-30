import { describe, it, expect, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const SANDBOX = path.join(os.homedir(), '.config', 'dark-matrix', 'library');

vi.mock('node:fs/promises', () => ({ stat: vi.fn() }));

import { loadNotificationAsset } from './notification-assets.js';

function mockFileExists() {
  vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as never);
}

function enoent(): NodeJS.ErrnoException {
  const e = new Error('ENOENT') as NodeJS.ErrnoException;
  e.code = 'ENOENT';
  return e;
}

function mockFileMissing() {
  vi.mocked(fs.stat).mockRejectedValue(enoent());
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

  it('falls back to a bundled built-in when the user file is absent', async () => {
    // User library file is missing; a built-in of the same name exists.
    vi.mocked(fs.stat).mockImplementation(async (p) => {
      if (String(p).includes(`${path.sep}builtins${path.sep}`)) {
        return { isFile: () => true } as never;
      }
      throw enoent();
    });
    const handle = await loadNotificationAsset('claude_jump.dmx.json');
    expect(handle.kind).toBe('dmx');
    expect(handle.path).toContain(`${path.sep}builtins${path.sep}`);
    expect(handle.path.endsWith('claude_jump.dmx.json')).toBe(true);
  });

  it('propagates a non-ENOENT stat error instead of masking it with the builtin', async () => {
    const eacces = new Error('EACCES') as NodeJS.ErrnoException;
    eacces.code = 'EACCES';
    vi.mocked(fs.stat).mockRejectedValue(eacces);
    await expect(loadNotificationAsset('claude_jump.dmx.json')).rejects.toThrow('EACCES');
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
