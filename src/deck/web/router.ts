// Tiny path router for the deck SPA. Pure functions over a pathname string so they
// stay testable; the window/history side-effects live in the components that call these.
//
// Route shape:
//   /                       -> mode select (no active mode)
//   /<mode>                 -> a mode (hud, audio, video, cast, life, design, config)
//   /config/<tab>           -> config mode focused on a settings tab
import { MODES, type AppMode } from './app-modes.js';

export const CONFIG_TABS = ['hardware', 'brightness', 'startup', 'daemon', 'notifications', 'appearance', 'integrations'] as const;
export type ConfigTab = typeof CONFIG_TABS[number];

const MODE_IDS = new Set<string>(MODES.map(m => m.id));

export interface Route {
  /** The active mode, or null for the mode-select screen. */
  mode: AppMode | null;
  /** When mode is 'config', the focused settings tab (null = default). */
  configTab: ConfigTab | null;
  /** True when the pathname matched a real route (vs '/' or an unknown path). */
  known: boolean;
}

/** Parse a pathname into a Route. Unknown paths and '/' yield { mode: null, known: false }. */
export function parseLocation(pathname: string): Route {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return { mode: null, configTab: null, known: false };

  const [seg0, seg1] = segments;
  if (seg0 === undefined || !MODE_IDS.has(seg0)) return { mode: null, configTab: null, known: false };

  const mode = seg0 as AppMode;
  if (mode === 'config' && seg1 !== undefined && (CONFIG_TABS as readonly string[]).includes(seg1)) {
    return { mode, configTab: seg1 as ConfigTab, known: true };
  }
  return { mode, configTab: null, known: true };
}

/** Build the canonical pathname for a mode (and optional config tab). */
export function pathForMode(mode: AppMode | null, configTab?: ConfigTab | null): string {
  if (mode === null) return '/';
  if (mode === 'config' && configTab) return `/config/${configTab}`;
  return `/${mode}`;
}

/** The config tab encoded in a pathname, or null if none/!config. */
export function routeConfigTab(pathname: string): ConfigTab | null {
  return parseLocation(pathname).configTab;
}
