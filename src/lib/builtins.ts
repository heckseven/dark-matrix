import * as path from 'node:path';

// Resolve a bundled built-in design path from a bare design name, guarding
// against path traversal. Shared by the deck server, the daemon HUD image
// widget, and the notification-asset loader. Returns null when `name` is not a
// safe bare design stem.
//
// `path.basename` strips any directory components before the stem is validated,
// so the candidate is always exactly one level under `dir`; the trailing
// prefix check is belt-and-suspenders.
export function safeBuiltinPath(name: string, dir: string): string | null {
  const stem = path.basename(name).replace(/\.dmx\.json$/i, '');
  if (!stem) return null;
  if (!/^[a-zA-Z0-9_ \-]{1,100}$/.test(stem)) return null;
  const candidate = path.join(dir, `${stem}.dmx.json`);
  if (!candidate.startsWith(dir + path.sep)) return null;
  return candidate;
}
