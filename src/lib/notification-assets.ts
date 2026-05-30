import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { safeBuiltinPath } from './builtins.js';

export type NotificationAssetHandle = { kind: 'dmx'; path: string };

const CONFIG_DIR = path.join(os.homedir(), '.config', 'dark-matrix');
const LIBRARY_DIR = path.join(CONFIG_DIR, 'library');

// Built-in designs dir (dist/deck/builtins); resolution via ./builtins.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTINS_DIR = path.resolve(__dirname, '../deck/builtins');

export async function loadNotificationAsset(assetPath: string): Promise<NotificationAssetHandle> {
  // Strip legacy "library/" prefix for backward compat with older configs
  const relativePath = (assetPath.startsWith('library/') || assetPath.startsWith('library\\'))
    ? assetPath.slice('library/'.length)
    : assetPath;
  const resolved = path.resolve(LIBRARY_DIR, relativePath);
  if (!resolved.startsWith(LIBRARY_DIR + path.sep) && resolved !== LIBRARY_DIR) {
    throw new Error('asset path outside sandbox');
  }

  // Prefer the user library; fall back to a bundled built-in of the same name
  // only when the user file is genuinely absent. A non-ENOENT error (e.g.
  // EACCES, EIO) propagates so a real failure is never masked by the fallback.
  let target = resolved;
  let stat = await fs.stat(resolved).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
    throw e;
  });
  if (!stat) {
    const builtin = safeBuiltinPath(relativePath, BUILTINS_DIR);
    if (builtin) {
      const bstat = await fs.stat(builtin).catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
        throw e;
      });
      if (bstat?.isFile()) { target = builtin; stat = bstat; }
    }
  }
  if (!stat || !stat.isFile()) throw new Error(`asset not found: ${assetPath}`);

  if (target.toLowerCase().endsWith('.dmx.json')) {
    return { kind: 'dmx', path: target };
  }
  throw new Error(`unsupported asset type: ${path.extname(target) || '(no extension)'}. Only .dmx.json files are supported — import images/GIFs to DMX first.`);
}
