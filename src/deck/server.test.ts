import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startDeckServer } from './server.js';
import type { DeckServer } from './server.js';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => { body += c.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    }).on('error', reject);
  });
}

async function getWithHeaders(url: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => { body += c.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    }).on('error', reject);
  });
}

async function post(url: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let out = '';
      res.on('data', (c: Buffer) => { out += c.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function del(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'DELETE',
    }, (res) => {
      let out = '';
      res.on('data', (c: Buffer) => { out += c.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function put(url: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let out = '';
      res.on('data', (c: Buffer) => { out += c.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('deck server', () => {
  let server: DeckServer;
  let configDir: string;

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-deck-test-'));
    server = await startDeckServer({ port: 0, configDir });
  });

  afterEach(async () => {
    await server.stop();
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('GET /api/health returns {ok:true,version:1}', async () => {
    const { status, body } = await get(`${server.url}/api/health`);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ ok: true, version: 1 });
  });

  it('survives a client that disconnects mid-message (C3)', async () => {
    const { WebSocket } = await import('ws');
    const wsUrl = server.url.replace('http', 'ws') + '/ws';
    const client = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      client.on('open', () => resolve());
      client.on('error', reject);
    });
    // Trigger an async handler that issues a deferred send, then abruptly drop
    // the socket so the send would land after close. With the safeSend guard +
    // per-connection 'error' listener, this must not crash the server (an
    // unhandled ws 'error' would surface as an uncaughtException here).
    client.send(JSON.stringify({ type: 'hud-presets-get' }));
    client.terminate();
    await new Promise<void>(r => setTimeout(r, 50));
    const { status } = await get(`${server.url}/api/health`);
    expect(status).toBe(200);
  });

  it('returns 500 instead of crashing when a route rejects uncaught (H12)', async () => {
    // Root ignores file permissions, so the unwritable-dir trigger won't fire.
    if (typeof process.getuid === 'function' && process.getuid() === 0) return;
    // Make the config dir unwritable so /api/assets' mkdir rejects uncaught and
    // hits the createServer wrapper (which must answer 500, not die).
    await fs.chmod(configDir, 0o500);
    try {
      const { status } = await get(`${server.url}/api/assets`);
      expect(status).toBe(500);
      // The server is still serving other requests.
      const health = await get(`${server.url}/api/health`);
      expect(health.status).toBe(200);
    } finally {
      await fs.chmod(configDir, 0o700);
    }
  });

  it('stops cleanly', async () => {
    await server.stop();
    // second stop is a no-op test — just verify no throw
    server = await startDeckServer({ port: 0, configDir });
  });

  it('PUT /api/prefs persists and GET /api/prefs returns it', async () => {
    const { status } = await put(`${server.url}/api/prefs`, JSON.stringify({ activeColor: 200 }));
    expect(status).toBe(200);
    const { body } = await get(`${server.url}/api/prefs`);
    expect(JSON.parse(body)).toMatchObject({ activeColor: 200 });
  });

  it('PUT /api/prefs with invalid data returns 400', async () => {
    const { status } = await put(`${server.url}/api/prefs`, JSON.stringify({ activeColor: 999 }));
    expect(status).toBe(400);
  });

  it('GET unknown path returns 404 when no index.html', async () => {
    const { status } = await get(`${server.url}/no-such-file.js`);
    expect(status).toBe(404);
  });

  it('GET /auth/twitch/callback CSP allows the token POST and uses a hex nonce', async () => {
    const { status, body, headers } = await getWithHeaders(`${server.url}/auth/twitch/callback`);
    expect(status).toBe(200);
    const csp = String(headers['content-security-policy']);
    // Lock down the restrictive base policy against accidental future widening.
    expect(csp).toContain("default-src 'none'");
    // The inline script POSTs the token to /api/twitch/save-token — connect-src must permit it.
    expect(csp).toContain("connect-src 'self'");
    // Nonce must be hex (no '/', '+', '=') so it matches the script tag across browsers.
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? '';
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(body).toContain(`<script nonce="${nonce}">`);
  });
});

const pixels = Buffer.alloc(9 * 34).toString('base64');
const validProject = {
  format: 'dark-matrix',
  version: 1,
  width: 9,
  height: 34,
  mode: 'bw',
  loop: true,
  frames: [{ delayMs: 100, pixels }],
};

describe('deck server — library API', () => {
  let server: DeckServer;
  let configDir: string;

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-library-test-'));
    // Isolate from shipped built-ins so these tests see only user files.
    server = await startDeckServer({ port: 0, configDir, builtinsDir: path.join(configDir, '__no_builtins__') });
  });

  afterEach(async () => {
    await server.stop();
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('GET /api/library returns empty list when no files exist', async () => {
    const { status, body } = await get(`${server.url}/api/library`);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({ ok: true, files: [] });
  });

  it('POST /api/library saves a valid project', async () => {
    const { status, body } = await post(`${server.url}/api/library`, JSON.stringify({ name: 'test_anim', project: validProject }));
    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ ok: true, name: 'test_anim' });
    const libPath = path.join(configDir, 'library', 'test_anim.dmx.json');
    const saved = JSON.parse(await fs.readFile(libPath, 'utf-8'));
    expect(saved.format).toBe('dark-matrix');
  });

  it('GET /api/library lists the saved file', async () => {
    await post(`${server.url}/api/library`, JSON.stringify({ name: 'my_anim', project: validProject }));
    const { body } = await get(`${server.url}/api/library`);
    const data = JSON.parse(body) as { ok: boolean; files: { name: string }[] };
    expect(data.files.map(f => f.name)).toContain('my_anim');
  });

  it('GET /api/library/:name returns the saved project', async () => {
    await post(`${server.url}/api/library`, JSON.stringify({ name: 'get_test', project: validProject }));
    const { status, body } = await get(`${server.url}/api/library/get_test`);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ format: 'dark-matrix' });
  });

  it('GET /api/library/:name returns 404 for missing file', async () => {
    const { status } = await get(`${server.url}/api/library/nonexistent`);
    expect(status).toBe(404);
  });

  it('POST /api/library with copy:true creates a _copy variant', async () => {
    await post(`${server.url}/api/library`, JSON.stringify({ name: 'base', project: validProject }));
    const { status, body } = await post(`${server.url}/api/library`, JSON.stringify({ name: 'base', project: validProject, copy: true }));
    expect(status).toBe(200);
    const data = JSON.parse(body) as { ok: boolean; name: string };
    expect(data.name).toBe('base_copy');
    const copyPath = path.join(configDir, 'library', 'base_copy.dmx.json');
    await expect(fs.access(copyPath)).resolves.toBeUndefined();
  });

  it('PUT /api/library/:name/rename renames the file', async () => {
    await post(`${server.url}/api/library`, JSON.stringify({ name: 'old_name', project: validProject }));
    const { status, body } = await put(`${server.url}/api/library/old_name/rename`, JSON.stringify({ newName: 'new_name' }));
    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ ok: true, name: 'new_name' });
    await expect(fs.access(path.join(configDir, 'library', 'new_name.dmx.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(configDir, 'library', 'old_name.dmx.json'))).rejects.toThrow();
  });

  it('DELETE /api/library/:name removes the file', async () => {
    await post(`${server.url}/api/library`, JSON.stringify({ name: 'to_delete', project: validProject }));
    const { status } = await del(`${server.url}/api/library/to_delete`);
    expect(status).toBe(200);
    await expect(fs.access(path.join(configDir, 'library', 'to_delete.dmx.json'))).rejects.toThrow();
  });

  it('POST /api/library with invalid name returns 400', async () => {
    // name contains characters not in [a-zA-Z0-9_ -]
    const { status } = await post(`${server.url}/api/library`, JSON.stringify({ name: 'bad<name>', project: validProject }));
    expect(status).toBe(400);
  });

  it('POST /api/library with invalid project returns 400', async () => {
    const { status } = await post(`${server.url}/api/library`, JSON.stringify({ name: 'bad_proj', project: { bad: 'data' } }));
    expect(status).toBe(400);
  });

  it('POST /api/library overwrites existing file on plain save', async () => {
    await post(`${server.url}/api/library`, JSON.stringify({ name: 'overwrite_me', project: validProject }));
    const { status } = await post(`${server.url}/api/library`, JSON.stringify({ name: 'overwrite_me', project: validProject }));
    expect(status).toBe(200);
    const { body } = await get(`${server.url}/api/library`);
    const data = JSON.parse(body) as { files: { name: string }[] };
    expect(data.files.filter(f => f.name === 'overwrite_me')).toHaveLength(1);
  });
});

describe('deck server — built-in designs', () => {
  let server: DeckServer;
  let configDir: string;
  let builtinsDir: string;

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-builtin-cfg-'));
    builtinsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-builtin-src-'));
    await fs.writeFile(path.join(builtinsDir, 'starter.dmx.json'), JSON.stringify(validProject));
    server = await startDeckServer({ port: 0, configDir, builtinsDir });
  });

  afterEach(async () => {
    await server.stop();
    await fs.rm(configDir, { recursive: true, force: true });
    await fs.rm(builtinsDir, { recursive: true, force: true });
  });

  it('GET /api/library lists built-ins flagged builtin:true', async () => {
    const { body } = await get(`${server.url}/api/library`);
    const data = JSON.parse(body) as { files: { name: string; builtin?: boolean }[] };
    expect(data.files).toContainEqual({ name: 'starter', builtin: true });
  });

  it('GET /api/library/:name serves a built-in project', async () => {
    const { status, body } = await get(`${server.url}/api/library/starter`);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ format: 'dark-matrix', width: 9 });
  });

  it('GET /api/assets includes built-ins flagged builtin:true', async () => {
    const { body } = await get(`${server.url}/api/assets`);
    const data = JSON.parse(body) as { assets: { name: string; builtin?: boolean }[] };
    expect(data.assets.find(a => a.name === 'starter.dmx.json')?.builtin).toBe(true);
  });

  it('DELETE /api/library/:name rejects a built-in as read-only', async () => {
    const { status } = await del(`${server.url}/api/library/starter`);
    expect(status).toBe(403);
  });

  it('PUT /api/library/:name/rename rejects a built-in as read-only', async () => {
    const { status } = await put(`${server.url}/api/library/starter/rename`, JSON.stringify({ newName: 'renamed' }));
    expect(status).toBe(403);
  });

  it('DELETE /api/assets/:name rejects a built-in as read-only', async () => {
    const { status } = await del(`${server.url}/api/assets/starter.dmx.json`);
    expect(status).toBe(403);
  });

  it('POST /api/assets/copy duplicates a built-in into the user library', async () => {
    const { status, body } = await post(`${server.url}/api/assets/copy`, JSON.stringify({ name: 'starter.dmx.json' }));
    expect(status).toBe(200);
    const { name } = JSON.parse(body) as { name: string };
    expect(name).toBe('starter_2.dmx.json');
    await expect(fs.access(path.join(configDir, 'library', name))).resolves.toBeUndefined();
  });

  it('a user file shadows a built-in of the same name', async () => {
    await post(`${server.url}/api/library`, JSON.stringify({ name: 'starter', project: validProject }));
    const { body } = await get(`${server.url}/api/library`);
    const data = JSON.parse(body) as { files: { name: string; builtin?: boolean }[] };
    const matches = data.files.filter(f => f.name === 'starter');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.builtin).toBeUndefined();
  });
});
