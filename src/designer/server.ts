import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { z } from 'zod';

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

  wss.on('connection', (ws: import('ws').WebSocket) => {
    ws.send(JSON.stringify({ type: 'connected' }));
    ws.on('message', (data: Buffer) => {
      try {
        JSON.parse(data.toString());
        // Phase 3 will handle preview commands here
      } catch {
        // ignore parse errors
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
        wss.close(() => {
          server.close((err) => err ? reject(err) : resolve());
        });
      });
    },
  };
}
