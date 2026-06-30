import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reconnectDelay, createReconnectingSocket } from './reconnect.js';

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  url: string;
  closed = false;
  private listeners: Record<string, ((e: unknown) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  addEventListener(type: string, cb: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: (e: unknown) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(l => l !== cb);
  }
  close() { this.closed = true; this.fireClose(); }
  private fire(type: string, e?: unknown) { for (const cb of this.listeners[type] ?? []) cb(e ?? {}); }
  fireOpen() { this.readyState = MockWebSocket.OPEN; this.fire('open'); }
  fireClose() { this.readyState = MockWebSocket.CLOSED; this.fire('close'); }
  fireMessage(data: string) { this.fire('message', { data }); }
}

describe('reconnectDelay (M17/L23)', () => {
  it('grows exponentially from the base', () => {
    expect(reconnectDelay(0)).toBe(500);
    expect(reconnectDelay(1)).toBe(1000);
    expect(reconnectDelay(2)).toBe(2000);
    expect(reconnectDelay(3)).toBe(4000);
  });
  it('caps at the max interval and never gives up', () => {
    expect(reconnectDelay(100)).toBe(10_000);
    expect(reconnectDelay(1000)).toBe(10_000);
  });
  it('honors custom base/max', () => {
    expect(reconnectDelay(2, 100, 1000)).toBe(400);
    expect(reconnectDelay(9, 100, 1000)).toBe(1000);
  });
});

describe('createReconnectingSocket (M17)', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens a socket and fires onSocket then onOpen', () => {
    const order: string[] = [];
    createReconnectingSocket({
      url: 'ws://x/ws',
      onSocket: () => order.push('socket'),
      onOpen: () => order.push('open'),
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0]!.fireOpen();
    expect(order).toEqual(['socket', 'open']);
  });

  it('reconnects after a close, with backoff', () => {
    createReconnectingSocket({ url: 'ws://x/ws' });
    MockWebSocket.instances[0]!.fireOpen();
    MockWebSocket.instances[0]!.fireClose();
    // No immediate reconnect; first retry after ~500ms.
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('escalates backoff across consecutive failures and resets after open', () => {
    createReconnectingSocket({ url: 'ws://x/ws' });
    // First socket never opens, just closes → retry at 500ms.
    MockWebSocket.instances[0]!.fireClose();
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(2);
    // Second also closes → retry at 1000ms (escalated).
    MockWebSocket.instances[1]!.fireClose();
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
    // Third opens (resets attempt), then closes → retry back at 500ms.
    MockWebSocket.instances[2]!.fireOpen();
    MockWebSocket.instances[2]!.fireClose();
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('stops reconnecting once disposed', () => {
    const managed = createReconnectingSocket({ url: 'ws://x/ws' });
    MockWebSocket.instances[0]!.fireOpen();
    managed.dispose();
    MockWebSocket.instances[0]!.fireClose();
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1); // no reconnect
  });

  it('runs beforeClose against an OPEN socket then closes it', () => {
    const managed = createReconnectingSocket({ url: 'ws://x/ws' });
    const sock = MockWebSocket.instances[0]!;
    sock.fireOpen();
    const sent: string[] = [];
    managed.dispose((ws) => sent.push((ws as unknown as { url: string }).url));
    expect(sent).toEqual(['ws://x/ws']);
    expect(sock.closed).toBe(true);
  });

  it('does not run beforeClose if the socket is not OPEN', () => {
    const managed = createReconnectingSocket({ url: 'ws://x/ws' });
    // never opened (readyState CONNECTING)
    const beforeClose = vi.fn();
    managed.dispose(beforeClose);
    expect(beforeClose).not.toHaveBeenCalled();
  });

  it('forwards messages to onMessage', () => {
    const got: string[] = [];
    createReconnectingSocket({
      url: 'ws://x/ws',
      onMessage: (e) => got.push((e as MessageEvent).data as string),
    });
    MockWebSocket.instances[0]!.fireOpen();
    MockWebSocket.instances[0]!.fireMessage('hello');
    expect(got).toEqual(['hello']);
  });

  it('stops delivering messages after dispose (no work on a dead component)', () => {
    const got: string[] = [];
    const managed = createReconnectingSocket({
      url: 'ws://x/ws',
      onMessage: (e) => got.push((e as MessageEvent).data as string),
    });
    const sock = MockWebSocket.instances[0]!;
    sock.fireOpen();
    sock.fireMessage('live');
    managed.dispose();
    sock.fireMessage('after-dispose'); // CLOSING-state delivery must be ignored
    expect(got).toEqual(['live']);
  });

  it('exposes the current socket and nulls it after close', () => {
    const managed = createReconnectingSocket({ url: 'ws://x/ws' });
    expect(managed.current).toBe(MockWebSocket.instances[0]);
    MockWebSocket.instances[0]!.fireClose();
    expect(managed.current).toBeNull();
  });
});
