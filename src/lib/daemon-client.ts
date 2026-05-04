import net from 'node:net';
import process from 'node:process';

export function daemonSocketPath(): string {
  return process.env['DARK_MATRIX_SOCKET']
    ?? `/run/user/${process.getuid!()}/dark-matrix.sock`;
}

export function sendToDaemon(cmd: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(daemonSocketPath());
    let buf = '';
    sock.on('connect', () => sock.write(JSON.stringify(cmd) + '\n'));
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      if (buf.includes('\n')) sock.end();
    });
    sock.on('end', () => {
      try { resolve(JSON.parse(buf.trim()) as Record<string, unknown>); }
      catch { reject(new Error(`daemon response parse error: ${buf}`)); }
    });
    sock.on('error', (err) => reject(new Error(`Cannot reach daemon: ${(err as NodeJS.ErrnoException).message}`)));
  });
}

// Persistent connection for high-frequency fire-and-forget commands (e.g. preview frames).
// Reconnects automatically on close/error. Queued writes drain in order.
export class PersistentDaemonClient {
  private sock: net.Socket | null = null;
  private queue: string[] = [];
  private connecting = false;

  constructor(private readonly socketPath = daemonSocketPath()) {}

  send(cmd: Record<string, unknown>): void {
    this.queue.push(JSON.stringify(cmd) + '\n');
    this.drain();
  }

  private drain(): void {
    if (!this.sock || this.connecting) { this.connect(); return; }
    while (this.queue.length > 0) {
      this.sock.write(this.queue.shift()!);
    }
  }

  private connect(): void {
    if (this.connecting || this.sock) return;
    this.connecting = true;
    const sock = net.createConnection(this.socketPath);
    sock.on('connect', () => {
      this.connecting = false;
      this.sock = sock;
      this.drain();
    });
    // Consume and discard response lines — we don't need acks for preview frames
    sock.on('data', () => {});
    sock.on('close', () => { this.sock = null; });
    sock.on('error', () => { this.connecting = false; this.sock = null; });
  }

  destroy(): void {
    this.queue = [];
    this.sock?.destroy();
    this.sock = null;
  }
}
