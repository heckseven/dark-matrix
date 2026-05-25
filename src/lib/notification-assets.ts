import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

export type NotificationAssetHandle = { kind: 'dmx'; path: string };

const CONFIG_DIR = path.join(os.homedir(), '.config', 'dark-matrix');
const LIBRARY_DIR = path.join(CONFIG_DIR, 'library');

export async function loadNotificationAsset(assetPath: string): Promise<NotificationAssetHandle> {
  // Strip legacy "library/" prefix for backward compat with older configs
  const relativePath = (assetPath.startsWith('library/') || assetPath.startsWith('library\\'))
    ? assetPath.slice('library/'.length)
    : assetPath;
  const resolved = path.resolve(LIBRARY_DIR, relativePath);
  if (!resolved.startsWith(LIBRARY_DIR + path.sep) && resolved !== LIBRARY_DIR) {
    throw new Error('asset path outside sandbox');
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new Error(`asset not found: ${assetPath}`);
  }
  if (!stat.isFile()) throw new Error(`asset not found: ${assetPath}`);

  if (resolved.toLowerCase().endsWith('.dmx.json')) {
    return { kind: 'dmx', path: resolved };
  }
  throw new Error(`unsupported asset type: ${path.extname(resolved) || '(no extension)'}. Only .dmx.json files are supported — import images/GIFs to DMX first.`);
}
