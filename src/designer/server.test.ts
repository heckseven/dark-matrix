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
