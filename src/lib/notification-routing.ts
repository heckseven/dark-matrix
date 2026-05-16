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
  // DesktopNotification does not currently expose urgency from dbus hints.
  // Urgency-filtered rules (rule.urgency != null && rule.urgency != 'any')
  // will not match until DesktopNotification includes an urgency field.
  const urgency = (n as DesktopNotification & { urgency?: 'low' | 'normal' | 'critical' }).urgency;

  for (const rule of rules) {
    if (!matchesGlob(rule.app_name_glob, n.appName)) continue;
    if (rule.urgency && rule.urgency !== 'any' && rule.urgency !== urgency) continue;

    const result: { action: typeof rule.animation; dmx_path?: string } = { action: rule.animation };
    if (rule.animation === 'dmx' && rule.dmx_path) result.dmx_path = rule.dmx_path;
    return result;
  }

  return { action: 'scroll' };
}
