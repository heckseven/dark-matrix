import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import type { Frame } from './frame.js';
import { convertImage } from './image-convert.js';

export type NotificationAssetHandle =
  | { kind: 'image'; frame: Frame }
  | { kind: 'gif'; path: string }
  | { kind: 'dmx'; path: string };

const ASSETS_DIR = path.join(os.homedir(), '.config', 'dark-matrix', 'assets');

export async function loadNotificationAsset(assetPath: string): Promise<NotificationAssetHandle> {
  const sandboxRoot = ASSETS_DIR;
  const resolved = path.resolve(sandboxRoot, assetPath);
  if (!resolved.startsWith(sandboxRoot + path.sep) && resolved !== sandboxRoot) {
    throw new Error('asset path outside sandbox');
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    throw new Error(`asset not found: ${assetPath}`);
  }

  const lower = resolved.toLowerCase();
  if (lower.endsWith('.gif')) {
    return { kind: 'gif', path: resolved };
  }
  if (lower.endsWith('.dmx.json')) {
    return { kind: 'dmx', path: resolved };
  }
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.bmp')) {
    const frame = await convertImage(resolved);
    return { kind: 'image', frame };
  }
  throw new Error(`unsupported asset type: ${path.extname(resolved) || '(no extension)'}`);
}
