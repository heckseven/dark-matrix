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
