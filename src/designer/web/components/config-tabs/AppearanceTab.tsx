import * as React from 'react';
import { TabFrame } from './tab-frame.js';

interface AppearanceTabProps {
  value: { hud_presets?: Array<{ name: string }> };
}

export function AppearanceTab({ value }: AppearanceTabProps) {
  const presetCount = value.hud_presets?.length ?? 0;

  return (
    <TabFrame>
      <p className="text-white/60">HUD presets: {presetCount}</p>
      <p className="text-white/60">
        Appearance settings (accent colour, UI theme) are not yet stored in
        config.json and will be added in a future update.
      </p>
    </TabFrame>
  );
}
