import * as React from 'react';

interface AppearanceTabProps {
  value: { hud_presets?: Array<{ name: string }> };
}

export function AppearanceTab({ value }: AppearanceTabProps) {
  const presetCount = value.hud_presets?.length ?? 0;

  return (
    <div className="p-4 flex flex-col gap-2 font-mono text-xs text-white/60">
      <p>HUD presets: {presetCount}</p>
      <p>
        Appearance settings (accent colour, UI theme) are not yet stored in
        config.json and will be added in a future update.
      </p>
    </div>
  );
}
