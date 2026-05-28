export type TwitchEventMessage = {
  type: 'twitch-event';
  eventType?: string;
  payload?: Record<string, unknown>;
  channel?: string;
};

type Handler = (msg: TwitchEventMessage) => void;

const handlers = new Set<Handler>();
let ws: WebSocket | null = null;
let refCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  const socket = new WebSocket(`ws://${location.host}/ws`);
  ws = socket;

  socket.onmessage = (e) => {
    if (typeof e.data !== 'string') return;
    try {
      const msg = JSON.parse(e.data) as { type?: unknown };
      if (msg.type !== 'twitch-event') return;
      for (const h of handlers) h(msg as TwitchEventMessage);
    } catch { /* ignore */ }
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    if (refCount > 0) reconnectTimer = setTimeout(connect, 3000);
  };
}

export function subscribeTwitchEvents(handler: Handler): () => void {
  handlers.add(handler);
  refCount++;
  if (refCount === 1) connect();
  return () => {
    handlers.delete(handler);
    refCount--;
    if (refCount === 0) {
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      ws?.close();
      ws = null;
    }
  };
}
