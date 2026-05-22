// Browser-safe mirror of Config types from src/lib/config.ts.
// Do NOT import from src/lib/config.ts — that file uses node:fs.

export type HudWidget =
  | { widget: 'clock'; face: 'binary-audio' | 'elegant' | 'stretch' | 'analogue' | 'binary-blocks' | 'binary-tall' | 'binary-diamond' }
  | { widget: 'data'; style?: 'line' | 'bars'; top_left?: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; top_right?: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; bottom_left?: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; bottom_right?: 'cpu' | 'ram' | 'net_rx' | 'net_tx' };

export type HudTrigger =
  | { type: 'time'; from: string; to: string }
  | { type: 'idle' }
  | { type: 'active' }
  | { type: 'threshold'; metric: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; above?: number; below?: number }
  | { type: 'interface'; name: string; state: 'up' | 'down' }
  | { type: 'vm'; name: string; state?: 'running' | 'stopped' };

export type HudPreset = {
  name: string;
  left: HudWidget;
  right: HudWidget;
  triggers?: HudTrigger[];
  match?: 'all' | 'any';
};

export type NotificationRule = {
  source?: 'ec-switch' | 'vm' | 'claude' | 'desktop-notification' | 'manual';
  app_name_glob?: string;
  urgency?: 'low' | 'normal' | 'critical' | 'any';
  content_glob?: string;
  animation: 'scroll' | 'dmx' | 'none';
  asset_path?: string;
  composite?: 'replace' | 'overlay';
  overlay_mode?: 'or' | 'replace' | 'xor' | 'halo';
  transition?: 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
  duration_ms_override?: number;
  dmx_path?: string;
};

export type BiomePresetConfig = {
  name: string;
  algorithm: 'conway' | 'highlife' | 'daynight';
  tickMs: number;
  gridSnapshot?: string;
};

export type Config = {
  modules: {
    left: string;
    right: string;
  };
  brightness: {
    mode: 'sensor' | 'time' | 'manual';
    sensor_path: string;
    multiplier: number;
    offset: number;
    min: number;
    max: number;
    hysteresis: number;
    manual_value: number;
  };
  startup: {
    animation: 'gol-random' | 'scroll' | 'dmx' | 'none';
    scroll_text: string;
    dmx_path?: string;
  };
  daemon: {
    poll_interval_ms: number;
    idle_animation: 'heatmap' | 'audio-eq' | 'gol-random' | 'scroll' | 'gif' | 'hud' | 'none';
    idle_after_ms: number;
    idle_gif_path?: string;
    idle_gif_mode?: 'bw' | 'gray';
    idle_gif_dual?: boolean;
    idle_eq_source?: 'monitor' | 'mic';
  };
  hud?: {
    left?: HudWidget;
    right?: HudWidget;
  };
  notification_rules?: NotificationRule[];
  hud_presets?: HudPreset[];
  biome_presets?: BiomePresetConfig[];
  active_biome_preset?: string;
};
