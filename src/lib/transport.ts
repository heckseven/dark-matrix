import { spawn } from 'node:child_process';
import { SerialPort } from 'serialport';
import type { Frame } from './frame.js';

const FRAME_ROWS = 34;
const FRAME_COLS = 9;

const FWK_MAGIC = [0x32, 0xac] as const;
const CMD_BRIGHTNESS = 0x00;
const CMD_DISPLAY_BW = 0x06;
const CMD_SEND_COL = 0x07;
const CMD_COMMIT_COLS = 0x08;

const DEVICE_PATH_RE =
  /^\/dev\/(ttyACM\d+|ttyUSB\d+|serial\/by-path\/[a-zA-Z0-9:._-]+)$/;

export class InvalidDevicePathError extends Error {
  constructor(path: string) {
    super(`Invalid device path: "${path}"`);
    this.name = 'InvalidDevicePathError';
  }
}

function validatePath(path: string): void {
  if (!DEVICE_PATH_RE.test(path)) throw new InvalidDevicePathError(path);
}

function buildBrightnessPacket(pct: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = FWK_MAGIC[0];
  buf[1] = FWK_MAGIC[1];
  buf[2] = CMD_BRIGHTNESS;
  buf[3] = Math.max(0, Math.min(100, Math.round(pct)));
  return buf;
}

function buildBwPacket(packed: Uint8Array): Uint8Array {
  if (packed.length !== 39)
    throw new RangeError(`BW payload must be 39 bytes, got ${packed.length}`);
  const buf = new Uint8Array(42);
  buf[0] = FWK_MAGIC[0];
  buf[1] = FWK_MAGIC[1];
  buf[2] = CMD_DISPLAY_BW;
  buf.set(packed, 3);
  return buf;
}

function buildGrayPackets(frame: Frame): Uint8Array[] {
  const packets: Uint8Array[] = [];
  for (let col = 0; col < FRAME_COLS; col++) {
    const pkt = new Uint8Array(38);
    pkt[0] = FWK_MAGIC[0]; pkt[1] = FWK_MAGIC[1];
    pkt[2] = CMD_SEND_COL; pkt[3] = col;
    for (let row = 0; row < FRAME_ROWS; row++) {
      pkt[4 + row] = frame[col * FRAME_ROWS + row] ?? 0;
    }
    packets.push(pkt);
  }
  packets.push(Uint8Array.from([FWK_MAGIC[0], FWK_MAGIC[1], CMD_COMMIT_COLS]));
  return packets;
}

export interface MatrixTransport {
  frameBw(packed: Uint8Array, devicePath: string): Promise<void>;
  frameGray(frame: Frame, devicePath: string): Promise<void>;
  brightness(devicePath: string, pct: number): Promise<void>;
  release(devicePath: string): Promise<void>;
  close(): Promise<void>;
}

function runSpawn(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { shell: false, stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (exit ${code ?? '?'}): ${stderr.trim()}`));
    });
    proc.on('error', reject);
  });
}

function writePort(port: SerialPort, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    // If the binding emits an out-of-band 'error' (EIO on unplug) instead of
    // failing the write/drain callback, the permanent swallow listener in
    // openPort would eat it and this promise would hang forever — stalling the
    // animation loop (or a one-shot BinaryTransport write). Race the callbacks
    // against a one-shot error rejection so the write always settles (L27).
    const onError = (err: Error) => settle(err);
    const settle = (err?: Error | null) => {
      if (settled) return;
      settled = true;
      port.removeListener('error', onError);
      if (err) reject(err); else resolve();
    };
    port.once('error', onError);
    port.write(Buffer.from(data), (writeErr) => {
      if (writeErr) return settle(writeErr);
      port.drain((drainErr) => settle(drainErr));
    });
  });
}

function openPort(devicePath: string): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path: devicePath, baudRate: 921600, autoOpen: false });
    // Keep a permanent 'error' listener so an asynchronous device error (EIO on
    // unplug, EBADF after close) is never re-emitted as an uncaughtException.
    // Write/drain failures still surface through their callbacks; this only
    // catches out-of-band stream errors. SerialTransport's getPort() adds a
    // second listener that also evicts the dead port from internal state (so a
    // SerialTransport port has two listeners — both intentional); BinaryTransport
    // relies on this one alone.
    port.on('error', () => { /* swallowed — failures surface via writePort callbacks */ });
    port.open((err) => (err ? reject(err) : resolve(port)));
  });
}

// Errors whose code unambiguously means the serial device is gone — the port
// must be evicted and re-opened rather than reused. Transient errors (ETIMEDOUT,
// EAGAIN, EBUSY) and socket-class codes (EPIPE/ECONNRESET, which can fire on a
// momentary serial overrun) are excluded so a brief glitch doesn't close the
// port and DTR-reset the module display.
const DISCONNECT_CODES = new Set(['EIO', 'ENXIO', 'ENODEV', 'EBADF', 'EUNATCH']);
function isDisconnectError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code !== undefined && DISCONNECT_CODES.has(code);
}

function closePort(port: SerialPort): Promise<void> {
  return new Promise((resolve) => {
    port.close((err) => {
      if (err && (err as NodeJS.ErrnoException).code !== 'EBADF') {
        console.warn('transport: close warning:', err.message);
      }
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// BinaryTransport — one-shot per command, no persistent port hold.
// Frame writes use a single open→write→close cycle per frame.
// ---------------------------------------------------------------------------
export class BinaryTransport implements MatrixTransport {
  constructor(private readonly bin: string) {}

  async frameBw(packed: Uint8Array, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await openPort(devicePath);
    try {
      await writePort(port, buildBwPacket(packed));
    } finally {
      await closePort(port);
    }
  }

  async frameGray(frame: Frame, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await openPort(devicePath);
    try {
      for (const pkt of buildGrayPackets(frame)) {
        await writePort(port, pkt);
      }
    } finally {
      await closePort(port);
    }
  }

  async command(devicePath: string, subcommand: string, args: string[]): Promise<void> {
    validatePath(devicePath);
    await runSpawn(this.bin, ['--serial-dev', devicePath, subcommand, ...args]);
  }

  async brightness(devicePath: string, pct: number): Promise<void> {
    await this.command(devicePath, 'led-matrix', ['--brightness', String(Math.round(pct))]);
  }

  async release(_devicePath: string): Promise<void> {}

  async close(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// SerialTransport — holds port open across animation frames.
// All writes to a given device are serialized through a promise queue.
// liveFrameBw/liveFrameGray use latest-wins semantics: a new frame replaces
// any pending (not yet started) write rather than queueing behind it.
// ---------------------------------------------------------------------------
// Per-device live-write state. `dead` is set when the port is evicted
// (disconnect) or released; a running runLive loop holds this object by
// reference and stops on the next check.
interface LiveState {
  next: (() => Promise<void>) | null;
  writing: boolean;
  dead: boolean;
}

// Upper bound on how long release() waits for an in-flight live write to unwind
// before closing the port anyway — guards against a wedged driver whose write
// callback never fires (which would otherwise hang shutdown).
const LIVE_DRAIN_TIMEOUT_MS = 5000;

export class SerialTransport implements MatrixTransport {
  private readonly ports = new Map<string, SerialPort>();
  private readonly opening = new Map<string, Promise<SerialPort>>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly live = new Map<string, LiveState>();

  // Remove a device from every per-port map. Shared by evict() and release().
  private clearPortMaps(devicePath: string): void {
    this.ports.delete(devicePath);
    this.opening.delete(devicePath);
    this.queues.delete(devicePath);
    this.live.delete(devicePath);
  }

  private enqueue(devicePath: string, port: SerialPort, op: () => Promise<void>): Promise<void> {
    const tail = (this.queues.get(devicePath) ?? Promise.resolve()).then(op);
    // Keep queue moving even if op rejects
    this.queues.set(devicePath, tail.catch(() => {}));
    // Evict on a disconnect-class failure so the next write re-opens the port.
    tail.catch((err) => { if (isDisconnectError(err)) void this.evict(devicePath, port); });
    return tail;
  }

  private async runLive(devicePath: string, port: SerialPort, op: () => Promise<void>): Promise<void> {
    let state = this.live.get(devicePath);
    if (!state) { state = { next: null, writing: false, dead: false }; this.live.set(devicePath, state); }
    if (state.dead) return;
    if (state.writing) { state.next = op; return; }
    state.writing = true;
    // Drain any in-flight enqueue writes (e.g. last animation frame) before
    // starting live writes, so the two paths don't interleave on the serial port.
    await (this.queues.get(devicePath) ?? Promise.resolve()).catch(() => {});
    // A newer op may have arrived while draining — use it if so.
    let cur = state.next ?? op;
    while (!state.dead) {
      state.next = null;
      await cur().catch((err) => {
        // A disconnect-class failure: stop this loop and evict the port. Set
        // `dead` directly too, so the loop halts even if evict() no-ops because
        // a newer port already replaced this one.
        if (isDisconnectError(err)) { state.dead = true; void this.evict(devicePath, port); }
      });
      if (state.dead || !state.next) break;
      cur = state.next;
    }
    state.writing = false;
  }

  async liveFrameBw(packed: Uint8Array, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.runLive(devicePath, port, () => writePort(port, buildBwPacket(packed)));
  }

  async liveFrameGray(frame: Frame, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.runLive(devicePath, port, async () => {
      for (const pkt of buildGrayPackets(frame)) {
        await writePort(port, pkt);
      }
    });
  }

  private getPort(devicePath: string): Promise<SerialPort> {
    const cached = this.ports.get(devicePath);
    if (cached) return Promise.resolve(cached);
    const inflight = this.opening.get(devicePath);
    if (inflight) return inflight;
    const promise = openPort(devicePath).then(port => {
      // Evict-on-error: a device error (unplug) closes and removes the port so
      // the next getPort re-opens it, instead of caching a dead port forever.
      port.on('error', () => { void this.evict(devicePath, port); });
      this.ports.set(devicePath, port);
      this.queues.set(devicePath, Promise.resolve());
      this.opening.delete(devicePath);
      return port;
    }, err => {
      this.opening.delete(devicePath);
      throw err;
    });
    this.opening.set(devicePath, promise);
    return promise;
  }

  // Remove a dead port from all internal state and close it. Port-scoped so a
  // stale handler can't evict a newer port that already replaced this one. A
  // running runLive loop observes `state.dead` (held by reference) and unwinds.
  private evict(devicePath: string, port: SerialPort): Promise<void> {
    if (this.ports.get(devicePath) !== port) return Promise.resolve();
    const state = this.live.get(devicePath);
    if (state) { state.dead = true; state.next = null; }
    this.clearPortMaps(devicePath);
    return closePort(port);
  }

  async frameBw(packed: Uint8Array, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.enqueue(devicePath, port, () => writePort(port, buildBwPacket(packed)));
  }

  async frameGray(frame: Frame, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.enqueue(devicePath, port, async () => {
      for (const pkt of buildGrayPackets(frame)) {
        await writePort(port, pkt);
      }
    });
  }

  async brightness(devicePath: string, pct: number): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.enqueue(devicePath, port, () => writePort(port, buildBrightnessPacket(pct)));
  }

  async release(devicePath: string): Promise<void> {
    // Stop the live loop first so it can't write to a port we're about to close.
    const state = this.live.get(devicePath);
    if (state) { state.dead = true; state.next = null; }
    // Let queued writes finish, then wait for an in-flight live write to observe
    // `dead` and unwind before closing the port — but cap the wait: a wedged
    // driver can leave a write callback unfired, and we must not hang shutdown.
    // After the deadline, close anyway (closePort tolerates EBADF).
    await (this.queues.get(devicePath) ?? Promise.resolve()).catch(() => {});
    const deadline = Date.now() + LIVE_DRAIN_TIMEOUT_MS;
    while (this.live.get(devicePath)?.writing && Date.now() < deadline) {
      await new Promise<void>(r => setTimeout(r, 5));
    }
    const port = this.ports.get(devicePath);
    this.clearPortMaps(devicePath);
    if (port) await closePort(port);
  }

  async close(): Promise<void> {
    this.opening.clear();
    const paths = new Set([...this.ports.keys(), ...this.live.keys()]);
    await Promise.all([...paths].map((p) => this.release(p)));
  }
}
