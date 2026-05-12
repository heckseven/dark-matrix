import { spawn } from 'node:child_process';
import { SerialPort } from 'serialport';
import type { Frame } from './frame.js';

const FRAME_ROWS = 34;
const FRAME_COLS = 9;

const FWK_MAGIC = [0x32, 0xac] as const;
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

// 9 column packets (38 bytes each) + 1 commit packet (3 bytes) = 345 bytes total,
// written as a single buffer so the serial port drains once instead of 10 times.
function buildGrayFrame(frame: Frame): Uint8Array {
  const buf = new Uint8Array(FRAME_COLS * 38 + 3);
  let o = 0;
  for (let col = 0; col < FRAME_COLS; col++) {
    buf[o++] = FWK_MAGIC[0]; buf[o++] = FWK_MAGIC[1];
    buf[o++] = CMD_SEND_COL; buf[o++] = col;
    for (let row = 0; row < FRAME_ROWS; row++) buf[o++] = frame[col * FRAME_ROWS + row] ?? 0;
  }
  buf[o++] = FWK_MAGIC[0]; buf[o++] = FWK_MAGIC[1]; buf[o++] = CMD_COMMIT_COLS;
  return buf;
}

export interface MatrixTransport {
  frameBw(packed: Uint8Array, devicePath: string): Promise<void>;
  frameGray(frame: Frame, devicePath: string): Promise<void>;
  command(devicePath: string, subcommand: string, args: string[]): Promise<void>;
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
    port.write(Buffer.from(data), (writeErr) => {
      if (writeErr) return reject(writeErr);
      port.drain((drainErr) => (drainErr ? reject(drainErr) : resolve()));
    });
  });
}

function openPort(devicePath: string): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path: devicePath, baudRate: 921600, autoOpen: false });
    port.open((err) => (err ? reject(err) : resolve(port)));
  });
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
      await writePort(port, buildGrayFrame(frame));
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
export class SerialTransport implements MatrixTransport {
  private readonly ports = new Map<string, SerialPort>();
  private readonly opening = new Map<string, Promise<SerialPort>>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly live = new Map<string, { next: (() => Promise<void>) | null; writing: boolean }>();

  private enqueue(devicePath: string, op: () => Promise<void>): Promise<void> {
    const tail = (this.queues.get(devicePath) ?? Promise.resolve()).then(op);
    // Keep queue moving even if op rejects
    this.queues.set(devicePath, tail.catch(() => {}));
    return tail;
  }

  private async runLive(devicePath: string, op: () => Promise<void>): Promise<void> {
    let state = this.live.get(devicePath);
    if (!state) { state = { next: null, writing: false }; this.live.set(devicePath, state); }
    if (state.writing) { state.next = op; return; }
    state.writing = true;
    // Drain any in-flight enqueue writes (e.g. last animation frame) before
    // starting live writes, so the two paths don't interleave on the serial port.
    await (this.queues.get(devicePath) ?? Promise.resolve()).catch(() => {});
    // A newer op may have arrived while draining — use it if so.
    let cur = state.next ?? op;
    while (true) {
      state.next = null;
      await cur().catch(() => {});
      if (!state.next) break;
      cur = state.next;
    }
    state.writing = false;
  }

  async liveFrameBw(packed: Uint8Array, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.runLive(devicePath, () => writePort(port, buildBwPacket(packed)));
  }

  async liveFrameGray(frame: Frame, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.runLive(devicePath, () => writePort(port, buildGrayFrame(frame)));
  }

  private getPort(devicePath: string): Promise<SerialPort> {
    const cached = this.ports.get(devicePath);
    if (cached) return Promise.resolve(cached);
    const inflight = this.opening.get(devicePath);
    if (inflight) return inflight;
    const promise = openPort(devicePath).then(port => {
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

  async frameBw(packed: Uint8Array, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.enqueue(devicePath, () => writePort(port, buildBwPacket(packed)));
  }

  async frameGray(frame: Frame, devicePath: string): Promise<void> {
    validatePath(devicePath);
    const port = await this.getPort(devicePath);
    return this.enqueue(devicePath, () => writePort(port, buildGrayFrame(frame)));
  }

  async command(devicePath: string, subcommand: string, args: string[]): Promise<void> {
    validatePath(devicePath);
    await runSpawn('inputmodule-control', ['--serial-dev', devicePath, subcommand, ...args]);
  }

  async brightness(devicePath: string, pct: number): Promise<void> {
    await this.command(devicePath, 'led-matrix', ['--brightness', String(Math.round(pct))]);
  }

  async release(devicePath: string): Promise<void> {
    const port = this.ports.get(devicePath);
    if (!port) return;
    await (this.queues.get(devicePath) ?? Promise.resolve()).catch(() => {});
    await closePort(port);
    this.ports.delete(devicePath);
    this.queues.delete(devicePath);
  }

  async close(): Promise<void> {
    this.opening.clear();
    await Promise.all([...this.ports.keys()].map((p) => this.release(p)));
  }
}
