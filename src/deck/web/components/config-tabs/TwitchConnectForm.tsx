import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Link } from '../ui/link.js';
import { TabRow } from './tab-frame.js';
import type { Config } from '../../types/config-types.js';

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

const REDIRECT_URI = 'http://127.0.0.1:7340/auth/twitch/callback';

export function TwitchConnectForm({ config, onChange, onDisconnect, disconnecting, showHeading = true }: {
  config: Config;
  onChange: (patch: DeepPartial<Config>) => void;
  onDisconnect: () => void;
  disconnecting?: boolean;
  /** Show the "Twitch" section heading and status dot. Hidden when the host already titles the form. */
  showHeading?: boolean;
}) {
  const twitch = config.twitch;
  const isConnected = !!(twitch?.broadcaster_id);

  const [clientId, setClientId] = useState(twitch?.client_id ?? '');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  async function copyRedirectUri() {
    try {
      await navigator.clipboard.writeText(REDIRECT_URI);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — leave the URI for manual copy
    }
  }

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
      onChange({ twitch: { ...(twitch?.broadcaster_id ? { broadcaster_id: twitch.broadcaster_id } : {}), client_id: id } });
      window.open(data.auth_url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('network error');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showHeading && (
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">Twitch</span>
          <span
            className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-muted-foreground'}`}
            {...(isConnected ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Not connected' })}
          />
          {isConnected && <span className="text-muted-foreground text-xs">connected</span>}
        </div>
      )}

      <TabRow label="client ID">
        <Input
          fluid
          aria-label="Twitch client ID"
          placeholder="your Twitch app client ID"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          onBlur={() => {
            const id = clientId.trim();
            if (id) onChange({ twitch: { ...(twitch?.broadcaster_id ? { broadcaster_id: twitch.broadcaster_id } : {}), client_id: id } });
          }}
        />
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
              onClick={onDisconnect}
              disabled={!!disconnecting}
              aria-busy={!!disconnecting}
            >
              {disconnecting ? 'disconnecting…' : 'disconnect'}
            </Button>
          </>
        ) : (
          <Button
            variant={clientId.trim() ? 'primary' : 'default'}
            size="sm"
            tooltip="Open Twitch authorization in browser"
            disabled={!clientId.trim() || connecting}
            onClick={handleConnect}
          >
            {connecting ? 'opening…' : 'connect'}
          </Button>
        )}
      </TabRow>

      {error && (
        <p role="alert" className="text-xs text-destructive">{error}</p>
      )}

      <ol className="text-xs text-muted-foreground flex flex-col gap-1.5 list-decimal pl-4">
        <li>
          Register an app at{' '}
          <Link href="https://dev.twitch.tv/console/apps" className="text-foreground">dev.twitch.tv</Link>.
        </li>
        <li>
          Set the redirect URI to{' '}
          <span className="text-foreground break-all">{REDIRECT_URI}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 align-middle"
            tooltip={copied ? 'Redirect URI copied' : 'Copy redirect URI'}
            aria-label={copied ? 'Redirect URI copied' : 'Copy redirect URI'}
            onClick={() => void copyRedirectUri()}
          >
            {copied ? 'copied' : 'copy'}
          </Button>
        </li>
        <li>Paste the client ID above, then click connect.</li>
      </ol>
    </div>
  );
}
