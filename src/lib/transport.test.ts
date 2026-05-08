import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BinaryTransport, SerialTransport, InvalidDevicePathError } from './transport.js';
import type { Frame } from './frame.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFrame(fill = 0): Frame {
  return new Uint8Array(306).fill(fill) as Frame;
}

function makePacked(fill = 0): Uint8Array {
  return new Uint8Array(39).fill(fill);
}

const VALID_PATH = '/dev/ttyACM0';
const BY_PATH = '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0';
const INVALID_PATH = '/dev/sda1';

// ---------------------------------------------------------------------------
// BinaryTransport — mock child_process.spawn
// ---------------------------------------------------------------------------
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock SerialPort for BinaryTransport frame tests
vi.mock('serialport', () => {
  const mockPort = {
    open: vi.fn((cb: (err?: Error) => void) => cb()),
    write: vi.fn((data: unknown, cb: (err?: Error) => void) => cb()),
    drain: vi.fn((cb: (err?: Error) => void) => cb()),
    close: vi.fn((cb: (err?: Error) => void) => cb()),
  };
  return {
    SerialPort: vi.fn(() => mockPort),
    _mockPort: mockPort,
  };
});

import { spawn } from 'node:child_process';
import * as serialportMod from 'serialport';

const mockedSpawn = vi.mocked(spawn);

function makeMockProcess(exitCode = 0) {
  const listeners: Record<string, ((arg: unknown) => void)[]> = {};
  const proc = {
    stderr: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event]!.push(cb as (arg: unknown) => void);
      }),
    },
    on: vi.fn((event: string, cb: (arg: unknown) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event]!.push(cb);
      if (event === 'close') {
        // fire asynchronously
        setTimeout(() => cb(exitCode), 0);
      }
    }),
  };
  return proc;
}

describe('BinaryTransport', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
    // Reset serialport mock
    const mock = (serialportMod as unknown as { _mockPort: ReturnType<typeof makeMockPort> })._mockPort;
    if (mock) {
      mock.open.mockClear();
      mock.write.mockClear();
      mock.drain.mockClear();
      mock.close.mockClear();
    }
  });

  it('throws InvalidDevicePathError for invalid path', async () => {
    const t = new BinaryTransport('/usr/bin/ipc');
    await expect(t.command(INVALID_PATH, 'led-matrix', ['--brightness', '50']))
      .rejects.toBeInstanceOf(InvalidDevicePathError);
  });

  it('throws InvalidDevicePathError for bare ttyACM without /dev/', async () => {
    const t = new BinaryTransport('/usr/bin/ipc');
    await expect(t.command('ttyACM0', 'led-matrix', []))
      .rejects.toBeInstanceOf(InvalidDevicePathError);
  });

  it('command calls spawn with correct args and no shell', async () => {
    mockedSpawn.mockReturnValue(makeMockProcess(0) as unknown as ReturnType<typeof spawn>);
    const t = new BinaryTransport('/home/heckseven/scripts/inputmodule-control.sh');
    await t.command(VALID_PATH, 'led-matrix', ['--pattern', 'panic']);
    expect(mockedSpawn).toHaveBeenCalledWith(
      '/home/heckseven/scripts/inputmodule-control.sh',
      ['--serial-dev', VALID_PATH, 'led-matrix', '--pattern', 'panic'],
      expect.objectContaining({ shell: false }),
    );
  });

  it('command rejects on non-zero exit with stderr message', async () => {
    const proc = makeMockProcess(1);
    mockedSpawn.mockReturnValue(proc as unknown as ReturnType<typeof spawn>);
    const t = new BinaryTransport('/usr/bin/ipc');
    // Emit stderr before close fires
    setTimeout(() => {
      const cb = proc.stderr.on.mock.calls.find(([e]) => e === 'data')?.[1];
      if (cb) cb(Buffer.from('device not found'));
    }, 0);
    await expect(t.command(VALID_PATH, 'led-matrix', [])).rejects.toThrow('device not found');
  });

  it('accepts by-path device paths', async () => {
    mockedSpawn.mockReturnValue(makeMockProcess(0) as unknown as ReturnType<typeof spawn>);
    const t = new BinaryTransport('/usr/bin/ipc');
    await expect(t.command(BY_PATH, 'led-matrix', ['--brightness', '50'])).resolves.toBeUndefined();
  });

  it('brightness calls command with correct flags', async () => {
    mockedSpawn.mockReturnValue(makeMockProcess(0) as unknown as ReturnType<typeof spawn>);
    const t = new BinaryTransport('/usr/bin/ipc');
    await t.brightness(VALID_PATH, 75);
    expect(mockedSpawn).toHaveBeenCalledWith(
      '/usr/bin/ipc',
      ['--serial-dev', VALID_PATH, 'led-matrix', '--brightness', '75'],
      expect.objectContaining({ shell: false }),
    );
  });

  it('release and close are no-ops', async () => {
    const t = new BinaryTransport('/usr/bin/ipc');
    await expect(t.release(VALID_PATH)).resolves.toBeUndefined();
    await expect(t.close()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Wire protocol byte construction tests (independent of transport impl)
// ---------------------------------------------------------------------------
describe('BW frame byte construction', () => {
  it('frameBw sends exactly 42 bytes: magic + opcode + 39 payload', async () => {
    const { SerialPort: MockSP, _mockPort } = serialportMod as unknown as {
      SerialPort: ReturnType<typeof vi.fn>;
      _mockPort: { write: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; drain: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
    };
    MockSP.mockClear();
    _mockPort.open.mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.write.mockImplementation((data: unknown, cb: (err?: Error) => void) => cb());
    _mockPort.drain.mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.close.mockImplementation((cb: (err?: Error) => void) => cb());

    const t = new BinaryTransport('/usr/bin/ipc');
    const packed = makePacked(0xab);
    await t.frameBw(packed, VALID_PATH);

    expect(_mockPort.write).toHaveBeenCalledOnce();
    const writtenBuf: Buffer = _mockPort.write.mock.calls[0]![0] as Buffer;
    expect(writtenBuf.length).toBe(42);
    expect(writtenBuf[0]).toBe(0x32);
    expect(writtenBuf[1]).toBe(0xac);
    expect(writtenBuf[2]).toBe(0x06);
    expect(Array.from(writtenBuf.slice(3))).toEqual(Array.from(packed));
  });

  it('frameGray sends exactly 345 bytes total across 10 writes', async () => {
    const { _mockPort } = serialportMod as unknown as {
      _mockPort: { write: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; drain: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
    };
    _mockPort.open.mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.write.mockImplementation((data: unknown, cb: (err?: Error) => void) => cb());
    _mockPort.drain.mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.close.mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.write.mockClear();

    const t = new BinaryTransport('/usr/bin/ipc');
    await t.frameGray(makeFrame(128), VALID_PATH);

    // 9 SendCol + 1 CommitCols = 10 writes
    expect(_mockPort.write).toHaveBeenCalledTimes(10);
    const totalBytes = (_mockPort.write.mock.calls as [Buffer, unknown][])
      .reduce((sum, [buf]) => sum + buf.length, 0);
    expect(totalBytes).toBe(345);

    // First SendCol: magic + 0x07 + col_idx(0) + 34 vals
    const firstPkt: Buffer = _mockPort.write.mock.calls[0]![0] as Buffer;
    expect(firstPkt[0]).toBe(0x32);
    expect(firstPkt[1]).toBe(0xac);
    expect(firstPkt[2]).toBe(0x07);
    expect(firstPkt[3]).toBe(0); // col 0

    // Last write: CommitCols
    const lastPkt: Buffer = _mockPort.write.mock.calls[9]![0] as Buffer;
    expect(Array.from(lastPkt)).toEqual([0x32, 0xac, 0x08]);
  });
});

// ---------------------------------------------------------------------------
// Helpers for type narrowing
// ---------------------------------------------------------------------------
function makeMockPort() {
  return {
    open: vi.fn((cb: (err?: Error) => void) => cb()),
    write: vi.fn((data: unknown, cb: (err?: Error) => void) => cb()),
    drain: vi.fn((cb: (err?: Error) => void) => cb()),
    close: vi.fn((cb: (err?: Error) => void) => cb()),
  };
}
