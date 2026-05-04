import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStop = vi.fn().mockResolvedValue(undefined);
const mockStartDesignerServer = vi.fn().mockResolvedValue({
  url: 'http://localhost:7340',
  port: 7340,
  stop: mockStop,
});

vi.mock('../designer/server.js', () => ({
  startDesignerServer: mockStartDesignerServer,
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({ unref: vi.fn() }),
}));

async function cmdDesigner(args: string[]): Promise<void> {
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '7340', 10) : 7340;
  const { startDesignerServer } = await import('../designer/server.js');
  const server = await startDesignerServer({ port });
  process.stdout.write(`Designer running at ${server.url}\nPress Ctrl-C to stop.\n`);
  const { spawn } = await import('node:child_process');
  spawn('xdg-open', [server.url], { stdio: 'ignore', detached: true });
  const shutdown = async () => { await server.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

describe('cmdDesigner', () => {
  const written: string[] = [];

  beforeEach(() => {
    written.length = 0;
    vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk: Parameters<typeof process.stdout.write>[0]) => {
        written.push(chunk.toString());
        return true;
      }
    );
    mockStop.mockReset().mockResolvedValue(undefined);
    mockStartDesignerServer.mockReset().mockResolvedValue({
      url: 'http://localhost:7340',
      port: 7340,
      stop: mockStop,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls startDesignerServer with default port 7340', async () => {
    await cmdDesigner([]);
    expect(mockStartDesignerServer).toHaveBeenCalledWith({ port: 7340 });
  });

  it('calls startDesignerServer with custom port', async () => {
    await cmdDesigner(['--port', '8000']);
    expect(mockStartDesignerServer).toHaveBeenCalledWith({ port: 8000 });
  });

  it('writes running message to stdout', async () => {
    await cmdDesigner([]);
    expect(written.join('')).toContain('Designer running at http://localhost:7340');
  });

  it('SIGINT handler calls server.stop()', async () => {
    const listeners: Array<() => Promise<void>> = [];
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, fn: (...args: unknown[]) => void) => {
      if (event === 'SIGINT') listeners.push(fn as () => Promise<void>);
      return process;
    });

    await cmdDesigner([]);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => { throw new Error('exit'); });
    try {
      await listeners[0]?.();
    } catch {
      // expected
    }
    expect(mockStop).toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

