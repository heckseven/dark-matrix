import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';
import { loadConfig, writeDefaultConfig, watchConfig } from '../lib/config.js';
import type { Config } from '../lib/config.js';

export function socketPath(): string {
  return process.env['DARK_MATRIX_SOCKET']
    ?? `/run/user/${process.getuid!()}/dark-matrix.sock`;
}

export async function startDaemon(): Promise<() => Promise<void>> {
  let currentConfig: Config;
  try {
    currentConfig = await loadConfig();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeDefaultConfig();
      currentConfig = await loadConfig();
    } else {
      throw err;
    }
  }

  let currentBrightness = 0;

  const path = socketPath();
  const server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg: { cmd: string };
        try {
          msg = JSON.parse(line) as { cmd: string };
        } catch {
          socket.write(JSON.stringify({ ok: false, error: 'invalid JSON' }) + '\n');
          continue;
        }
        switch (msg.cmd) {
          case 'ping':
            socket.write(JSON.stringify({ ok: true, pong: true }) + '\n');
            break;
          case 'brightness':
            socket.write(JSON.stringify({ ok: true, value: currentBrightness }) + '\n');
            break;
          case 'reload':
            process.kill(process.pid, 'SIGHUP');
            socket.write(JSON.stringify({ ok: true }) + '\n');
            break;
          default:
            socket.write(JSON.stringify({ ok: false, error: 'unknown command' }) + '\n');
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(path, resolve);
    server.once('error', reject);
  });

  await fs.chmod(path, 0o600);

  const disposeWatch = watchConfig((cfg) => {
    currentConfig = cfg;
  });

  process.stderr.write(`dark-matrix daemon started, socket: ${path}\n`);

  const cleanup = async () => {
    disposeWatch();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { await fs.unlink(path); } catch { /* already gone */ }
  };

  const sigterm = async () => { await cleanup(); process.exit(0); };
  const uncaught = async (err: unknown) => { await cleanup(); throw err; };

  process.once('SIGTERM', sigterm);
  process.once('uncaughtException', uncaught);

  return async () => {
    process.off('SIGTERM', sigterm);
    process.off('uncaughtException', uncaught);
    await cleanup();
  };
}

// Run when invoked directly
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  startDaemon().catch((err) => {
    process.stderr.write(`dark-matrix: fatal: ${err}\n`);
    process.exit(1);
  });
}
