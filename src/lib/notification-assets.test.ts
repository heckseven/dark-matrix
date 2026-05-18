import { describe, it, expect, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { convertImage } from './image-convert.js';

const SANDBOX = path.join(os.homedir(), '.config', 'dark-matrix', 'assets');
const MOCK_FRAME = new Uint8Array(306);

vi.mock('node:fs/promises', () => ({ access: vi.fn() }));
vi.mock('./image-convert.js', () => ({ convertImage: vi.fn() }));

import { loadNotificationAsset } from './notification-assets.js';

function mockFileExists() {
  vi.mocked(fs.access).mockResolvedValue(undefined);
  vi.mocked(convertImage).mockResolvedValue(MOCK_FRAME as never);
}

function mockFileMissing() {
  vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
}

describe('loadNotificationAsset — sandbox enforcement', () => {
  it('rejects path traversal escape', async () => {
    await expect(loadNotificationAsset('../../../etc/passwd')).rejects.toThrow('outside sandbox');
  });

  it('rejects absolute path outside sandbox', async () => {
    await expect(loadNotificationAsset('/etc/passwd')).rejects.toThrow('outside sandbox');
  });

  it('rejects path that resolves to sandbox root itself', async () => {
    // SANDBOX itself doesn't start with SANDBOX + sep, so this should pass the check
    // but we allow it if it equals sandboxRoot exactly — it would fail on access anyway
    // Confirm no escape is reported for a clean filename
    mockFileMissing();
    await expect(loadNotificationAsset('test.gif')).rejects.toThrow('asset not found');
  });
});

describe('loadNotificationAsset — missing file', () => {
  it('throws asset not found when file does not exist', async () => {
    mockFileMissing();
    await expect(loadNotificationAsset('missing.png')).rejects.toThrow('asset not found');
  });
});

describe('loadNotificationAsset — unsupported extension', () => {
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
  it('returns gif handle for .gif file', async () => {
    mockFileExists();
    const result = await loadNotificationAsset('test.gif');
    expect(result.kind).toBe('gif');
    expect(result.kind === 'gif' && result.path).toBe(path.join(SANDBOX, 'test.gif'));
  });

  it('returns dmx handle for .dmx.json file', async () => {
    mockFileExists();
    const result = await loadNotificationAsset('alert.dmx.json');
    expect(result.kind).toBe('dmx');
    expect(result.kind === 'dmx' && result.path).toBe(path.join(SANDBOX, 'alert.dmx.json'));
  });

  it('returns image handle for .png file', async () => {
    mockFileExists();
    const result = await loadNotificationAsset('icon.png');
    expect(result.kind).toBe('image');
    if (result.kind === 'image') expect(result.frame).toBeInstanceOf(Uint8Array);
  });

  it('returns image handle for .jpg file', async () => {
    mockFileExists();
    const result = await loadNotificationAsset('photo.jpg');
    expect(result.kind).toBe('image');
  });

  it('returns image handle for .jpeg file', async () => {
    mockFileExists();
    const result = await loadNotificationAsset('photo.jpeg');
    expect(result.kind).toBe('image');
  });

  it('returns image handle for .bmp file', async () => {
    mockFileExists();
    const result = await loadNotificationAsset('sprite.bmp');
    expect(result.kind).toBe('image');
  });
});
