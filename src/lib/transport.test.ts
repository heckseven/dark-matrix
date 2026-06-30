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

// Mock SerialPort. It is a real EventEmitter so an unhandled 'error' authentically
// throws (Node semantics) — this is what proves the C1 fix attaches a listener.
// The constructor returns a single shared port; existing tests configure it via
// _mockPort before constructing.
vi.mock('serialport', async () => {
  const { EventEmitter } = await import('node:events');
  const mockPort = Object.assign(new EventEmitter(), {
    open: vi.fn((cb: (err?: Error) => void) => cb()),
    write: vi.fn((data: unknown, cb: (err?: Error) => void) => cb()),
    drain: vi.fn((cb: (err?: Error) => void) => cb()),
    close: vi.fn((cb: (err?: Error) => void) => cb()),
  });
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
    const mock = (serialportMod as unknown as { _mockPort: PortMock })._mockPort;
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
    const t = new BinaryTransport('/usr/local/bin/inputmodule-control');
    await t.command(VALID_PATH, 'led-matrix', ['--pattern', 'panic']);
    expect(mockedSpawn).toHaveBeenCalledWith(
      '/usr/local/bin/inputmodule-control',
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
// SerialTransport — brightness native packet
// ---------------------------------------------------------------------------
describe('SerialTransport brightness', () => {
  it('writes 4-byte brightness packet: magic + 0x00 + clamped pct', async () => {
    const { SerialPort: MockSP, _mockPort } = serialportMod as unknown as {
      SerialPort: ReturnType<typeof vi.fn>;
      _mockPort: PortMock;
    };
    MockSP.mockClear();
    _mockPort.open.mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.write.mockClear();
    _mockPort.write.mockImplementation((data: unknown, cb: (err?: Error) => void) => cb());
    _mockPort.drain.mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.close.mockImplementation((cb: (err?: Error) => void) => cb());

    const t = new SerialTransport();
    await t.brightness(VALID_PATH, 75);

    expect(_mockPort.write).toHaveBeenCalledOnce();
    const written: Buffer = _mockPort.write.mock.calls[0]![0] as Buffer;
    expect(written.length).toBe(4);
    expect(written[0]).toBe(0x32);
    expect(written[1]).toBe(0xac);
    expect(written[2]).toBe(0x00);
    expect(written[3]).toBe(75);
  });

  it('clamps brightness to [0, 100]', async () => {
    const { _mockPort } = serialportMod as unknown as {
      _mockPort: PortMock;
    };
    _mockPort.write.mockClear();
    _mockPort.write.mockImplementation((data: unknown, cb: (err?: Error) => void) => cb());
    _mockPort.drain.mockImplementation((cb: (err?: Error) => void) => cb());

    const t = new SerialTransport();
    await t.brightness(VALID_PATH, 150);
    const written: Buffer = _mockPort.write.mock.calls[0]![0] as Buffer;
    expect(written[3]).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// SerialTransport lifecycle — disconnect / eviction / release (Phase 1: C1,H8,H11)
// ---------------------------------------------------------------------------
type PortMock = {
  open: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  drain: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on(event: string, cb: (...a: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): boolean;
  removeAllListeners(): unknown;
  listenerCount(event: string): number;
};

function lifecycleMocks() {
  return serialportMod as unknown as {
    SerialPort: ReturnType<typeof vi.fn>;
    _mockPort: PortMock;
  };
}

function errWithCode(code: string): NodeJS.ErrnoException {
  const e = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

describe('SerialTransport lifecycle', () => {
  beforeEach(() => {
    const { SerialPort, _mockPort } = lifecycleMocks();
    SerialPort.mockClear();
    _mockPort.removeAllListeners();
    _mockPort.open.mockReset().mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.write.mockReset().mockImplementation((_d: unknown, cb: (err?: Error) => void) => cb());
    _mockPort.drain.mockReset().mockImplementation((cb: (err?: Error) => void) => cb());
    _mockPort.close.mockReset().mockImplementation((cb: (err?: Error) => void) => cb());
  });

  it('C1: an out-of-band port error does not throw (a listener is attached)', async () => {
    const { _mockPort } = lifecycleMocks();
    const t = new SerialTransport();
    await t.liveFrameBw(makePacked(0x01), VALID_PATH);
    // Real EventEmitter: emitting 'error' with no listener would throw. The fix
    // attaches one (openPort swallow + getPort eviction), so this must not throw.
    expect(_mockPort.listenerCount('error')).toBeGreaterThan(0);
    expect(() => _mockPort.emit('error', errWithCode('EIO'))).not.toThrow();
  });

  it('L27: a write rejects instead of hanging when the port emits an out-of-band error', async () => {
    const { _mockPort } = lifecycleMocks();
    // Simulate the binding emitting 'error' instead of failing the write
    // callback — the callback is never invoked, so without the once('error')
    // guard in writePort the returned promise would never settle.
    _mockPort.write.mockImplementationOnce(() => { /* no callback — would hang */ });
    const t = new BinaryTransport('/usr/bin/ipc');
    const p = t.frameBw(makePacked(0x01), VALID_PATH);
    await new Promise<void>(r => setImmediate(r)); // let openPort resolve + write issue
    _mockPort.emit('error', errWithCode('EIO'));
    await expect(p).rejects.toThrow();
  });

  it('C1/H8: a port error evicts the port so the next write re-opens it', async () => {
    const { SerialPort, _mockPort } = lifecycleMocks();
    const t = new SerialTransport();
    await t.liveFrameBw(makePacked(0x01), VALID_PATH);
    expect(SerialPort).toHaveBeenCalledTimes(1);

    _mockPort.emit('error', errWithCode('EIO')); // unplug
    await new Promise<void>(r => setImmediate(r)); // let evict() closePort settle
    expect(_mockPort.close).toHaveBeenCalled();

    // Next write must re-open (construct) rather than reuse the dead port.
    await t.liveFrameBw(makePacked(0x02), VALID_PATH);
    expect(SerialPort).toHaveBeenCalledTimes(2);
  });

  it('H8: a disconnect-class write failure evicts; a transient one does not', async () => {
    const { SerialPort, _mockPort } = lifecycleMocks();
    const t = new SerialTransport();

    // Transient error (ETIMEDOUT) — must NOT evict. (frameBw rejects on write
    // failure; the daemon wraps these in try/catch, so the test does too.)
    _mockPort.write.mockImplementationOnce((_d: unknown, cb: (err?: Error) => void) => cb(errWithCode('ETIMEDOUT')));
    await t.frameBw(makePacked(0x01), VALID_PATH).catch(() => {});
    await new Promise<void>(r => setImmediate(r));
    await t.frameBw(makePacked(0x02), VALID_PATH);
    expect(SerialPort).toHaveBeenCalledTimes(1); // still the same port

    // Disconnect error (EIO) — must evict so the next write re-opens.
    _mockPort.write.mockImplementationOnce((_d: unknown, cb: (err?: Error) => void) => cb(errWithCode('EIO')));
    await t.frameBw(makePacked(0x03), VALID_PATH).catch(() => {});
    await new Promise<void>(r => setImmediate(r));
    await t.frameBw(makePacked(0x04), VALID_PATH);
    expect(SerialPort).toHaveBeenCalledTimes(2);
  });

  it('H11: release() drops a queued live write instead of writing to a closed port', async () => {
    const { _mockPort } = lifecycleMocks();
    // Hold the in-flight write open via a gate the test controls, so release()
    // deterministically runs while a write is pending (no timer race).
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>(r => { releaseWrite = r; });
    _mockPort.write.mockImplementationOnce((_d: unknown, cb: (err?: Error) => void) => { void writeGate.then(() => cb()); });
    const t = new SerialTransport();

    const first = t.liveFrameBw(makePacked(0xa1), VALID_PATH); // write pending on the gate
    await new Promise<void>(r => setImmediate(r));
    void t.liveFrameBw(makePacked(0xb2), VALID_PATH);          // queued in state.next
    const releasing = t.release(VALID_PATH);                  // waits for `writing` to clear
    releaseWrite();                                           // let the in-flight write finish
    await releasing;
    await first.catch(() => {});

    // release() drains the in-flight write before returning, so the write count
    // is stable: only the first frame was written; the queued one was dropped.
    expect(_mockPort.write).toHaveBeenCalledTimes(1);
    expect(_mockPort.close).toHaveBeenCalledTimes(1);

    // A write after release re-opens a fresh port (no reuse of the closed one).
    await t.liveFrameBw(makePacked(0xc3), VALID_PATH);
    expect(_mockPort.write).toHaveBeenCalledTimes(2);
  });
});

