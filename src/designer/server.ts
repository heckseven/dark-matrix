import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { z } from 'zod';
import sharp from 'sharp';
import { parseProject, frameToBase64 } from './format.js';
import type { DmxProject } from './format.js';
import { sendToDaemon, PersistentDaemonClient } from '../lib/daemon-client.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebSocketServer } = require('ws') as typeof import('ws');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
};

const PrefsSchema = z.object({
  lastFile:    z.string().optional(),
  port:        z.number().int().min(1).max(65535).optional(),
  activeColor: z.number().int().min(0).max(255).optional(),
  activeMode:  z.enum(['bw', 'gray']).optional(),
});

export type DesignerPrefs = z.infer<typeof PrefsSchema>;

export interface DesignerServerOptions {
  port?:      number;
  host?:      string;
  configDir?: string;  // override for tests
}

export interface DesignerServer {
  stop(): Promise<void>;
  url: string;
  port: number;
}

function prefsPath(configDir?: string): string {
  const dir = configDir ?? path.join(os.homedir(), '.config', 'dark-matrix');
  return path.join(dir, 'designer-prefs.json');
}

async function loadPrefs(configDir?: string): Promise<DesignerPrefs> {
  try {
    const raw = await fs.readFile(prefsPath(configDir), 'utf8');
    const parsed = PrefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

async function savePrefs(prefs: DesignerPrefs, configDir?: string): Promise<void> {
  const p = prefsPath(configDir);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(prefs, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, p);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const MAX_UPLOAD = 5 * 1024 * 1024; // 5 MB

function readBodyBuffer(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let oversized = false;
    req.on('data', (chunk: Buffer) => {
      if (oversized) return; // drain without accumulating
      total += chunk.length;
      if (total > MAX_UPLOAD) {
        oversized = true;
        // Keep draining but don't accumulate
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversized) {
        reject(new Error('payload too large'));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', reject);
  });
}

interface MultipartFile {
  filename: string;
  contentType: string;
  data: Buffer;
}

function parseMultipart(body: Buffer, boundary: string): MultipartFile | null {
  const boundaryBuf = Buffer.from('--' + boundary);
  const crlf = Buffer.from('\r\n');
  const crlfcrlf = Buffer.from('\r\n\r\n');

  // Find the start of the first part
  let pos = body.indexOf(boundaryBuf);
  if (pos === -1) return null;
  pos += boundaryBuf.length;

  // Skip CRLF after boundary
  if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

  // Find header/body separator
  const headerEnd = body.indexOf(crlfcrlf, pos);
  if (headerEnd === -1) return null;

  const headerSection = body.slice(pos, headerEnd).toString('utf8');
  const bodyStart = headerEnd + 4;

  // Find the closing boundary
  const closingBoundary = Buffer.from('\r\n--' + boundary);
  const bodyEnd = body.indexOf(closingBoundary, bodyStart);
  if (bodyEnd === -1) return null;

  const fileData = body.slice(bodyStart, bodyEnd);

  // Parse headers
  let filename = 'upload';
  let contentType = 'application/octet-stream';

  for (const line of headerSection.split('\r\n')) {
    const lower = line.toLowerCase();
    if (lower.startsWith('content-disposition:')) {
      const fnMatch = line.match(/filename="([^"]+)"/i);
      if (fnMatch) filename = fnMatch[1]!;
    } else if (lower.startsWith('content-type:')) {
      contentType = line.slice('content-type:'.length).trim();
    }
  }

  // Suppress unused variable warning
  void crlf;

  return { filename, contentType, data: fileData };
}

const ALLOWED_IMPORT_TYPES = new Set(['image/png', 'image/gif', 'application/json']);

const DmxProjectExportSchema = z.object({
  project: z.object({
    format: z.literal('dark-matrix-designer'),
    version: z.literal(1),
    width: z.union([z.literal(9), z.literal(18)]),
    height: z.literal(34),
    mode: z.enum(['bw', 'gray']),
    loop: z.boolean(),
    frames: z.array(z.object({ delayMs: z.number().int().nonnegative(), pixels: z.string() })).min(1),
  }),
});

const ExportPngSchema = DmxProjectExportSchema.extend({
  frameIdx: z.number().int().nonnegative(),
});

async function handleImport(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const contentType = req.headers['content-type'] ?? '';
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing boundary' }));
    return;
  }

  let body: Buffer;
  try {
    body = await readBodyBuffer(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
    return;
  }

  const file = parseMultipart(body, boundaryMatch[1]!);
  if (!file) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid multipart' }));
    return;
  }

  // Normalize content type (strip params)
  const mimeType = file.contentType.split(';')[0]!.trim().toLowerCase();

  if (!ALLOWED_IMPORT_TYPES.has(mimeType)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'unsupported file type' }));
    return;
  }

  try {
    let project: DmxProject;

    if (mimeType === 'application/json') {
      project = parseProject(file.data.toString('utf8'));
    } else if (mimeType === 'image/png') {
      const raw = await sharp(file.data)
        .resize(9, 34, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .grayscale()
        .raw()
        .toBuffer();

      // Convert from row-major (sharp output) to column-major (frame format)
      const frameBytes = new Uint8Array(9 * 34);
      for (let col = 0; col < 9; col++) {
        for (let row = 0; row < 34; row++) {
          frameBytes[col * 34 + row] = raw[row * 9 + col] ?? 0;
        }
      }

      project = {
        format: 'dark-matrix-designer',
        version: 1,
        width: 9,
        height: 34,
        mode: 'gray',
        loop: true,
        frames: [{ delayMs: 100, pixels: frameToBase64(frameBytes) }],
      };
    } else {
      // GIF: extract all frames
      const meta = await sharp(file.data, { animated: true }).metadata();
      const pages = meta.pages ?? 1;
      const delays: number[] = meta.delay ?? Array.from({ length: pages }, () => 100);

      const stacked = await sharp(file.data, { animated: true })
        .resize(9, 34, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .grayscale()
        .raw()
        .toBuffer();

      const bytesPerFrame = 9 * 34;
      const frames = [];
      for (let i = 0; i < pages; i++) {
        const slice = stacked.subarray(i * bytesPerFrame, (i + 1) * bytesPerFrame);
        const frameBytes = new Uint8Array(bytesPerFrame);
        for (let col = 0; col < 9; col++) {
          for (let row = 0; row < 34; row++) {
            frameBytes[col * 34 + row] = slice[row * 9 + col] ?? 0;
          }
        }
        frames.push({ delayMs: delays[i] ?? 100, pixels: frameToBase64(frameBytes) });
      }

      project = {
        format: 'dark-matrix-designer',
        version: 1,
        width: 9,
        height: 34,
        mode: 'gray',
        loop: true,
        frames,
      };
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, project }));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

async function handleExportGif(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: string;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'bad request' }));
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
    return;
  }

  const result = DmxProjectExportSchema.safeParse(parsed);
  if (!result.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: result.error.message }));
    return;
  }

  const { project } = result.data;
  const { width, height, frames } = project;
  const N = frames.length;
  const delays = frames.map(f => f.delayMs);

  try {
    // Build stacked raw buffer (all frames vertically stacked, row-major)
    const bytesPerFrame = width * height;
    const stacked = Buffer.allocUnsafe(bytesPerFrame * N);

    for (let i = 0; i < N; i++) {
      const frameBytes = Buffer.from(frames[i]!.pixels, 'base64');
      // Convert column-major (stored format) to row-major (sharp needs row-major)
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          stacked[i * bytesPerFrame + row * width + col] = frameBytes[col * height + row] ?? 0;
        }
      }
    }

    const gifBuf = await sharp(stacked, {
      raw: { width, height: height * N, channels: 1, pageHeight: height },
    })
      .gif({ delay: delays })
      .toBuffer();

    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': gifBuf.length,
      'Content-Disposition': 'attachment; filename="animation.gif"',
    });
    res.end(gifBuf);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

async function handleExportPng(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: string;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'bad request' }));
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
    return;
  }

  const result = ExportPngSchema.safeParse(parsed);
  if (!result.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: result.error.message }));
    return;
  }

  const { project, frameIdx } = result.data;
  const { width, height, frames } = project;
  const frame = frames[frameIdx];
  if (!frame) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'frameIdx out of range' }));
    return;
  }

  try {
    const frameBytes = Buffer.from(frame.pixels, 'base64');
    // Convert column-major to row-major for sharp
    const rowMajor = Buffer.allocUnsafe(width * height);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        rowMajor[row * width + col] = frameBytes[col * height + row] ?? 0;
      }
    }

    const pngBuf = await sharp(rowMajor, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();

    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': pngBuf.length,
      'Content-Disposition': `attachment; filename="frame-${frameIdx}.png"`,
    });
    res.end(pngBuf);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

export async function startDesignerServer(opts?: DesignerServerOptions): Promise<DesignerServer> {
  const host = opts?.host ?? '127.0.0.1';
  const configDir = opts?.configDir;
  const staticDir = path.resolve(__dirname, '../../dist/designer/web');

  let prefs = await loadPrefs(configDir);

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // Health check
    if (url === '/api/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: 1 }));
      return;
    }

    // Prefs GET
    if (url === '/api/prefs' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(prefs));
      return;
    }

    // Import
    if (url === '/api/import' && method === 'POST') {
      await handleImport(req, res);
      return;
    }

    // Export GIF
    if (url === '/api/export/gif' && method === 'POST') {
      await handleExportGif(req, res);
      return;
    }

    // Export PNG
    if (url === '/api/export/png' && method === 'POST') {
      await handleExportPng(req, res);
      return;
    }

    // Prefs PUT
    if (url === '/api/prefs' && method === 'PUT') {
      try {
        const body = await readBody(req);
        const incoming = JSON.parse(body) as unknown;
        const merged = PrefsSchema.safeParse({ ...prefs, ...(incoming as object) });
        if (!merged.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid prefs' }));
          return;
        }
        prefs = merged.data;
        await savePrefs(prefs, configDir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad request' }));
      }
      return;
    }

    // Static files
    if (method === 'GET') {
      let filePath = path.join(staticDir, url === '/' ? 'index.html' : url);
      // Prevent path traversal
      if (!filePath.startsWith(staticDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      try {
        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
        res.end(content);
        return;
      } catch {
        // SPA fallback: serve index.html for unknown paths (unless it's an asset extension)
        const ext = path.extname(url);
        if (!ext || ext === '.html') {
          try {
            const index = await fs.readFile(path.join(staticDir, 'index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(index);
            return;
          } catch {
            // index.html not built yet
          }
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not found' }));
        return;
      }
    }

    res.writeHead(405);
    res.end();
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.setMaxListeners(50);

  wss.on('connection', (ws: import('ws').WebSocket) => {
    const previewClient = new PersistentDaemonClient();
    ws.send(JSON.stringify({ type: 'connected' }));
    ws.on('close', () => previewClient.destroy());
    ws.on('message', (data: Buffer) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = msg['type'];
      if (type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      } else if (type === 'preview') {
        const frame = msg['frame'];
        const mode = msg['mode'] === 'gray' ? 'gray' : 'bw';
        const width = msg['width'] === 18 ? 18 : 9;
        if (typeof frame !== 'string' || !frame) {
          ws.send(JSON.stringify({ type: 'preview-error', message: 'invalid frame' }));
          return;
        }
        const target = (msg['target'] as string) ?? 'left';
        let daemonCmd: Record<string, unknown>;
        if (width === 18) {
          const bytes = Buffer.from(frame, 'base64');
          const leftHalf = bytes.subarray(0, 306).toString('base64');
          const rightHalf = bytes.subarray(306, 612).toString('base64');
          if (target === 'left')        daemonCmd = { cmd: 'frame', left: leftHalf, mode };
          else if (target === 'right')  daemonCmd = { cmd: 'frame', right: rightHalf, mode };
          else if (target === 'mirror') {
            const COLS = 9, ROWS = 34;
            const src = bytes.subarray(0, 306);
            const flipped = Buffer.allocUnsafe(306);
            for (let c = 0; c < COLS; c++)
              for (let r = 0; r < ROWS; r++)
                flipped[c * ROWS + r] = src[(COLS - 1 - c) * ROWS + r] ?? 0;
            daemonCmd = { cmd: 'frame', left: leftHalf, right: flipped.toString('base64'), mode };
          }
          else                          daemonCmd = { cmd: 'frame', left: leftHalf, right: rightHalf, mode };
        } else {
          if (target === 'right')       daemonCmd = { cmd: 'frame', right: frame, mode };
          else if (target === 'both' || target === 'mirror') daemonCmd = { cmd: 'frame', left: frame, right: frame, mode };
          else                          daemonCmd = { cmd: 'frame', left: frame, mode };
        }
        previewClient.send(daemonCmd);
        ws.send(JSON.stringify({ type: 'preview-ack' }));
      } else if (type === 'preview-stop') {
        sendToDaemon({ cmd: 'frame-stop' }).catch(() => { /* ignore — daemon may not be running */ });
      }
    });
  });

  const boundPort = await new Promise<number>((resolve, reject) => {
    const p = opts?.port ?? 7340;
    server.listen(p, host, () => {
      resolve((server.address() as { port: number }).port);
    });
    server.on('error', reject);
  });

  const url = `http://${host}:${boundPort}`;

  return {
    url,
    port: boundPort,
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        // Terminate all active WS connections so wss.close() doesn't hang
        for (const client of wss.clients) client.terminate();
        wss.close(() => {
          server.close((err) => err ? reject(err) : resolve());
        });
      });
    },
  };
}
