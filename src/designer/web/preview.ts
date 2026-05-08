export type { PreviewTarget } from './store.js';

export interface PreviewBridge {
  sendFrame(frameBase64: string, mode: 'bw' | 'gray', width: 9 | 18, target: import('./store.js').PreviewTarget): void;
  stop(): void;
  dispose(): void;
}

export function createPreviewBridge(wsUrl: string): PreviewBridge {
  let ws: WebSocket | null = null;
  let disposed = false;
  let retries = 0;
  const MAX_RETRIES = 5;

  function connect() {
    if (disposed) return;
    ws = new WebSocket(wsUrl);
    ws.onclose = () => {
      ws = null;
      if (!disposed && retries < MAX_RETRIES) {
        retries++;
        setTimeout(connect, 1000);
      }
    };
    ws.onopen = () => { retries = 0; };
  }

  connect();

  return {
    sendFrame(frameBase64: string, mode: 'bw' | 'gray', width: 9 | 18, target: import('./store.js').PreviewTarget) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'preview', frame: frameBase64, mode, width, target }));
      }
    },
    stop() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'preview-stop' }));
      }
    },
    dispose() {
      disposed = true;
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
    },
  };
}
