import type { NotificationRule } from './config.js';
import type { DesktopNotification } from './dbus-notifications.js';

export function matchesGlob(pattern: string, str: string): boolean {
  // Inline glob: * matches any sequence, ? matches one char.
  // No path semantics — app name matching only.
  let pi = 0;
  let si = 0;
  let starPi = -1;
  let starSi = -1;

  while (si < str.length) {
    if (pi < pattern.length && (pattern[pi] === '?' || pattern[pi] === str[si])) {
      pi++;
      si++;
    } else if (pi < pattern.length && pattern[pi] === '*') {
      starPi = pi;
      starSi = si;
      pi++;
    } else if (starPi !== -1) {
      // Backtrack to last star, advance string position
      starSi++;
      si = starSi;
      pi = starPi + 1;
    } else {
      return false;
    }
  }

  // Consume trailing stars
  while (pi < pattern.length && pattern[pi] === '*') pi++;

  return pi === pattern.length;
}

export function routeNotification(
  n: DesktopNotification,
  rules: NotificationRule[],
): { action: 'scroll' | 'dmx' | 'none'; dmx_path?: string } {
  // TODO: populate urgency from dbus hints in dbus-notifications.ts (parseDbusMonitorLine
  // skips the hints array). Until then urgency-filtered rules never fire.
  const urgency = undefined as 'low' | 'normal' | 'critical' | undefined;

  for (const rule of rules) {
    if (!matchesGlob(rule.app_name_glob, n.appName)) continue;
    if (rule.urgency && rule.urgency !== 'any' && rule.urgency !== urgency) continue;

    if (rule.animation === 'dmx' && rule.dmx_path) {
      return { action: 'dmx', dmx_path: rule.dmx_path };
    }
    return { action: rule.animation };
  }

  return { action: 'scroll' };
}
