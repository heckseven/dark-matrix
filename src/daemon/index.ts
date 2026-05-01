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
import type { DisplayIntent } from '../lib/dispatcher.js';

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

  function startIdleAnimation() {
    stopAnim();
    const idleName = currentConfig.daemon.idle_animation;
    if (idleName === 'none') return;

    if (idleName === 'scroll') {
      const text = currentConfig.startup.scroll_text;
      const anim = createScrollAnimation({ text, loop: true });
      const lefts: (() => void)[] = [];
      const rights: (() => void)[] = [];
      const { left, right } = currentConfig.modules;
      if (left) {
        // Drive left module with left frame of scroll pair
        const leftAnim = scrollHalf(anim, 'left');
        lefts.push(runAnimation(leftAnim, { transport, devicePath: left, mode: 'bw' }));
      }
      if (right) {
        const rightAnim = scrollHalf(anim, 'right');
        rights.push(runAnimation(rightAnim, { transport, devicePath: right, mode: 'bw' }));
      }
      stopCurrentAnim = () => { lefts.forEach(f => f()); rights.forEach(f => f()); anim.stop(); };
      return;
    }

    // Default: startup animation on each module
    for (const dev of getModulePaths()) {
      const anim = createStartupAnimation({ style: 'wipe' });
      const stop = runAnimation(anim, { transport, devicePath: dev, mode: 'bw' });
      const prev = stopCurrentAnim;
      stopCurrentAnim = () => { stop(); prev?.(); };
    }
  }

  function startNotificationAnimation(intent: DisplayIntent) {
    stopAnim();
    if (idleTimer) clearTimeout(idleTimer);

    // Show content as a short scroll across both modules
    const anim = createScrollAnimation({ text: intent.content, loop: false });
    const stopsLeft: (() => void)[] = [];
    const stopsRight: (() => void)[] = [];
    const { left, right } = currentConfig.modules;
    if (left) stopsLeft.push(runAnimation(scrollHalf(anim, 'left'), { transport, devicePath: left, mode: 'bw' }));
    if (right) stopsRight.push(runAnimation(scrollHalf(anim, 'right'), { transport, devicePath: right, mode: 'bw' }));
    stopCurrentAnim = () => { stopsLeft.forEach(f => f()); stopsRight.forEach(f => f()); anim.stop(); };

    // After notification expires, resume idle
    const remaining = intent.expiresAt - Date.now();
    setTimeout(() => {
      if (!dispatcher.current()) startIdleTimer();
    }, Math.max(0, remaining));
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
  const disposeBrightness = startBrightnessLoop(currentConfig, async (pct) => {
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
            default:
              socket.write(JSON.stringify({ ok: false, error: 'unknown command' }) + '\n');
          }
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(sockPath, resolve);
    server.once('error', reject);
  });

  await fs.chmod(sockPath, 0o600);

  const disposeWatch = watchConfig((cfg) => {
    currentConfig = cfg;
  });

  // Run startup animation on each module
  for (const dev of getModulePaths()) {
    const anim = createStartupAnimation({ style: currentConfig.startup.animation === 'none' ? 'wipe' : 'wipe' });
    runAnimation(anim, { transport, devicePath: dev, mode: 'bw' });
  }

  startIdleTimer();

  process.stderr.write(`dark-matrix daemon started, socket: ${sockPath}\n`);

  const cleanup = async () => {
    stopAnim();
    if (idleTimer) clearTimeout(idleTimer);
    disposeDispatcher();
    disposeWatch();
    disposeBrightness();
    disposeWatches.forEach(d => d());
    await transport.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { await fs.unlink(sockPath); } catch { /* already gone */ }
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

// Wrap a ScrollAnimation to yield only the left or right Frame half.
function scrollHalf(anim: ReturnType<typeof createScrollAnimation>, side: 'left' | 'right') {
  return {
    [Symbol.asyncIterator]() {
      const iter = anim[Symbol.asyncIterator]();
      return {
        async next() {
          const r = await iter.next();
          if (r.done) return { value: undefined as never, done: true as const };
          const frame = side === 'left' ? r.value[0] : r.value[1];
          return { value: frame, done: false as const };
        },
      };
    },
    stop() { anim.stop(); },
  };
}

// Run when invoked directly
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  startDaemon().catch((err) => {
    process.stderr.write(`dark-matrix: fatal: ${err}\n`);
    process.exit(1);
  });
}
