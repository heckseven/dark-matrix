import { reconnectDelay } from './reconnect.js';

export type { PreviewTarget } from './store.js';

export interface PreviewBridge {
  sendFrame(frameBase64: string, mode: 'bw' | 'gray', width: 9 | 18, target: import('./store.js').PreviewTarget): void;
  stop(): void;
  dispose(): void;
}

export function createPreviewBridge(wsUrl: string): PreviewBridge {
  let ws: WebSocket | null = null;
  let disposed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: Parameters<PreviewBridge['sendFrame']> | null = null;

  function flush() {
    if (pending && ws && ws.readyState === WebSocket.OPEN) {
      const [frameBase64, mode, width, target] = pending;
      ws.send(JSON.stringify({ type: 'preview', frame: frameBase64, mode, width, target }));
      pending = null;
    }
  }

  function connect() {
    if (disposed) return;
    ws = new WebSocket(wsUrl);
    ws.onclose = () => {
      ws = null;
      // Reconnect forever at a capped, backed-off interval — the old 5-attempt
      // give-up left the preview permanently dead after a brief outage (L23).
      if (!disposed) {
        reconnectTimer = setTimeout(connect, reconnectDelay(attempt++));
      }
    };
    ws.onopen = () => { attempt = 0; flush(); };
  }

  connect();

  return {
    sendFrame(frameBase64: string, mode: 'bw' | 'gray', width: 9 | 18, target: import('./store.js').PreviewTarget) {
      pending = [frameBase64, mode, width, target];
      flush();
    },
    stop() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'preview-stop' }));
      }
    },
    dispose() {
      disposed = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
    },
  };
}
