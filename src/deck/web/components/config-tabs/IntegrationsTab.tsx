import { TabFrame } from './tab-frame.js';
import { TwitchConnectForm } from './TwitchConnectForm.js';
import type { Config } from '../../types/config-types.js';

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export function IntegrationsTab({ config, onChange, onDisconnect, disconnecting }: {
  config: Config;
  onChange: (patch: DeepPartial<Config>) => void;
  onDisconnect: () => void;
  disconnecting?: boolean;
}) {
  return (
    <TabFrame>
      {/* Twitch section */}
      <TwitchConnectForm
        config={config}
        onChange={onChange}
        onDisconnect={onDisconnect}
        {...(disconnecting !== undefined ? { disconnecting } : {})}
      />

      {/* Claude section */}
      <div className="flex flex-col gap-3 mt-10">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">Claude</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Claude activity is tracked via the daemon's claude-source integration.
          Activity appears automatically when Claude Code is active on this machine.
        </p>
      </div>
    </TabFrame>
  );
}
