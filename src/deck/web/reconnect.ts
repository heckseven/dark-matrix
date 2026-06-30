// Bounded exponential backoff for WebSocket reconnects, shared by the preview
// bridge and the deck panels. A downed daemon/server is retried forever at a
// capped interval — never a premature give-up (the old preview bug, L23) and
// never an unthrottled hammer (the storm the panels previously avoided only by
// not reconnecting at all, M17).
export function reconnectDelay(attempt: number, baseMs = 500, maxMs = 10_000): number {
  const ms = baseMs * 2 ** Math.max(0, attempt);
  return Math.min(ms, maxMs);
}

export interface ManagedSocket {
  readonly current: WebSocket | null;
  // Tear down for good: stop reconnecting and close the live socket. `beforeClose`
  // runs against an OPEN socket so callers can emit a final message (e.g. a
  // stop/save) before it closes.
  dispose(beforeClose?: (ws: WebSocket) => void): void;
}

export interface ReconnectingSocketOptions {
  url: string;
  // Called for every new socket, before it opens — set refs/module globals here.
  onSocket?: (ws: WebSocket) => void;
  // Called once each socket reaches OPEN — (re)send the connection's init burst.
  onOpen?: (ws: WebSocket) => void;
  // Typed as Event (not MessageEvent) so the helper needs no lossy cast; the
  // 'message' event always delivers a MessageEvent at runtime, so callers narrow
  // with `(e as MessageEvent).data`.
  onMessage?: (e: Event) => void;
  baseMs?: number;
  maxMs?: number;
}

// Self-healing WebSocket: reconnects with bounded backoff after any close until
// disposed. The backoff attempt counter resets on each successful open.
export function createReconnectingSocket(opts: ReconnectingSocketOptions): ManagedSocket {
  let ws: WebSocket | null = null;
  let disposed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onMessage = opts.onMessage;

  function connect(): void {
    if (disposed) return;
    const sock = new WebSocket(opts.url);
    ws = sock;
    opts.onSocket?.(sock);
    sock.addEventListener('open', () => {
      attempt = 0;
      opts.onOpen?.(sock);
    });
    if (onMessage) sock.addEventListener('message', onMessage);
    sock.addEventListener('close', () => {
      if (ws === sock) ws = null;
      if (disposed) return;
      timer = setTimeout(connect, reconnectDelay(attempt++, opts.baseMs, opts.maxMs));
    });
  }

  connect();

  return {
    get current() { return ws; },
    dispose(beforeClose) {
      disposed = true;
      if (timer) { clearTimeout(timer); timer = null; }
      const sock = ws;
      ws = null;
      if (sock) {
        // Drop the message handler before closing: a socket in CLOSING state can
        // still deliver buffered messages, which would otherwise fire handlers on
        // an unmounted component and burn CPU rendering dead frames.
        if (onMessage) sock.removeEventListener('message', onMessage);
        if (beforeClose && sock.readyState === WebSocket.OPEN) {
          try { beforeClose(sock); } catch { /* non-fatal */ }
        }
        sock.close();
      }
    },
  };
}
