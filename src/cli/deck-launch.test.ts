import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStop = vi.fn().mockResolvedValue(undefined);
const mockStartDeckServer = vi.fn().mockResolvedValue({
  url: 'http://localhost:7340',
  port: 7340,
  stop: mockStop,
});

const { mockChild } = vi.hoisted(() => ({
  mockChild: { on: vi.fn(), unref: vi.fn() },
}));

vi.mock('../deck/server.js', () => ({
  startDeckServer: mockStartDeckServer,
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => mockChild),
}));

// Mirror of cmdDeck in src/cli/index.ts. cli/index.ts runs a top-level command
// switch on import, so it can't be imported directly; this mirror must be kept
// in sync with the real cmdDeck (C2 process handlers + H4 opener error listener).
// The real cmdDeck also guards handler registration against double-registration
// and picks the opener via process.platform; neither affects what these tests
// assert (process.on and spawn are mocked here).
// TODO: extract cmdDeck into an importable unit (guard the top-level switch with
// a run check, as src/daemon/index.ts does) to remove this mirror and its drift.
async function cmdDeck(args: string[]): Promise<void> {
  process.on('uncaughtException', () => {});
  process.on('unhandledRejection', () => {});
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '7340', 10) : 7340;
  const { startDeckServer } = await import('../deck/server.js');
  const server = await startDeckServer({ port });
  process.stdout.write(`Deck running at ${server.url}\nPress Ctrl-C to stop.\n`);
  const { spawn } = await import('node:child_process');
  const child = spawn('xdg-open', [server.url], { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
  const shutdown = async () => { await server.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

describe('cmdDeck', () => {
  const written: string[] = [];
  // Capture process.on registrations instead of installing real handlers, so the
  // test process isn't polluted and we can assert what cmdDeck registered.
  let processHandlers: Map<string | symbol, Array<(...a: unknown[]) => void>>;

  beforeEach(() => {
    written.length = 0;
    processHandlers = new Map();
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, fn: (...args: unknown[]) => void) => {
      const list = processHandlers.get(event) ?? [];
      list.push(fn);
      processHandlers.set(event, list);
      return process;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk: Parameters<typeof process.stdout.write>[0]) => {
        written.push(chunk.toString());
        return true;
      }
    );
    mockChild.on.mockClear();
    mockChild.unref.mockClear();
    mockStop.mockReset().mockResolvedValue(undefined);
    mockStartDeckServer.mockReset().mockResolvedValue({
      url: 'http://localhost:7340',
      port: 7340,
      stop: mockStop,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls startDeckServer with default port 7340', async () => {
    await cmdDeck([]);
    expect(mockStartDeckServer).toHaveBeenCalledWith({ port: 7340 });
  });

  it('calls startDeckServer with custom port', async () => {
    await cmdDeck(['--port', '8000']);
    expect(mockStartDeckServer).toHaveBeenCalledWith({ port: 8000 });
  });

  it('writes running message to stdout', async () => {
    await cmdDeck([]);
    expect(written.join('')).toContain('Deck running at http://localhost:7340');
  });

  it('registers uncaughtException and unhandledRejection handlers (C2)', async () => {
    await cmdDeck([]);
    expect(processHandlers.has('uncaughtException')).toBe(true);
    expect(processHandlers.has('unhandledRejection')).toBe(true);
  });

  it('attaches an error listener to the browser-opener spawn (H4)', async () => {
    await cmdDeck([]);
    expect(mockChild.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockChild.unref).toHaveBeenCalled();
    // The error listener must be attached before unref so a missing opener
    // (ENOENT on a headless host) can never become an uncaughtException.
    const onOrder = mockChild.on.mock.invocationCallOrder[0]!;
    const unrefOrder = mockChild.unref.mock.invocationCallOrder[0]!;
    expect(onOrder).toBeLessThan(unrefOrder);
  });

  it('SIGINT handler calls server.stop()', async () => {
    await cmdDeck([]);
    const sigintHandler = processHandlers.get('SIGINT')?.[0];
    expect(sigintHandler).toBeDefined();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => { throw new Error('exit'); });
    try {
      await sigintHandler?.();
    } catch {
      // expected — process.exit is stubbed to throw
    }
    expect(mockStop).toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
