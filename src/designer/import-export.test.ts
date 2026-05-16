import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startDesignerServer } from './server.js';
import type { DesignerServer } from './server.js';
import { serializeProject, frameToBase64 } from './format.js';
import type { DmxProject } from './format.js';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ---- HTTP helpers ----

async function postJson(url: string, body: unknown): Promise<{ status: number; headers: http.IncomingMessage['headers']; bodyBuf: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = JSON.stringify(body);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, bodyBuf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(bodyStr);
  });
}

async function postMultipart(
  url: string,
  fieldName: string,
  filename: string,
  contentType: string,
  fileData: Buffer,
): Promise<{ status: number; bodyBuf: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const boundary = '----TestBoundary' + Math.random().toString(36).slice(2);

    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileData, footer]);

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, bodyBuf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

// ---- Test fixtures ----

function makeProject(frames = 1): DmxProject {
  const pixels = Buffer.alloc(9 * 34, 0);
  return {
    format: 'dark-matrix',
    version: 1,
    width: 9,
    height: 34,
    mode: 'gray',
    loop: true,
    frames: Array.from({ length: frames }, (_, i) => ({
      delayMs: 100,
      pixels: frameToBase64(new Uint8Array(pixels)),
    })),
  };
}

// ---- Suite ----

describe('import/export endpoints', () => {
  let server: DesignerServer;
  let configDir: string;

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-ie-test-'));
    server = await startDesignerServer({ port: 0, configDir });
  });

  afterEach(async () => {
    await server.stop();
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('POST /api/import with valid .dmx.json returns the project', async () => {
    const project = makeProject(1);
    const json = serializeProject(project);

    const { status, bodyBuf } = await postMultipart(
      `${server.url}/api/import`,
      'file',
      'project.dmx.json',
      'application/json',
      Buffer.from(json, 'utf8'),
    );

    expect(status).toBe(200);
    const resp = JSON.parse(bodyBuf.toString('utf8')) as { ok: boolean; project: DmxProject };
    expect(resp.ok).toBe(true);
    expect(resp.project.format).toBe('dark-matrix');
    expect(resp.project.frames.length).toBe(1);
    expect(resp.project.frames[0]!.pixels).toBe(project.frames[0]!.pixels);
  });

  it('POST /api/import with oversized body returns 400', async () => {
    // 6 MB body
    const bigData = Buffer.alloc(6 * 1024 * 1024, 0x41);
    const { status } = await postMultipart(
      `${server.url}/api/import`,
      'file',
      'big.json',
      'application/json',
      bigData,
    );
    expect(status).toBe(400);
  });

  it('POST /api/import with disallowed MIME type returns 400', async () => {
    const { status, bodyBuf } = await postMultipart(
      `${server.url}/api/import`,
      'file',
      'evil.exe',
      'application/octet-stream',
      Buffer.from('not a real file'),
    );
    expect(status).toBe(400);
    const resp = JSON.parse(bodyBuf.toString('utf8')) as { ok: boolean; error: string };
    expect(resp.ok).toBe(false);
  });

  it('POST /api/export/gif with valid 2-frame project returns image/gif', async () => {
    const project = makeProject(2);
    const { status, headers } = await postJson(`${server.url}/api/export/gif`, { project });
    expect(status).toBe(200);
    expect(headers['content-type']).toBe('image/gif');
  });

  it('POST /api/export/png with valid project returns image/png', async () => {
    const project = makeProject(1);
    const { status, headers } = await postJson(`${server.url}/api/export/png`, { project, frameIdx: 0 });
    expect(status).toBe(200);
    expect(headers['content-type']).toBe('image/png');
  });
});
