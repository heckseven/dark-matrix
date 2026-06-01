import type { NotificationRule } from './config.js';
import type { DisplayIntent } from './dispatcher.js';
import type { TextStyle, TextSize, TextSpeed, TextFlicker, TextTransition } from '../animations/text-renderers.js';

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

export type RouteResult = {
  action: 'text' | 'design' | 'suppress';
  assetPath?: string;
  composite: 'replace' | 'overlay';
  overlayMode?: 'or' | 'replace' | 'xor' | 'halo';
  transition?: 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
  durationMs?: number;
  loopCount?: number;
  mirror?: boolean;
  side?: 'left' | 'right';
  textContent?: string;
  textSize?: TextSize;
  textStyle?: TextStyle;
  textSpeed?: TextSpeed;
  textFlicker?: TextFlicker;
  textTransition?: TextTransition;
};

export function routeNotification(
  intent: DisplayIntent,
  rules: NotificationRule[],
  noMatchAction: 'text' | 'suppress' = 'suppress',
): RouteResult {
  // TODO: populate urgency from dbus hints in dbus-notifications.ts (parseDbusMonitorLine
  // skips the hints array). Until then urgency-filtered rules never fire.
  const urgency = undefined as 'low' | 'normal' | 'critical' | undefined;

  for (const rule of rules) {
    // Filter by source if specified
    if (rule.source !== undefined && rule.source !== intent.source) continue;

    // app_name_glob only applies to desktop-notification intents.
    // For desktop-notification, we match against intent.content (which is n.summary || n.appName).
    if (rule.app_name_glob !== undefined) {
      if (intent.source !== 'desktop-notification') continue;
      if (!matchesGlob(rule.app_name_glob, intent.content)) continue;
    }

    // urgency only applies to desktop-notification intents
    if (rule.urgency !== undefined) {
      if (intent.source !== 'desktop-notification') continue;
      if (rule.urgency !== 'any' && rule.urgency !== urgency) continue;
    }

    // content_glob matched against intent.content
    if (rule.content_glob !== undefined && !matchesGlob(rule.content_glob, intent.content)) continue;

    // All applicable checks passed — first match wins
    const result: RouteResult = {
      action: rule.animation,
      composite: rule.composite ?? 'replace',
    };
    if (rule.asset_path !== undefined) result.assetPath = rule.asset_path;
    if (rule.overlay_mode !== undefined) result.overlayMode = rule.overlay_mode;
    if (rule.transition !== undefined) result.transition = rule.transition;
    if (rule.loop_count !== undefined) result.loopCount = rule.loop_count;
    else if (rule.duration_ms_override !== undefined) result.durationMs = rule.duration_ms_override;
    if (rule.mirror !== undefined) result.mirror = rule.mirror;
    if (rule.side !== undefined) result.side = rule.side;
    if (rule.text_content !== undefined) result.textContent = rule.text_content;
    if (rule.text_size !== undefined) result.textSize = rule.text_size;
    if (rule.text_style !== undefined) result.textStyle = rule.text_style;
    if (rule.text_speed !== undefined) result.textSpeed = rule.text_speed;
    if (rule.text_flicker !== undefined) result.textFlicker = rule.text_flicker;
    if (rule.text_transition !== undefined) result.textTransition = rule.text_transition;
    return result;
  }

  return { action: noMatchAction, composite: 'replace' };
}
