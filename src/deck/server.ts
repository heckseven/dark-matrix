import http from 'node:http';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { z } from 'zod';
import sharp from 'sharp';
import { parseProject, frameToBase64 } from './format.js';
import type { DmxProject } from './format.js';
import type { AssetMeta } from '../lib/asset-meta.js';
import { convertGifToDmx, applyPixelValue } from '../lib/image-convert.js';
import { sendToDaemon, PersistentDaemonClient, daemonSocketPath } from '../lib/daemon-client.js';
import { loadConfig, ConfigSchema } from '../lib/config.js';
import { enumerateMatrixModules } from '../lib/modules.js';
import { AUDIO_STYLES } from '../animations/audio-renderers.js';
import { watchProcStats } from '../lib/proc-source.js';

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
  lastFile:      z.string().optional(),
  port:          z.number().int().min(1).max(65535).optional(),
  activeColor:   z.number().int().min(0).max(255).optional(),
  activeMode:    z.enum(['bw', 'gray']).optional(),
  setupComplete: z.boolean().optional(),
});

export type DeckPrefs = z.infer<typeof PrefsSchema>;

export interface DeckServerOptions {
  port?:      number;
  host?:      string;
  configDir?: string;  // override for tests
}

export interface DeckServer {
  stop(): Promise<void>;
  url: string;
  port: number;
}

function prefsPath(configDir?: string): string {
  const dir = configDir ?? path.join(os.homedir(), '.config', 'dark-matrix');
  return path.join(dir, 'deck-prefs.json');
}

function configFilePath(configDir?: string): string {
  const dir = configDir ?? path.join(os.homedir(), '.config', 'dark-matrix');
  return path.join(dir, 'config.json');
}

function libraryDir(configDir?: string): string {
  const dir = configDir ?? path.join(os.homedir(), '.config', 'dark-matrix');
  return path.join(dir, 'library');
}


function safeLibraryPath(name: string, configDir?: string): string | null {
  const stem = path.basename(name).replace(/\.dmx\.json$/i, '');
  if (!/^[a-zA-Z0-9_ \-]{1,100}$/.test(stem)) return null;
  const dir = libraryDir(configDir);
  const candidate = path.join(dir, `${stem}.dmx.json`);
  if (!candidate.startsWith(dir + path.sep)) return null;
  return candidate;
}

async function uniqueLibraryCopyPath(stem: string, dir: string): Promise<string> {
  const base = `${stem}_copy`;
  let candidate = path.join(dir, `${base}.dmx.json`);
  try { await fs.access(candidate); } catch { return candidate; }
  for (let i = 2; i <= 99; i++) {
    candidate = path.join(dir, `${base}_${i}.dmx.json`);
    try { await fs.access(candidate); } catch { return candidate; }
  }
  throw new Error(`could not find a unique copy name for ${stem} after 99 attempts`);
}

async function loadPrefs(configDir?: string): Promise<DeckPrefs> {
  try {
    const raw = await fs.readFile(prefsPath(configDir), 'utf8');
    const parsed = PrefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

async function savePrefs(prefs: DeckPrefs, configDir?: string): Promise<void> {
  const p = prefsPath(configDir);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(prefs, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, p);
}

const MAX_JSON_BODY = 1 * 1024 * 1024; // 1 MB

function readBody(req: http.IncomingMessage, maxBytes = MAX_JSON_BODY): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) { req.destroy(); reject(new Error('payload too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
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
      if (fnMatch) filename = path.basename(fnMatch[1]!);
    } else if (lower.startsWith('content-type:')) {
      contentType = line.slice('content-type:'.length).trim();
    }
  }

  return { filename, contentType, data: fileData };
}

const ALLOWED_IMPORT_TYPES = new Set(['image/png', 'image/gif', 'application/json']);

const DmxProjectExportSchema = z.object({
  project: z.object({
    format: z.literal('dark-matrix'),
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
        format: 'dark-matrix',
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
        format: 'dark-matrix',
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

const MAX_ASSETS_BODY = 10 * 1024 * 1024; // 10 MB

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

async function convertSourceToProject(
  sourceBuf: Buffer,
  width: 9 | 18,
  mode: 'bw' | 'gray',
  fit: 'contain' | 'cover' | 'fill',
  brightness: number,
  contrast: number,
  invert = false,
): Promise<DmxProject> {
  // Detect .dmx.json: starts with '{' and parses as dark-matrix JSON
  const head = sourceBuf.slice(0, 1).toString();
  if (head === '{') {
    try {
      const project = parseProject(sourceBuf.toString('utf8'));
      return project;
    } catch {
      // not a valid dmx.json — fall through to image path
    }
  }

  // Detect GIF magic bytes: GIF87a or GIF89a
  const isGif =
    sourceBuf[0] === 0x47 && sourceBuf[1] === 0x49 && sourceBuf[2] === 0x46;

  if (isGif) {
    return convertGifToDmx(sourceBuf, { width, mode, fit, brightness, contrast, invert });
  }

  // PNG/JPEG: single frame
  const raw = await sharp(sourceBuf)
    .resize(width, 34, { fit, background: { r: 0, g: 0, b: 0 } })
    .grayscale()
    .modulate({ brightness: 1 + brightness })
    .linear(contrast, 0)
    .raw()
    .toBuffer();

  const pixels = new Uint8Array(width * 34);
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < 34; row++) {
      pixels[col * 34 + row] = applyPixelValue(raw[row * width + col] ?? 0, mode, invert);
    }
  }

  return {
    format: 'dark-matrix',
    version: 1,
    width,
    height: 34,
    mode,
    loop: false,
    frames: [{ delayMs: 0, pixels: Buffer.from(pixels).toString('base64') }],
  };
}

async function handleAssetsImport(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  aDir: string,
): Promise<void> {
  let body: string;
  try {
    body = await readBody(req, MAX_ASSETS_BODY);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
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

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'expected json object' }));
    return;
  }
  const p = parsed as Record<string, unknown>;

  // Validate filename
  const filename = p['filename'];
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9_\-]+$/.test(filename) || filename.length > 64) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid filename' }));
    return;
  }

  // Validate sourceBase64
  if (typeof p['sourceBase64'] !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing sourceBase64' }));
    return;
  }

  // Validate width
  const width = p['width'];
  if (width !== 9 && width !== 18) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'width must be 9 or 18' }));
    return;
  }

  // Validate mode
  const mode = p['mode'];
  if (mode !== 'bw' && mode !== 'gray') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'mode must be bw or gray' }));
    return;
  }

  // Validate fit
  const fit = p['fit'];
  if (fit !== 'contain' && fit !== 'cover' && fit !== 'fill') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'fit must be contain, cover, or fill' }));
    return;
  }

  const brightness = clamp(typeof p['brightness'] === 'number' ? p['brightness'] : 0, -1, 1);
  const contrast = clamp(typeof p['contrast'] === 'number' ? p['contrast'] : 1, 0.5, 2);
  const invert = p['invert'] === true;
  const overwrite = p['overwrite'] === true;

  // Path traversal check
  const outputPath = path.resolve(aDir, filename + '.dmx.json');
  if (!outputPath.startsWith(aDir + path.sep)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid filename' }));
    return;
  }

  // Check existence
  if (!overwrite) {
    try {
      await fs.access(outputPath);
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'file exists' }));
      return;
    } catch {
      // does not exist — OK
    }
  }

  try {
    const sourceBuf = Buffer.from(p['sourceBase64'] as string, 'base64');
    const project = await convertSourceToProject(sourceBuf, width, mode, fit, brightness, contrast, invert);

    await fs.mkdir(aDir, { recursive: true });
    const tmp = outputPath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(project, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(tmp, outputPath);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, filename: filename + '.dmx.json' }));
  } catch (err) {
    console.error('[assets import] conversion failed:', err);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'conversion failed' }));
  }
}

async function handleAssetsPreview(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let body: string;
  try {
    body = await readBody(req, MAX_ASSETS_BODY);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
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

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'expected json object' }));
    return;
  }
  const p = parsed as Record<string, unknown>;

  if (typeof p['sourceBase64'] !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing sourceBase64' }));
    return;
  }

  const width = p['width'];
  if (width !== 9 && width !== 18) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'width must be 9 or 18' }));
    return;
  }

  const mode = p['mode'];
  if (mode !== 'bw' && mode !== 'gray') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'mode must be bw or gray' }));
    return;
  }

  const fit = p['fit'];
  if (fit !== 'contain' && fit !== 'cover' && fit !== 'fill') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'fit must be contain, cover, or fill' }));
    return;
  }

  const brightness = clamp(typeof p['brightness'] === 'number' ? p['brightness'] : 0, -1, 1);
  const contrast = clamp(typeof p['contrast'] === 'number' ? p['contrast'] : 1, 0.5, 2);
  const invert = p['invert'] === true;

  try {
    const sourceBuf = Buffer.from(p['sourceBase64'] as string, 'base64');
    const project = await convertSourceToProject(sourceBuf, width, mode, fit, brightness, contrast, invert);
    const frames = project.frames.map(f => f.pixels);
    const delays = project.frames.map(f => f.delayMs);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, frames, delays, width: project.width, frameCount: project.frames.length }));
  } catch (err) {
    console.error('[assets preview] conversion failed:', err);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'conversion failed' }));
  }
}

export async function startDeckServer(opts?: DeckServerOptions): Promise<DeckServer> {
  const host = opts?.host ?? '127.0.0.1';
  const configDir = opts?.configDir;
  const staticDir = path.resolve(__dirname, '../../dist/deck/web');

  let prefs = await loadPrefs(configDir);

  // Transient error cache: populated by the youtube-stream proxy on yt-dlp failure so
  // the client can retrieve the message without triggering a second subprocess.
  const ytStreamErrors = new Map<string, string>();

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // Health check
    if (url === '/api/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: 1 }));
      return;
    }

    // YouTube stream proxy — requires yt-dlp: sudo apt install yt-dlp
    if (url.startsWith('/api/youtube-stream') && method === 'GET') {
      const params = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
      const ytUrl = params.get('url');
      if (!ytUrl) { res.writeHead(400); res.end('missing url'); return; }

      // Validate input is a YouTube URL
      let parsedYt: URL;
      try { parsedYt = new URL(ytUrl); } catch { res.writeHead(400); res.end('invalid url'); return; }
      if (!/^(www\.|music\.)?youtube\.com$|^youtu\.be$/.test(parsedYt.hostname)) {
        res.writeHead(400); res.end('not a youtube url'); return;
      }

      // Resolve CDN stream URL via yt-dlp
      let streamUrl: string;
      try {
        streamUrl = await new Promise<string>((resolve, reject) => {
          const p = spawn('yt-dlp', [
            '-f', 'best[height<=480][ext=mp4]/best[height<=480]/best[ext=mp4]/best',
            '-g', ytUrl,
          ], { stdio: ['ignore', 'pipe', 'pipe'] });
          let out = '', err = '';
          p.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
          p.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
          p.on('close', (code) => {
            if (code !== 0) return reject(new Error(`yt-dlp: ${err.trim().split('\n')[0]}`));
            const u = out.trim().split('\n')[0];
            u ? resolve(u) : reject(new Error('yt-dlp returned no URL'));
          });
          p.on('error', (e) => {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
              reject(new Error('yt-dlp not found — install it: sudo apt install yt-dlp'));
            } else {
              reject(new Error('yt-dlp failed to start'));
            }
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'yt-dlp error';
        console.error('[youtube-stream] yt-dlp:', err);
        ytStreamErrors.set(ytUrl, message);
        setTimeout(() => ytStreamErrors.delete(ytUrl), 30_000);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
        return;
      }

      // Guard against yt-dlp returning non-CDN URLs
      let parsedStream: URL;
      try { parsedStream = new URL(streamUrl); } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unexpected stream source' }));
        return;
      }
      if (!parsedStream.hostname.endsWith('.googlevideo.com')) {
        console.error('[youtube-stream] unexpected CDN host:', parsedStream.hostname);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unexpected stream source' }));
        return;
      }

      // Proxy bytes with 30s connect timeout; cancel on client disconnect.
      // ac is used only for the initial fetch() connection. Once we have the
      // reader, we cancel it directly — calling ac.abort() on an in-progress
      // stream body throws synchronously from undici's abort listener in Node 24.
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 30_000);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      req.once('close', () => {
        clearTimeout(timeout);
        if (reader) void reader.cancel().catch(() => {});
        else try { ac.abort(); } catch { /* ignore */ }
      });

      try {
        const rawRange = req.headers['range'];
        const safeRange = typeof rawRange === 'string' && /^bytes=\d+-\d*$/.test(rawRange) ? rawRange : undefined;
        const upstream = await fetch(streamUrl, {
          signal: ac.signal,
          headers: {
            ...(safeRange ? { 'Range': safeRange } : {}),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.youtube.com/',
          },
        });
        clearTimeout(timeout);

        const outHeaders: Record<string, string> = { 'Cache-Control': 'no-store' };
        const ct = upstream.headers.get('content-type');
        const cl = upstream.headers.get('content-length');
        const cr = upstream.headers.get('content-range');
        const ar = upstream.headers.get('accept-ranges');
        if (ct) outHeaders['Content-Type'] = ct;
        if (cl) outHeaders['Content-Length'] = cl;
        if (cr) outHeaders['Content-Range'] = cr;
        if (ar) outHeaders['Accept-Ranges'] = ar;
        res.writeHead(upstream.status, outHeaders);

        reader = upstream.body!.getReader();
        try {
          while (!res.destroyed) {
            const { done, value } = await reader.read();
            if (done) { res.end(); break; }
            if (!res.write(value)) {
              // Wait for backpressure to clear; also exit if socket closes.
              await new Promise<void>(resolve => {
                const end = () => { res.removeListener('drain', end); res.removeListener('close', end); resolve(); };
                res.once('drain', end);
                res.once('close', end);
              });
            }
          }
        } finally {
          void reader.cancel().catch(() => {});
        }
      } catch (err) {
        clearTimeout(timeout);
        console.error('[youtube-stream] fetch error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'stream unavailable' }));
        }
      }
      return;
    }

    // YouTube stream error — returns cached yt-dlp error without re-running yt-dlp
    if (url.startsWith('/api/youtube-stream-error') && method === 'GET') {
      const params = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
      const ytUrl = params.get('url');
      const error = ytUrl ? ytStreamErrors.get(ytUrl) ?? null : null;
      if (ytUrl) ytStreamErrors.delete(ytUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
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

    // Feature check — probe optional binaries on PATH
    if (url === '/api/feature-check' && method === 'GET') {
      const probe = (bin: string): Promise<boolean> =>
        new Promise(resolve => {
          const c = spawn(bin, ['--version'], { stdio: 'ignore' });
          c.on('close', code => resolve(code === 0));
          c.on('error', () => resolve(false));
        });
      async function checkClaudeLoggedIn(): Promise<boolean> {
        try {
          const raw = await fs.readFile(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf-8');
          const parsed: unknown = JSON.parse(raw);
          if (parsed === null || typeof parsed !== 'object') return false;
          const creds = parsed as Record<string, unknown>;
          const oauth = creds['claudeAiOauth'];
          if (oauth === null || typeof oauth !== 'object') return false;
          const { accessToken, expiresAt } = oauth as Record<string, unknown>;
          if (typeof accessToken !== 'string') return false;
          if (typeof expiresAt === 'number' && expiresAt < Date.now()) return false;
          return true;
        } catch { return false; }
      }
      const [claudeLoggedIn, ffmpeg, wpctl, pwDump, ytDlp, dbusMonitor] = await Promise.all([
        checkClaudeLoggedIn(), probe('ffmpeg'), probe('wpctl'), probe('pw-dump'), probe('yt-dlp'), probe('dbus-monitor'),
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ffmpeg, wpctl, pwDump, ytDlp, dbusMonitor, claudeLoggedIn }));
      return;
    }

    // Config GET
    if (url === '/api/config' && method === 'GET') {
      try {
        const config = await loadConfig(configFilePath(configDir));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, config }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
      return;
    }

    // Config PUT
    if (url === '/api/config' && method === 'PUT') {
      try {
        const body = await readBody(req);
        const incoming = JSON.parse(body) as unknown;
        const result = ConfigSchema.safeParse(incoming);
        if (!result.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, issues: result.error.issues }));
          return;
        }
        const cfgPath = configFilePath(configDir);
        await fs.mkdir(path.dirname(cfgPath), { recursive: true });
        const tmp = cfgPath + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(result.data, null, 2) + '\n', { mode: 0o600 });
        await fs.rename(tmp, cfgPath);
        sendToDaemon({ cmd: 'reload' }).catch(() => {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad request' }));
      }
      return;
    }

    // Startup preview
    if (url === '/api/startup-preview' && method === 'POST') {
      try {
        const body = await readBody(req);
        const startup = JSON.parse(body) as { animation: string; scroll_text?: string; dmx_path?: string };
        await sendToDaemon({ cmd: 'startup-preview', ...startup });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'daemon unavailable' }));
      }
      return;
    }

    // Test notification
    if (url === '/api/test-notification' && method === 'POST') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as {
          appName?: string;
          summary?: string;
          bodyText?: string;
          style?: string;
          textSize?: string;
          textPosition?: string;
          overlayMode?: string;
          transition?: string;
          assetPath?: string;
          composite?: string;
          durationMsOverride?: number;
          loopCount?: number;
          mirror?: boolean;
          side?: string;
        };
        const VALID_STYLES = ['text', 'dmx'];
        const VALID_COMPOSITES = ['replace', 'overlay'];
        const VALID_TEXT_SIZES = ['tiny', 'small', 'medium', 'large'];
        const VALID_TEXT_POSITIONS = ['top', 'middle', 'bottom'];
        const VALID_OVERLAY_MODES = ['or', 'replace', 'xor', 'halo'];
        const VALID_TRANSITIONS = ['wipe', 'scan', 'slide', 'dissolve', 'flash'];
        const MAX_LOOP_COUNT = 100; // cap to prevent runaway animation loops
        if (parsed.style !== undefined && !VALID_STYLES.includes(parsed.style)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid style' }));
          return;
        }
        if (parsed.textSize !== undefined && !VALID_TEXT_SIZES.includes(parsed.textSize)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid textSize' }));
          return;
        }
        if (parsed.textPosition !== undefined && !VALID_TEXT_POSITIONS.includes(parsed.textPosition)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid textPosition' }));
          return;
        }
        if (parsed.overlayMode !== undefined && !VALID_OVERLAY_MODES.includes(parsed.overlayMode)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid overlayMode' }));
          return;
        }
        if (parsed.transition !== undefined && !VALID_TRANSITIONS.includes(parsed.transition)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid transition' }));
          return;
        }
        if (parsed.composite !== undefined && !VALID_COMPOSITES.includes(parsed.composite)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid composite' }));
          return;
        }
        if (parsed.assetPath !== undefined && !/^[\w.\-]+$/.test(parsed.assetPath)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid asset path' }));
          return;
        }
        if (parsed.durationMsOverride !== undefined &&
            (typeof parsed.durationMsOverride !== 'number' || parsed.durationMsOverride <= 0 || !isFinite(parsed.durationMsOverride))) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid duration' }));
          return;
        }
        if (parsed.loopCount !== undefined &&
            (typeof parsed.loopCount !== 'number' || !Number.isInteger(parsed.loopCount) || parsed.loopCount < 1 || parsed.loopCount > MAX_LOOP_COUNT)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: `loopCount must be 1–${MAX_LOOP_COUNT}` }));
          return;
        }
        if (parsed.mirror !== undefined && typeof parsed.mirror !== 'boolean') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid mirror' }));
          return;
        }
        if (parsed.side !== undefined && parsed.side !== 'left' && parsed.side !== 'right') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid side' }));
          return;
        }
        const cmd: Record<string, unknown> = {
          cmd: 'notify-test',
          appName: parsed.appName,
          summary: parsed.summary,
          body: parsed.bodyText,
        };
        if (parsed.style !== undefined) cmd['style'] = parsed.style;
        if (parsed.textSize !== undefined) cmd['textSize'] = parsed.textSize;
        if (parsed.textPosition !== undefined) cmd['textPosition'] = parsed.textPosition;
        if (parsed.overlayMode !== undefined) cmd['overlayMode'] = parsed.overlayMode;
        if (parsed.transition !== undefined) cmd['transition'] = parsed.transition;
        if (parsed.assetPath !== undefined) cmd['assetPath'] = parsed.assetPath;
        if (parsed.composite !== undefined) cmd['composite'] = parsed.composite;
        if (parsed.durationMsOverride !== undefined) cmd['durationMsOverride'] = parsed.durationMsOverride;
        if (parsed.loopCount !== undefined) cmd['loopCount'] = parsed.loopCount;
        if (parsed.mirror !== undefined) cmd['mirror'] = parsed.mirror;
        if (parsed.side !== undefined) cmd['side'] = parsed.side;
        const reply = await sendToDaemon(cmd) as { ok: boolean; action?: string };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, action: reply.action }));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'daemon unavailable' }));
      }
      return;
    }

    // Library list
    if (url === '/api/library' && method === 'GET') {
      try {
        const dir = libraryDir(configDir);
        await fs.mkdir(dir, { recursive: true });
        const entries = await fs.readdir(dir);
        const files = entries
          .filter(e => /\.dmx\.json$/i.test(e))
          .map(e => ({ name: e.replace(/\.dmx\.json$/i, '') }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, files }));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'failed to list library' }));
      }
      return;
    }

    // Library save
    if (url === '/api/library' && method === 'POST') {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { name?: unknown; project?: unknown; copy?: unknown };
        if (typeof parsed.name !== 'string' || !parsed.name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'missing name' }));
          return;
        }
        const filePath = safeLibraryPath(parsed.name, configDir);
        if (!filePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid name' }));
          return;
        }
        const dir = libraryDir(configDir);
        await fs.mkdir(dir, { recursive: true });
        let targetPath = filePath;
        if (parsed.copy) {
          const stem = path.basename(parsed.name as string).replace(/\.dmx\.json$/i, '');
          targetPath = await uniqueLibraryCopyPath(stem, dir);
        }
        const project = parsed.project;
        const result = DmxProjectExportSchema.shape.project.safeParse(project);
        if (!result.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: result.error.message }));
          return;
        }
        const tmp = targetPath + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(result.data, null, 2) + '\n', { mode: 0o600 });
        await fs.rename(tmp, targetPath);
        const savedName = path.basename(targetPath).replace(/\.dmx\.json$/i, '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name: savedName }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad request' }));
      }
      return;
    }

    // Library single-file operations
    const libMatch = url.match(/^\/api\/library\/([^/]+)(\/rename)?$/);
    if (libMatch) {
      const rawName = decodeURIComponent(libMatch[1]!);
      const isRename = !!libMatch[2];

      if (method === 'GET' && !isRename) {
        const filePath = safeLibraryPath(rawName, configDir);
        if (!filePath) { res.writeHead(400); res.end(); return; }
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(content);
        } catch {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'not found' }));
        }
        return;
      }

      if (method === 'PUT' && isRename) {
        const oldPath = safeLibraryPath(rawName, configDir);
        if (!oldPath) { res.writeHead(400); res.end(); return; }
        try {
          const body = await readBody(req);
          const parsed = JSON.parse(body) as { newName?: unknown };
          if (typeof parsed.newName !== 'string' || !parsed.newName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'missing newName' }));
            return;
          }
          const newPath = safeLibraryPath(parsed.newName, configDir);
          if (!newPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'invalid newName' }));
            return;
          }
          await fs.rename(oldPath, newPath);
          const newName = path.basename(newPath).replace(/\.dmx\.json$/i, '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, name: newName }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'rename failed' }));
        }
        return;
      }

      if (method === 'DELETE' && !isRename) {
        const filePath = safeLibraryPath(rawName, configDir);
        if (!filePath) { res.writeHead(400); res.end(); return; }
        try {
          await fs.unlink(filePath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'not found' }));
        }
        return;
      }
    }

    if (url === '/api/matrix-modules' && method === 'GET') {
      const ports = await enumerateMatrixModules().catch(() => []);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ports }));
      return;
    }

    if (url === '/api/sensor-detect' && method === 'GET') {
      const IIO_DIR = '/sys/bus/iio/devices';
      let detected: string | null = null;
      try {
        const entries = await fs.readdir(IIO_DIR);
        for (const entry of entries) {
          if (!entry.startsWith('iio:device')) continue;
          const candidate = `${IIO_DIR}/${entry}/in_illuminance_raw`;
          try {
            await fs.access(candidate);
            detected = candidate;
            break;
          } catch { /* not accessible */ }
        }
      } catch { /* IIO_DIR absent */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(detected ? { ok: true, path: detected } : { ok: false }));
      return;
    }

    if (url === '/api/ec-status' && method === 'GET') {
      try {
        const s = await sendToDaemon({ cmd: 'ec-status' }) as { ok: boolean; source?: string };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, source: s.source ?? 'none' }));
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, source: 'daemon-offline' }));
      }
      return;
    }

    // Module availability — proxies daemon status command
    if (url === '/api/serial-ports' && method === 'GET') {
      const ports: string[] = [];
      try {
        const entries = await fs.readdir('/dev/serial/by-path');
        for (const e of entries.sort()) ports.push(`/dev/serial/by-path/${e}`);
      } catch { /* directory absent — no by-path ports */ }
      for (const prefix of ['ttyACM', 'ttyUSB']) {
        try {
          const entries = await fs.readdir('/dev');
          for (const e of entries.filter(f => f.startsWith(prefix)).sort()) {
            ports.push(`/dev/${e}`);
          }
        } catch { /* ignore */ }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ports }));
      return;
    }

    if (url === '/api/net-interfaces' && method === 'GET') {
      const interfaces = Object.keys(os.networkInterfaces())
        .filter(n => n !== 'lo')
        .sort();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, interfaces }));
      return;
    }

    if (url === '/api/notification-history' && method === 'GET') {
      try {
        const s = await sendToDaemon({ cmd: 'notification-history' }) as { ok?: boolean; history?: unknown };
        const history: Record<string, string[]> = {};
        if (s.history && typeof s.history === 'object') {
          for (const [src, list] of Object.entries(s.history as Record<string, unknown>)) {
            if (Array.isArray(list) && list.every(x => typeof x === 'string')) {
              history[src] = list as string[];
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(history));
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'daemon unreachable' }));
      }
      return;
    }

    if (url === '/api/modules' && method === 'GET') {
      let uncalibrated = false;
      try {
        const cfg = await loadConfig(configFilePath(configDir));
        uncalibrated = cfg.uncalibrated ?? false;
      } catch { /* config unreadable — treat as calibrated */ }
      try {
        const s = await sendToDaemon({ cmd: 'status' }) as {
          ok: boolean;
          modules: { left: boolean; right: boolean };
          switches?: { mic: number; cam: number };
        };
        const modules = s.modules ?? { left: false, right: false };
        const micSwitchOn = s.switches ? s.switches.mic === 0 : undefined;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...modules, daemonOnline: true, uncalibrated, ...(micSwitchOn !== undefined ? { micSwitchOn } : {}) }));
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ left: false, right: false, daemonOnline: false, uncalibrated }));
      }
      return;
    }

    // Assets list
    if (url === '/api/assets' && method === 'GET') {
      const lDir = libraryDir(configDir);
      await fs.mkdir(lDir, { recursive: true });
      const assets: AssetMeta[] = [];
      try {
        const entries = await fs.readdir(lDir);
        for (const name of entries.filter(e => /\.dmx\.json$/i.test(e))) {
          try {
            const raw = await fs.readFile(path.join(lDir, name), 'utf8');
            const project = parseProject(raw);
            if (!project.frames.length) continue;
            assets.push({
              name,
              width: project.width,
              frameCount: project.frames.length,
              firstFrame: project.frames[0]!.pixels,
              frames: project.frames.map(f => f.pixels),
              delays: project.frames.map(f => f.delayMs),
            });
          } catch { /* skip invalid files silently */ }
        }
      } catch { /* readdir failed — skip */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, assets }));
      return;
    }

    // Assets import
    if (url === '/api/assets' && method === 'POST') {
      await handleAssetsImport(req, res, libraryDir(configDir));
      return;
    }

    // Assets preview
    if (url === '/api/assets/preview' && method === 'POST') {
      await handleAssetsPreview(req, res);
      return;
    }

    // Copy asset
    if (url === '/api/assets/copy' && method === 'POST') {
      let parsed: { name?: unknown };
      try { parsed = JSON.parse(await readBody(req)) as { name?: unknown }; }
      catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'bad request' })); return; }
      const name = parsed.name;
      if (typeof name !== 'string' || !name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'missing name' }));
        return;
      }
      if (!/^[a-zA-Z0-9_\-]+\.dmx\.json$/i.test(name)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid filename' }));
        return;
      }
      const dir = libraryDir(configDir);
      const srcPath = path.resolve(dir, name);
      if (!srcPath.startsWith(dir + path.sep)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid filename' }));
        return;
      }
      try {
        const data = await fs.readFile(srcPath, 'utf8');
        const stem = name.replace(/\.dmx\.json$/i, '');
        let copyBase = '';
        for (let i = 2; i < 1000; i++) {
          const candidate = `${stem}_${i}.dmx.json`;
          const candidatePath = path.resolve(dir, candidate);
          if (!candidatePath.startsWith(dir + path.sep)) continue;
          try {
            await fs.writeFile(candidatePath, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            copyBase = candidate;
            break;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          }
        }
        if (!copyBase) throw new Error('no unique name');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name: copyBase }));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'copy failed' }));
      }
      return;
    }

    // Single asset fetch / delete — supports ?full=1 on GET
    const assetUrlPath = url.includes('?') ? url.slice(0, url.indexOf('?')) : url;
    const assetQueryStr = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    const assetMatch = assetUrlPath.match(/^\/api\/assets\/([^/]+)$/);
    if (assetMatch && method === 'GET') {
      const rawName = decodeURIComponent(assetMatch[1]!);
      const base = rawName;
      if (!/^[a-zA-Z0-9_\-]+\.dmx\.json$/i.test(base)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid filename' }));
        return;
      }
      const dir = libraryDir(configDir);
      const resolved = path.resolve(dir, base);
      if (!resolved.startsWith(dir + path.sep)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid filename' }));
        return;
      }
      try {
        const raw = await fs.readFile(resolved, 'utf-8');
        if (new URLSearchParams(assetQueryStr).get('full') === '1') {
          parseProject(raw); // validate before serving; throws on malformed file
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(raw);
          return;
        }
        const project = parseProject(raw);
        const asset: AssetMeta = {
          name: base,
          width: project.width,
          frameCount: project.frames.length,
          firstFrame: project.frames[0]!.pixels,
          frames: project.frames.map(f => f.pixels),
          delays: project.frames.map(f => f.delayMs),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, asset }));
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not found' }));
      }
      return;
    }
    if (assetMatch && method === 'DELETE') {
      const rawName = decodeURIComponent(assetMatch[1]!);
      const base = rawName;
      if (!/^[a-zA-Z0-9_\-]+\.dmx\.json$/i.test(base)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid filename' }));
        return;
      }
      const dir = libraryDir(configDir);
      const resolved = path.resolve(dir, base);
      if (!resolved.startsWith(dir + path.sep)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid filename' }));
        return;
      }
      try {
        await fs.unlink(resolved);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'not found' }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'delete failed' }));
        }
      }
      return;
    }

    // Static files
    if (method === 'GET') {
      let filePath = path.join(staticDir, url === '/' ? 'index.html' : url);
      // Prevent path traversal
      if (!filePath.startsWith(staticDir + path.sep) && filePath !== staticDir) {
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

  function openAudioStream(
    source: string,
    onBands: (ctx: { bands: number[]; fftSize: number; gain: number; fullBands?: number[] }) => void,
    fullBandCount?: number,
  ): net.Socket {
    const sock = net.createConnection(daemonSocketPath());
    let buf = '';
    sock.on('connect', () => {
      sock.write(JSON.stringify({
        cmd: 'audio-viz',
        source,
        ...(fullBandCount ? { fullBandCount } : {}),
      }) + '\n');
    });
    sock.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { type?: string; bands?: number[]; fftSize?: number; gain?: number; fullBands?: number[] };
          if (parsed.type === 'audio-bands' && parsed.bands) {
            onBands({
              bands: parsed.bands,
              fftSize: parsed.fftSize ?? 2048,
              gain: parsed.gain ?? 1.0,
              ...(parsed.fullBands ? { fullBands: parsed.fullBands } : {}),
            });
          }
        } catch { /* skip */ }
      }
    });
    sock.on('error', () => { /* socket will close */ });
    return sock;
  }

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1 * 1024 * 1024 });
  wss.setMaxListeners(50);

  let retryGen = 0;
  async function sendToDaemonWithRetry(cmd: Record<string, unknown>, gen: number, retries = 6, baseMs = 250): Promise<void> {
    for (let i = 0; i <= retries; i++) {
      if (gen !== retryGen) return;
      try { await sendToDaemon(cmd); return; } catch { /* retry */ }
      if (i < retries) await new Promise(r => setTimeout(r, baseMs * (i + 1)));
    }
    if (gen === retryGen) console.error('[deck] daemon unreachable after retries:', cmd['cmd']);
  }

  let audioOwnerWs: import('ws').WebSocket | null = null;
  let hudOwnerWs:   import('ws').WebSocket | null = null;
  let activeHudPresetName: string | null = null;

  // Shared proc-stats broadcaster — starts on first subscriber, stops on last
  const dataStatsClients = new Set<import('ws').WebSocket>();
  let stopProcStats: (() => void) | null = null;

  function startDataStats(ws: import('ws').WebSocket): void {
    dataStatsClients.add(ws);
    if (!stopProcStats) {
      stopProcStats = watchProcStats((stats) => {
        const msg = JSON.stringify({ type: 'data-stats', cpuPct: stats.cpuPct, ramPct: stats.ramPct, netRxBps: stats.netRxBps, netTxBps: stats.netTxBps, cpuCores: stats.cpuCores });
        for (const client of dataStatsClients) {
          if (client.readyState === 1) client.send(msg);
        }
      });
    }
  }

  function stopDataStats(ws: import('ws').WebSocket): void {
    dataStatsClients.delete(ws);
    if (dataStatsClients.size === 0 && stopProcStats) {
      stopProcStats();
      stopProcStats = null;
    }
  }

  wss.on('connection', (ws: import('ws').WebSocket) => {
    const previewClient = new PersistentDaemonClient();
    let audioStream: net.Socket | null = null;
    let dataStatsActive = false;
    ws.send(JSON.stringify({ type: 'connected' }));
    ws.on('close', () => {
      previewClient.destroy();
      audioStream?.destroy();
      if (dataStatsActive) stopDataStats(ws);
      if (audioOwnerWs === ws) {
        audioOwnerWs = null;
        sendToDaemon({ cmd: 'audio-hardware-stop' }).catch(() => {});
      }
      if (hudOwnerWs === ws) {
        hudOwnerWs = null;
        sendToDaemon({ cmd: 'hud-hardware-stop' }).catch(() => {});
      }
    });
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
      } else if (type === 'audio-viz') {
        const knownStyles = AUDIO_STYLES.map(s => s.id as string);
        const rawStyle = typeof msg['style'] === 'string' ? msg['style'] : '';
        const style = knownStyles.includes(rawStyle) ? rawStyle : 'dark-matter';
        const source = msg['source'] === 'mic' ? 'mic' : 'monitor';
        const rawFbc = msg['fullBandCount'];
        const fullBandCount = typeof rawFbc === 'number' && Number.isInteger(rawFbc) && rawFbc > 0 && rawFbc <= 512
          ? rawFbc : undefined;
        audioStream?.destroy();
        audioStream = openAudioStream(source, (ctx) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'audio-bands', ...ctx }));
          }
        }, fullBandCount);
        audioOwnerWs = ws;
        void sendToDaemonWithRetry({ cmd: 'audio-hardware-start', style, source }, ++retryGen);
      } else if (type === 'audio-viz-setbands') {
        const rawBc = msg['bandCount'];
        const bandCount = typeof rawBc === 'number' && Number.isInteger(rawBc) && rawBc > 0 && rawBc <= 512 ? rawBc : 0;
        if (audioStream && !audioStream.destroyed) {
          audioStream.write(JSON.stringify({ cmd: 'audio-viz-setbands', bandCount }) + '\n');
        }
      } else if (type === 'audio-viz-stop') {
        audioStream?.destroy();
        audioStream = null;
        if (audioOwnerWs === ws) {
          audioOwnerWs = null;
          sendToDaemon({ cmd: 'audio-hardware-stop' }).catch(() => {});
        }
      } else if (type === 'hud-audio-bands-subscribe') {
        // Stream FFT bands to browser without affecting hardware (HUD manages audio internally)
        const source = msg['source'] === 'mic' ? 'mic' : 'monitor';
        audioStream?.destroy();
        audioStream = openAudioStream(source, (ctx) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'audio-bands', ...ctx }));
        });
      } else if (type === 'hud-audio-bands-unsubscribe') {
        audioStream?.destroy();
        audioStream = null;
      } else if (type === 'data-stats-start') {
        if (!dataStatsActive) { dataStatsActive = true; startDataStats(ws); }
      } else if (type === 'data-stats-stop') {
        if (dataStatsActive) { dataStatsActive = false; stopDataStats(ws); }
      } else if (type === 'hud-mode-start') {
        hudOwnerWs = ws;
        const leftFace         = typeof msg['leftFace']         === 'string' ? msg['leftFace']         : undefined;
        const leftWidget       = typeof msg['leftWidget']       === 'string' ? msg['leftWidget']       : undefined;
        const leftDataStyle    = typeof msg['leftDataStyle']    === 'string' ? msg['leftDataStyle']    : undefined;
        const leftAudioStyle   = typeof msg['leftAudioStyle']   === 'string' ? msg['leftAudioStyle']   : undefined;
        const leftClaudeStyle  = typeof msg['leftClaudeStyle']  === 'string' ? msg['leftClaudeStyle']  : undefined;
        const rightFace        = typeof msg['rightFace']        === 'string' ? msg['rightFace']        : undefined;
        const rightWidget      = typeof msg['rightWidget']      === 'string' ? msg['rightWidget']      : undefined;
        const rightDataStyle   = typeof msg['rightDataStyle']   === 'string' ? msg['rightDataStyle']   : undefined;
        const rightAudioStyle  = typeof msg['rightAudioStyle']  === 'string' ? msg['rightAudioStyle']  : undefined;
        const rightClaudeStyle = typeof msg['rightClaudeStyle'] === 'string' ? msg['rightClaudeStyle'] : undefined;
        if (leftFace || leftWidget || rightFace || rightWidget) {
          sendToDaemon({ cmd: 'hud-config', leftFace, leftWidget, leftDataStyle, leftAudioStyle, leftClaudeStyle, rightFace, rightWidget, rightDataStyle, rightAudioStyle, rightClaudeStyle }).catch(() => {});
        }
        sendToDaemon({ cmd: 'hud-hardware-start' }).catch(() => {});
      } else if (type === 'hud-config') {
        const leftFace               = typeof msg['leftFace']               === 'string' ? msg['leftFace']               : undefined;
        const leftWidget             = typeof msg['leftWidget']             === 'string' ? msg['leftWidget']             : undefined;
        const leftDataStyle          = typeof msg['leftDataStyle']          === 'string' ? msg['leftDataStyle']          : undefined;
        const leftAudioStyle         = typeof msg['leftAudioStyle']         === 'string' ? msg['leftAudioStyle']         : undefined;
        const leftClaudeStyle        = typeof msg['leftClaudeStyle']        === 'string' ? msg['leftClaudeStyle']        : undefined;
        const leftFile               = typeof msg['leftFile']               === 'string' ? msg['leftFile']               : undefined;
        const leftBiomeName          = typeof msg['leftBiomeName']          === 'string' ? msg['leftBiomeName']          : undefined;
        const leftRandomIntervalMs   = typeof msg['leftRandomIntervalMs']   === 'number' ? Math.max(5000, Math.min(3_600_000, msg['leftRandomIntervalMs']))  : undefined;
        const rightFace              = typeof msg['rightFace']              === 'string' ? msg['rightFace']              : undefined;
        const rightWidget            = typeof msg['rightWidget']            === 'string' ? msg['rightWidget']            : undefined;
        const rightDataStyle         = typeof msg['rightDataStyle']         === 'string' ? msg['rightDataStyle']         : undefined;
        const rightAudioStyle        = typeof msg['rightAudioStyle']        === 'string' ? msg['rightAudioStyle']        : undefined;
        const rightClaudeStyle       = typeof msg['rightClaudeStyle']       === 'string' ? msg['rightClaudeStyle']       : undefined;
        const rightFile              = typeof msg['rightFile']              === 'string' ? msg['rightFile']              : undefined;
        const rightBiomeName         = typeof msg['rightBiomeName']         === 'string' ? msg['rightBiomeName']         : undefined;
        const rightRandomIntervalMs  = typeof msg['rightRandomIntervalMs']  === 'number' ? Math.max(5000, Math.min(3_600_000, msg['rightRandomIntervalMs'])) : undefined;
        sendToDaemon({ cmd: 'hud-config', leftFace, leftWidget, leftDataStyle, leftAudioStyle, leftClaudeStyle, leftFile, leftBiomeName, leftRandomIntervalMs, rightFace, rightWidget, rightDataStyle, rightAudioStyle, rightClaudeStyle, rightFile, rightBiomeName, rightRandomIntervalMs }).catch(() => {});
      } else if (type === 'hud-presets-get') {
        void (async () => {
          try {
            const config = await loadConfig(configFilePath(configDir));
            const activeName = activeHudPresetName ?? config.active_hud_preset ?? null;
            ws.send(JSON.stringify({ type: 'hud-presets', presets: config.hud_presets ?? [], activeName }));
          } catch {
            ws.send(JSON.stringify({ type: 'hud-presets', presets: [], activeName: activeHudPresetName }));
          }
        })();
      } else if (type === 'hud-preset-save') {
        void (async () => {
          const parsed = ConfigSchema.shape.hud_presets.safeParse(msg['presets']);
          if (!parsed.success) {
            ws.send(JSON.stringify({ type: 'error', error: parsed.error.issues.map(i => i.message).join('; ') }));
            return;
          }
          const presets = parsed.data ?? [];
          try {
            const cfgPath = configFilePath(configDir);
            const config = await loadConfig(cfgPath);
            const updated = { ...config, hud_presets: presets };
            const tmp = cfgPath + '.tmp';
            await fs.writeFile(tmp, JSON.stringify(updated, null, 2) + '\n', { mode: 0o600 });
            await fs.rename(tmp, cfgPath);
            sendToDaemon({ cmd: 'reload' }).catch(() => {});
            ws.send(JSON.stringify({ type: 'hud-presets-saved' }));
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', error: String(err) }));
          }
        })();
      } else if (type === 'hud-preset-activate') {
        const name = msg['name'];
        if (typeof name !== 'string' || !name) {
          ws.send(JSON.stringify({ type: 'error', error: 'invalid payload' }));
        } else {
          void (async () => {
            try {
              const reply = await sendToDaemon({ cmd: 'hud-preset', name }) as { ok?: boolean; name?: string; error?: string };
              if (reply.ok) {
                activeHudPresetName = reply.name ?? name;
                // Persist so daemon and UI survive restarts
                const cfgPath = configFilePath(configDir);
                const cfg = await loadConfig(cfgPath);
                if (!cfg.hud_presets?.some(p => p.name === activeHudPresetName)) {
                  ws.send(JSON.stringify({ type: 'error', error: 'preset not found' }));
                  return;
                }
                ws.send(JSON.stringify({ type: 'hud-preset-activated', name: activeHudPresetName }));
                const tmp = cfgPath + '.tmp';
                await fs.writeFile(tmp, JSON.stringify({ ...cfg, active_hud_preset: activeHudPresetName }, null, 2) + '\n', { mode: 0o600 });
                await fs.rename(tmp, cfgPath);
              } else {
                ws.send(JSON.stringify({ type: 'error', error: reply.error ?? 'activation failed' }));
              }
            } catch (err) {
              ws.send(JSON.stringify({ type: 'error', error: String(err) }));
            }
          })();
        }
      } else if (type === 'biome-presets-get') {
        void (async () => {
          try {
            const config = await loadConfig(configFilePath(configDir));
            ws.send(JSON.stringify({ type: 'biome-presets', presets: config.biome_presets ?? [] }));
          } catch {
            ws.send(JSON.stringify({ type: 'biome-presets', presets: [] }));
          }
        })();
      } else if (type === 'biome-preset-save') {
        void (async () => {
          const parsed = ConfigSchema.shape.biome_presets.safeParse(msg['presets']);
          if (!parsed.success) {
            ws.send(JSON.stringify({ type: 'error', error: parsed.error.issues.map(i => i.message).join('; ') }));
            return;
          }
          const presets = parsed.data ?? [];
          try {
            const cfgPath = configFilePath(configDir);
            const config = await loadConfig(cfgPath);
            const updated = { ...config, biome_presets: presets };
            const tmp = cfgPath + '.tmp';
            await fs.writeFile(tmp, JSON.stringify(updated, null, 2) + '\n', { mode: 0o600 });
            await fs.rename(tmp, cfgPath);
            ws.send(JSON.stringify({ type: 'biome-presets-saved' }));
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', error: String(err) }));
          }
        })();
      } else if (type === 'life-mode-stop') {
        sendToDaemon({ cmd: 'life-hardware-stop' }).catch(() => {});
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
