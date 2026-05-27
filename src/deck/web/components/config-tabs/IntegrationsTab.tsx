import { useState } from 'react';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { TabFrame, TabRow } from './tab-frame.js';
import type { Config, TwitchConfig } from '../../types/config-types.js';

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export function IntegrationsTab({ config, onChange }: {
  config: Config;
  onChange: (patch: DeepPartial<Config>) => void;
}) {
  const twitch = config.twitch;
  const isConnected = !!(twitch?.access_token);

  const [clientId, setClientId] = useState(twitch?.client_id ?? '');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    const id = clientId.trim();
    if (!id) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/twitch/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id }),
      });
      const data = await res.json() as { ok: boolean; auth_url?: string; error?: string };
      if (!data.ok || !data.auth_url) { setError(data.error ?? 'failed to start auth'); return; }
      // Save client_id to config before opening browser
      onChange({ twitch: { ...(twitch ?? {}), client_id: id } });
      window.open(data.auth_url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('network error');
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    const next: TwitchConfig = { ...(clientId ? { client_id: clientId } : {}) };
    onChange({ twitch: next });
  }

  return (
    <TabFrame>
      {/* Twitch section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">Twitch</span>
          <span
            role="img"
            className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-muted-foreground'}`}
            aria-label={isConnected ? 'Connected' : 'Not connected'}
          />
          {isConnected && <span className="text-muted-foreground text-xs">connected</span>}
        </div>

        <TabRow label="client ID">
          <Input
            fluid
            placeholder="your Twitch app client ID"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            onBlur={() => {
              const id = clientId.trim();
              if (id) onChange({ twitch: { ...(twitch ?? {}), client_id: id } });
            }}
          />
        </TabRow>

        <TabRow label="">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Button
                  size="sm"
                  tooltip="Open Twitch authorization in browser"
                  disabled={!clientId.trim() || connecting}
                  onClick={handleConnect}
                >
                  {connecting ? 'opening…' : 'reconnect'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  tooltip="Remove Twitch token from config"
                  onClick={handleDisconnect}
                >
                  disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                tooltip="Open Twitch authorization in browser"
                disabled={!clientId.trim() || connecting}
                onClick={handleConnect}
              >
                {connecting ? 'opening…' : 'connect Twitch'}
              </Button>
            )}
          </div>
        </TabRow>

        {error && (
          <p role="alert" className="text-xs text-destructive">{error}</p>
        )}

        <p className="text-xs text-muted-foreground">
          Register an app at{' '}
          <span className="text-foreground">dev.twitch.tv</span> with redirect URI{' '}
          <span className="text-foreground">http://127.0.0.1:7340/auth/twitch/callback</span>.
          Copy the client ID here, then click connect.
        </p>
      </div>

      {/* Claude section */}
      <div className="flex flex-col gap-3 pt-4 border-t border-border">
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
