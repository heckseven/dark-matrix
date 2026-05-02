import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';
import { loadConfig, writeDefaultConfig, watchConfig } from '../lib/config.js';
import type { Config } from '../lib/config.js';
import { startBrightnessLoop } from '../lib/brightness.js';
import { watchSwitches } from '../lib/ec-switches.js';
import { watchVms } from '../lib/vm-source.js';
import { parseClaudeHook } from '../lib/claude-source.js';
import { Dispatcher, ecSwitchIntent, vmIntent, claudeIntent } from '../lib/dispatcher.js';
import { SerialTransport } from '../lib/transport.js';
import { runAnimation } from '../lib/animation.js';
import { createStartupAnimation } from '../animations/startup.js';
import { createScrollAnimation } from '../animations/scroll.js';
import { createGolAnimation } from '../animations/gol.js';
import type { DisplayIntent } from '../lib/dispatcher.js';

const SCROLL_MAX_LEN = 120;

export function socketPath(): string {
  return process.env['DARK_MATRIX_SOCKET']
    ?? `/run/user/${process.getuid!()}/dark-matrix.sock`;
}

// Parse a raw HTTP POST /hook request body from a buffer.
// Returns the body string if found, null if not HTTP or incomplete.
function extractHttpBody(data: string): string | null {
  if (!data.startsWith('POST')) return null;
  const sep = data.indexOf('\r\n\r\n');
  if (sep === -1) return null;
  return data.slice(sep + 4);
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
  const transport = new SerialTransport();
  const dispatcher = new Dispatcher();
  let stopCurrentAnim: (() => void) | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastClaudeEventAt: number | null = null;

  function getModulePaths(): string[] {
    const { left, right } = currentConfig.modules;
    return [left, right].filter(Boolean) as string[];
  }

  // Hot-plug: track which devices were last seen as available.
  const deviceAvailable = new Map<string, boolean>();

  // Pre-populate so devices present at startup aren't treated as reconnects.
  for (const dev of getModulePaths()) {
    let available = false;
    try { await fs.access(dev); available = true; } catch { /* unavailable */ }
    deviceAvailable.set(dev, available);
  }

  async function pollModules() {
    for (const dev of getModulePaths()) {
      let available = false;
      try { await fs.access(dev); available = true; } catch { /* unavailable */ }
      const prev = deviceAvailable.get(dev) ?? false;
      if (available && !prev) {
        process.stderr.write(`dark-matrix: module reconnected: ${dev}\n`);
        const anim = createStartupAnimation({ style: 'wipe' });
        runAnimation(anim, { transport, devicePath: dev, mode: 'bw' });
      }
      deviceAvailable.set(dev, available);
    }
  }

  const hotPlugInterval = setInterval(() => { void pollModules(); }, 500);
  const gcInterval = setInterval(() => { dispatcher.gc(); }, 60_000);

  async function setBrightness(pct: number) {
    for (const dev of getModulePaths()) {
      try {
        await transport.brightness(dev, pct);
      } catch {
        // device may be unavailable — non-fatal
      }
    }
  }

  function stopAnim() {
    if (stopCurrentAnim) { stopCurrentAnim(); stopCurrentAnim = null; }
  }

  function startIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    const idleMs = currentConfig.daemon.idle_after_ms;
    idleTimer = setTimeout(() => startIdleAnimation(), idleMs);
  }

  function runOnModules(anim: ReturnType<typeof createScrollAnimation> | null, singleAnim?: () => ReturnType<typeof createGolAnimation>) {
    if (anim) {
      stopCurrentAnim = runScrollOnModules(anim);
      return;
    }
    if (singleAnim) {
      const stops: Array<() => void> = [];
      for (const dev of getModulePaths()) {
        stops.push(runAnimation(singleAnim(), { transport, devicePath: dev, mode: 'bw' }));
      }
      stopCurrentAnim = () => stops.forEach(f => f());
    }
  }

  function runScrollOnModules(anim: ReturnType<typeof createScrollAnimation>): () => void {
    const { left, right } = currentConfig.modules;
    const fps = 20;
    const frameMs = 1000 / fps;
    let stopped = false;
    const iter = anim[Symbol.asyncIterator]();

    const loop = async () => {
      const { packBW } = await import('../lib/frame.js');
      let nextAt = Date.now();
      while (!stopped) {
        const result = await iter.next();
        if (result.done || stopped) break;
        const [leftFrame, rightFrame] = result.value;
        try { if (left) await transport.frameBw(packBW(leftFrame), left); } catch { /* non-fatal */ }
        try { if (right) await transport.frameBw(packBW(rightFrame), right); } catch { /* non-fatal */ }
        nextAt += frameMs;
        const wait = nextAt - Date.now();
        if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
      }
      if (left) await transport.release(left).catch(() => {});
      if (right) await transport.release(right).catch(() => {});
    };

    void loop();
    return () => { stopped = true; anim.stop(); };
  }

  function startIdleAnimation() {
    stopAnim();
    const idleName = currentConfig.daemon.idle_animation;
    if (idleName === 'none') return;

    if (idleName === 'scroll') {
      const text = currentConfig.startup.scroll_text;
      runOnModules(createScrollAnimation({ text, loop: true }));
      return;
    }

    // gol-random (default)
    runOnModules(null, () => createGolAnimation());
  }

  function startNotificationAnimation(intent: DisplayIntent) {
    stopAnim();
    if (idleTimer) clearTimeout(idleTimer);

    // Sanitize content: printable ASCII only, max SCROLL_MAX_LEN chars
    const safe = intent.content
      .replace(/[^\x20-\x7e]/g, '')
      .slice(0, SCROLL_MAX_LEN);
    const text = safe.length > 0 ? safe : '???';

    runOnModules(createScrollAnimation({ text, loop: false }));

    // After notification expires, resume idle
    setTimeout(() => {
      if (!dispatcher.current()) startIdleTimer();
    }, Math.max(0, intent.expiresAt - Date.now()));
  }

  const disposeDispatcher = dispatcher.onChange((intent) => {
    if (intent) {
      startNotificationAnimation(intent);
    } else {
      stopAnim();
      startIdleTimer();
    }
  });

  // Notification source watchers
  const disposeWatches: Array<() => void> = [];

  disposeWatches.push(watchSwitches((e) => {
    dispatcher.push(ecSwitchIntent(e));
  }, { intervalMs: 500 }));

  disposeWatches.push(watchVms((e) => {
    const intent = vmIntent(e);
    dispatcher.push(intent);
  }, { intervalMs: 2000 }));

  // Brightness loop
  let disposeBrightness = startBrightnessLoop(currentConfig, async (pct) => {
    currentBrightness = pct;
    await setBrightness(pct);
  });

  const sockPath = socketPath();
  const server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString();

      // HTTP POST /hook (Claude activity)
      const body = extractHttpBody(buf);
      if (body !== null) {
        const event = parseClaudeHook(body.trim());
        if (event) {
          lastClaudeEventAt = Date.now();
          const intent = claudeIntent(event);
          if (intent) dispatcher.push(intent);
        }
        socket.write('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok');
        socket.end();
        return;
      }

      // JSON-line CLI protocol
      if (buf.startsWith('{') || buf.startsWith('[')) {
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
            case 'release':
              stopAnim();
              transport.close().then(() => {
                socket.write(JSON.stringify({ ok: true }) + '\n');
              }).catch(() => {
                socket.write(JSON.stringify({ ok: true }) + '\n');
              });
              break;
            default:
              socket.write(JSON.stringify({ ok: false, error: 'unknown command' }) + '\n');
          }
        }
      }
    });
  });

  try { await fs.unlink(sockPath); } catch { /* no stale socket */ }

  await new Promise<void>((resolve, reject) => {
    server.listen(sockPath, resolve);
    server.once('error', reject);
  });

  await fs.chmod(sockPath, 0o600);

  const disposeWatch = watchConfig((cfg) => {
    currentConfig = cfg;
    disposeBrightness();
    disposeBrightness = startBrightnessLoop(currentConfig, async (pct) => {
      currentBrightness = pct;
      await setBrightness(pct);
    });
  });

  // Startup animation
  if (currentConfig.startup.animation !== 'none') {
    if (currentConfig.startup.animation === 'gol-random') {
      runOnModules(null, () => createGolAnimation({ frames: 420, loop: false }));
    } else if (currentConfig.startup.animation === 'scroll') {
      const text = currentConfig.startup.scroll_text;
      runOnModules(createScrollAnimation({ text, loop: false }));
    } else {
      runOnModules(null, () => createStartupAnimation({ style: 'wipe' }));
    }
  }

  startIdleTimer();

  process.stderr.write(`dark-matrix daemon started, socket: ${sockPath}\n`);

  const cleanup = async () => {
    stopAnim();
    if (idleTimer) clearTimeout(idleTimer);
    clearInterval(hotPlugInterval);
    clearInterval(gcInterval);
    disposeDispatcher();
    disposeWatch();
    disposeBrightness();
    disposeWatches.forEach(d => d());
    await transport.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { await fs.unlink(sockPath); } catch { /* already gone */ }
  };

  const sigterm = async () => { await cleanup(); process.exit(0); };
  const sigint = async () => { await cleanup(); process.exit(0); };
  const uncaught = async (err: unknown) => { await cleanup(); throw err; };

  process.once('SIGTERM', sigterm);
  process.once('SIGINT', sigint);
  process.once('uncaughtException', uncaught);

  return async () => {
    process.off('SIGTERM', sigterm);
    process.off('SIGINT', sigint);
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
