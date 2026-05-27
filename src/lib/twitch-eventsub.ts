import { createRequire } from 'node:module';
import { sendToDaemon } from './daemon-client.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WS = (require('ws') as typeof import('ws')).WebSocket;

export interface TwitchCredentials {
  client_id: string;
  access_token: string;
  broadcaster_id: string;
}

export interface EventSubOptions {
  credentials: TwitchCredentials;
  broadcastToClients: (msg: unknown) => void;
}

const SUBSCRIPTIONS: Array<{
  type: string;
  version: string;
  condition: (id: string) => Record<string, string>;
}> = [
  { type: 'channel.follow',    version: '2', condition: id => ({ broadcaster_user_id: id, moderator_user_id: id }) },
  { type: 'channel.subscribe', version: '1', condition: id => ({ broadcaster_user_id: id }) },
  { type: 'channel.cheer',     version: '1', condition: id => ({ broadcaster_user_id: id }) },
  { type: 'channel.raid',      version: '1', condition: id => ({ to_broadcaster_user_id: id }) },
];

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

export function startTwitchEventSub(opts: EventSubOptions): () => void {
  let stopped = false;
  let ws: import('ws').WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(url: string = EVENTSUB_WS_URL): void {
    if (stopped) return;
    const socket = new WS(url);
    ws = socket;

    socket.on('message', (data: Buffer | string) => {
      let msg: unknown;
      try { msg = JSON.parse(typeof data === 'string' ? data : data.toString('utf8')); } catch { return; }

      const m = msg as { metadata?: { message_type?: string; subscription_type?: string }; payload?: unknown };
      const msgType = m.metadata?.message_type;

      if (msgType === 'session_welcome') {
        const session = (m.payload as { session?: { id?: string } })?.session;
        if (session?.id) void subscribeAll(session.id, opts.credentials);
      } else if (msgType === 'session_reconnect') {
        const session = (m.payload as { session?: { reconnect_url?: string } })?.session;
        const rawUrl = session?.reconnect_url;
        const parsed = (() => { try { return new URL(rawUrl ?? ''); } catch { return null; } })();
        const reconnectUrl = parsed?.protocol === 'wss:' && parsed.hostname === 'eventsub.wss.twitch.tv'
          ? rawUrl! : EVENTSUB_WS_URL;
        // Replace ws before closing so the close handler sees it is no longer current
        ws = null;
        socket.close();
        connect(reconnectUrl);
      } else if (msgType === 'notification') {
        const subType = m.metadata?.subscription_type ?? '';
        const event = (m.payload as { event?: Record<string, unknown> })?.event ?? {};
        handleNotification(subType, event, opts);
      }
    });

    socket.on('close', () => {
      // Only retry if this socket is still the current one (reconnect replaces ws before close)
      if (ws !== socket) return;
      ws = null;
      if (!stopped) {
        retryTimer = setTimeout(() => connect(), 5000);
      }
    });

    socket.on('error', () => { /* close will fire */ });
  }

  connect();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
    ws = null;
  };
}

async function subscribeAll(sessionId: string, creds: TwitchCredentials): Promise<void> {
  for (const sub of SUBSCRIPTIONS) {
    try {
      const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.access_token}`,
          'Client-Id': creds.client_id,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: sub.type,
          version: sub.version,
          condition: sub.condition(creds.broadcaster_id),
          transport: { method: 'websocket', session_id: sessionId },
        }),
      });
      if (!res.ok) console.warn('[eventsub] subscription failed:', sub.type, res.status);
    } catch (e) {
      // Non-fatal — missing scope may prevent some subscriptions
      console.warn('[eventsub] subscription error:', sub.type, e);
    }
  }
}

function handleNotification(
  subType: string,
  event: Record<string, unknown>,
  opts: EventSubOptions,
): void {
  const channel = String(event['broadcaster_user_login'] ?? event['to_broadcaster_user_login'] ?? '');

  opts.broadcastToClients({ type: 'twitch-event', eventType: subType, channel, payload: event });
  sendToDaemon({ cmd: 'twitch-notify', eventType: subType, event }).catch(() => {});
}
