import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startDesignerServer } from './server.js';
import type { DesignerServer } from './server.js';
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

describe('designer server', () => {
  let server: DesignerServer;
  let configDir: string;

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-designer-test-'));
    server = await startDesignerServer({ port: 0, configDir });
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

  it('stops cleanly', async () => {
    await server.stop();
    // second stop is a no-op test — just verify no throw
    server = await startDesignerServer({ port: 0, configDir });
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
});

const pixels = Buffer.alloc(9 * 34).toString('base64');
const validProject = {
  format: 'dark-matrix-designer',
  version: 1,
  width: 9,
  height: 34,
  mode: 'bw',
  loop: true,
  frames: [{ delayMs: 100, pixels }],
};

describe('designer server — library API', () => {
  let server: DesignerServer;
  let configDir: string;

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-library-test-'));
    server = await startDesignerServer({ port: 0, configDir });
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
    expect(saved.format).toBe('dark-matrix-designer');
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
    expect(JSON.parse(body)).toMatchObject({ format: 'dark-matrix-designer' });
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
