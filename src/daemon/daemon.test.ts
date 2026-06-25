import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startDaemon } from './index.js';
import { DEFAULT_CONFIG } from '../lib/config.js';

function tmpSocket(): string {
  return path.join(os.tmpdir(), `dm-test-${Math.random().toString(36).slice(2)}.sock`);
}

async function withDaemon(fn: (dispose: () => Promise<void>) => Promise<void>) {
  const dispose = await startDaemon();
  try {
    await fn(dispose);
  } finally {
    await dispose();
  }
}

function send(socketPath: string, msg: object): Promise<object> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(socketPath);
    let buf = '';
    sock.on('data', (chunk) => { buf += chunk.toString(); });
    sock.on('error', reject);
    sock.on('connect', () => sock.write(JSON.stringify(msg) + '\n'));
    sock.on('end', () => {
      try { resolve(JSON.parse(buf.trim())); } catch { reject(new Error(`bad JSON: ${buf}`)); }
    });
    // close after first response line
    const orig = sock.emit.bind(sock);
    sock.on('data', () => {
      if (buf.includes('\n')) sock.end();
    });
  });
}

async function writeConfig(p: string) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(DEFAULT_CONFIG), 'utf8');
}

describe('daemon', () => {
  let sockPath: string;
  let cfgPath: string;

  beforeEach(async () => {
    sockPath = tmpSocket();
    cfgPath = path.join(os.tmpdir(), `dm-cfg-${Math.random().toString(36).slice(2)}.json`);
    process.env['DARK_MATRIX_SOCKET'] = sockPath;
    process.env['DARK_MATRIX_CONFIG_PATH'] = cfgPath;
    await writeConfig(cfgPath);
  });

  afterEach(async () => {
    delete process.env['DARK_MATRIX_SOCKET'];
    delete process.env['DARK_MATRIX_CONFIG_PATH'];
    try { await fs.unlink(cfgPath); } catch { /* ok */ }
  });

  it('server listens — socket file exists after startDaemon', async () => {
    await withDaemon(async () => {
      const stat = await fs.stat(sockPath);
      expect(stat.isSocket()).toBe(true);
    });
  });

  it('recovers from a corrupt config: backs it up and boots with defaults (H5)', async () => {
    await fs.writeFile(cfgPath, '{ corrupt not json');
    await withDaemon(async () => {
      // Booted despite the corrupt config instead of exiting — and actually serves.
      const stat = await fs.stat(sockPath);
      expect(stat.isSocket()).toBe(true);
      const res = await send(sockPath, { cmd: 'ping' });
      expect(res).toMatchObject({ ok: true, pong: true });
      // The bad file was preserved for inspection.
      expect(await fs.readFile(cfgPath + '.bak', 'utf8')).toBe('{ corrupt not json');
      // A fresh, valid default config was written; uncalibrated → welcome screen.
      const fresh = JSON.parse(await fs.readFile(cfgPath, 'utf8')) as { uncalibrated?: boolean };
      expect(fresh.uncalibrated).toBe(true);
    });
    await fs.unlink(cfgPath + '.bak').catch(() => {});
  });

  it('drops a connection that floods the IPC buffer, and stays alive (H6)', async () => {
    await withDaemon(async () => {
      // Stream >1MB of unframed, newline-less bytes (not JSON, not HTTP).
      await new Promise<void>((resolve, reject) => {
        const sock = net.createConnection(sockPath);
        sock.on('connect', () => sock.write('x'.repeat(1_100_000)));
        sock.on('close', () => resolve());   // daemon destroyed our connection
        sock.on('error', () => resolve());    // ECONNRESET on destroy is also fine
        setTimeout(() => reject(new Error('flooding connection was not dropped')), 3000);
      });
      // The daemon survived and still serves a fresh client.
      const res = await send(sockPath, { cmd: 'ping' });
      expect(res).toMatchObject({ ok: true, pong: true });
    });
  });

  it('does not leak fatal-error listeners across restarts (M13)', async () => {
    const beforeUncaught = process.listenerCount('uncaughtException');
    const beforeRejection = process.listenerCount('unhandledRejection');
    const dispose = await startDaemon();
    await dispose();
    // The disposer's process.off removes both handlers despite the .on registration.
    expect(process.listenerCount('uncaughtException')).toBe(beforeUncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(beforeRejection);
  });

  it('ping returns { ok: true, pong: true }', async () => {
    await withDaemon(async () => {
      const res = await send(sockPath, { cmd: 'ping' });
      expect(res).toMatchObject({ ok: true, pong: true });
    });
  });

  it('brightness returns { ok: true, value: 0 }', async () => {
    await fs.writeFile(cfgPath, JSON.stringify({
      ...DEFAULT_CONFIG,
      brightness: { ...DEFAULT_CONFIG.brightness, mode: 'manual', manual_value: 0 },
    }));
    await withDaemon(async () => {
      const res = await send(sockPath, { cmd: 'brightness' });
      expect(res).toEqual({ ok: true, value: 0 });
    });
  });

  it('socket file is chmod 0600 after listen', async () => {
    await withDaemon(async () => {
      const stat = await fs.stat(sockPath);
      expect(stat.mode & 0o777).toBe(0o600);
    });
  });

  it('disposer closes server and unlinks socket', async () => {
    const dispose = await startDaemon();
    await dispose();
    await expect(fs.stat(sockPath)).rejects.toThrow();
  });

  it('release command returns { ok: true }', async () => {
    await withDaemon(async () => {
      const res = await send(sockPath, { cmd: 'release' });
      expect(res).toMatchObject({ ok: true });
    });
  });

  it('unknown command returns { ok: false }', async () => {
    await withDaemon(async () => {
      const res = await send(sockPath, { cmd: 'nope' });
      expect(res).toMatchObject({ ok: false });
    });
  });

  it('frame command with valid left base64 responds { ok: true }', async () => {
    await withDaemon(async () => {
      const frame = Buffer.alloc(306, 0);
      const res = await send(sockPath, { cmd: 'frame', left: frame.toString('base64'), mode: 'bw' });
      expect(res).toMatchObject({ ok: true });
    });
  });

  it('frame command with invalid base64 length responds { ok: false }', async () => {
    await withDaemon(async () => {
      const frame = Buffer.alloc(10, 0);
      const res = await send(sockPath, { cmd: 'frame', left: frame.toString('base64'), mode: 'bw' });
      expect(res).toMatchObject({ ok: false, error: 'invalid frame length' });
    });
  });

  it('frame-stop command responds { ok: true }', async () => {
    await withDaemon(async () => {
      const res = await send(sockPath, { cmd: 'frame-stop' });
      expect(res).toMatchObject({ ok: true });
    });
  });

  it('HTTP POST /hook with valid Claude payload returns 200 and parses event', async () => {
    await withDaemon(async () => {
      const body = JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_response: {},
        session_id: 'test-session',
      });
      const httpReq = [
        `POST /hook HTTP/1.1`,
        `Host: localhost`,
        `Content-Type: application/json`,
        `Content-Length: ${Buffer.byteLength(body)}`,
        '',
        body,
      ].join('\r\n');

      const response = await new Promise<string>((resolve, reject) => {
        const sock = net.createConnection(sockPath);
        let buf = '';
        sock.on('connect', () => sock.write(httpReq));
        sock.on('data', (chunk) => {
          buf += chunk.toString();
          if (buf.includes('\r\n\r\n')) { sock.end(); }
        });
        sock.on('end', () => resolve(buf));
        sock.on('error', reject);
      });

      expect(response).toMatch(/HTTP\/1\.1 200/);
    });
  });
});
