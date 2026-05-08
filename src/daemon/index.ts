import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { loadConfig, writeDefaultConfig, watchConfig } from '../lib/config.js';
import type { Config } from '../lib/config.js';
import { startBrightnessLoop } from '../lib/brightness.js';
import { watchSwitches } from '../lib/ec-switches.js';
import { watchVms } from '../lib/vm-source.js';
import { parseClaudeHook } from '../lib/claude-source.js';
import { Dispatcher, ecSwitchIntent, vmIntent } from '../lib/dispatcher.js';
import { SerialTransport } from '../lib/transport.js';
import { runAnimation } from '../lib/animation.js';
import { createStartupAnimation } from '../animations/startup.js';
import { createScrollAnimation } from '../animations/scroll.js';
import { createGolAnimation } from '../animations/gol.js';
import { createHeatmapState, bumpTool, tickHeatmap, renderHeatmap } from '../animations/heatmap.js';
import { createAudioEqAnimation } from '../animations/audio-eq.js';
import { createGifAnimation } from '../animations/gif.js';
import type { GifAnimation } from '../animations/gif.js';
import type { DisplayIntent } from '../lib/dispatcher.js';
import { packBW, FRAME_SIZE } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

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
  let frameHeld = false;
  const heatmapState = createHeatmapState();

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

  function runScrollOnModules(anim: ReturnType<typeof createScrollAnimation>, fps = 20): () => void {
    const { left, right } = currentConfig.modules;
    const frameMs = 1000 / fps;
    let stopped = false;
    const iter = anim[Symbol.asyncIterator]();

    const loop = async () => {
      const { packBW } = await import('../lib/frame.js');
      let nextAt = Date.now();
      let natural = false;
      while (!stopped) {
        const result = await iter.next();
        if (stopped) break;
        if (result.done) { natural = true; break; }
        const [leftFrame, rightFrame] = result.value;
        try { if (left) await transport.frameBw(packBW(leftFrame), left); } catch { /* non-fatal */ }
        try { if (right) await transport.frameBw(packBW(rightFrame), right); } catch { /* non-fatal */ }
        nextAt += frameMs;
        const wait = nextAt - Date.now();
        if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
      }
      // Only release on natural completion — force-stop means another animation
      // is already starting and will reuse the open ports.
      if (natural) {
        if (left) await transport.release(left).catch(() => {});
        if (right) await transport.release(right).catch(() => {});
      }
    };

    void loop();
    return () => { stopped = true; anim.stop(); };
  }

  function runHeatmapOnModules(): () => void {
    const { left, right } = currentConfig.modules;
    const fps = 15;
    const frameMs = 1000 / fps;
    let stopped = false;

    const loop = async () => {
      const { packBW } = await import('../lib/frame.js');
      let nextAt = Date.now();
      while (!stopped) {
        tickHeatmap(heatmapState);
        const [leftFrame, rightFrame] = renderHeatmap(heatmapState);
        try { if (left) await transport.frameBw(packBW(leftFrame), left); } catch { /* non-fatal */ }
        try { if (right) await transport.frameBw(packBW(rightFrame), right); } catch { /* non-fatal */ }
        nextAt += frameMs;
        const wait = nextAt - Date.now();
        if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
      }
      // No port release here — transport.close() handles it on shutdown.
      // Releasing here races with the next animation starting immediately.
    };

    void loop();
    return () => { stopped = true; };
  }


  async function resolveDefaultSinkId(): Promise<string | undefined> {
    return new Promise((resolve) => {
      const proc = spawn('wpctl', ['inspect', '@DEFAULT_AUDIO_SINK@'], { shell: false });
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.on('close', () => {
        const m = /^id (\d+)/.exec(out);
        resolve(m ? m[1] : undefined);
      });
      proc.on('error', () => resolve(undefined));
    });
  }

  function runAudioEqOnModules(): () => void {
    const { left, right } = currentConfig.modules;
    let stopped = false;
    let anim: ReturnType<typeof createAudioEqAnimation> | null = null;

    const loop = async () => {
      const { packBW, FRAME_COLS, FRAME_ROWS, createFrame } = await import('../lib/frame.js');
      const eqSource = currentConfig.daemon.idle_eq_source ?? 'monitor';
      const target = eqSource === 'monitor' ? await resolveDefaultSinkId() : undefined;
      if (stopped) return;
      anim = createAudioEqAnimation({ source: eqSource, ...(target ? { target } : {}) });
      const iter = anim[Symbol.asyncIterator]();
      while (!stopped) {
        const result = await iter.next();
        if (stopped || result.done) break;
        const leftFrame = result.value;
        // Mirror: right col 0 = left col 8, right col 1 = left col 7, ...
        const rightFrame = createFrame();
        for (let col = 0; col < FRAME_COLS; col++) {
          for (let row = 0; row < FRAME_ROWS; row++) {
            rightFrame[col * FRAME_ROWS + row] = leftFrame[(FRAME_COLS - 1 - col) * FRAME_ROWS + row] ?? 0;
          }
        }
        try { if (left) await transport.frameBw(packBW(leftFrame), left); } catch { /* non-fatal */ }
        try { if (right) await transport.frameBw(packBW(rightFrame), right); } catch { /* non-fatal */ }
      }
    };

    void loop();
    return () => { stopped = true; anim?.stop(); };
  }

  function startGifAnimation(gifPath: string, hold: boolean, dual: boolean, mode: 'bw' | 'gray' = 'gray'): void {
    stopAnim();
    if (idleTimer) clearTimeout(idleTimer);

    let stopped = false;
    stopCurrentAnim = () => { stopped = true; };

    void (async () => {
      const { packBW, FRAME_COLS, FRAME_ROWS, createFrame: mkFrame } = await import('../lib/frame.js');
      const sendFrame = mode === 'bw'
        ? async (f: Awaited<ReturnType<typeof mkFrame>>, dev: string) => transport.frameBw(packBW(f), dev)
        : async (f: Awaited<ReturnType<typeof mkFrame>>, dev: string) => transport.frameGray(f, dev);
      let anim: GifAnimation;
      try {
        anim = await createGifAnimation({ path: gifPath, loop: hold, dual, mode });
      } catch (err) {
        process.stderr.write(`dark-matrix: gif load failed: ${String(err)}\n`);
        if (!stopped && !hold) startIdleTimer();
        return;
      }
      if (stopped) return;
      stopCurrentAnim = () => { stopped = true; anim.stop(); };

      const { left, right } = currentConfig.modules;
      const iter = anim[Symbol.asyncIterator]();
      let frameIdx = 0;

      while (!stopped) {
        const result = await iter.next();
        if (stopped || result.done) break;
        const wide = result.value as unknown as Uint8Array;

        if (dual) {
          const leftFrame = mkFrame();
          const rightFrame = mkFrame();
          for (let col = 0; col < FRAME_COLS; col++) {
            for (let row = 0; row < FRAME_ROWS; row++) {
              leftFrame[col * FRAME_ROWS + row] = wide[col * FRAME_ROWS + row] ?? 0;
              rightFrame[col * FRAME_ROWS + row] = wide[(col + FRAME_COLS) * FRAME_ROWS + row] ?? 0;
            }
          }
          try { if (left) await sendFrame(leftFrame, left); } catch { /* non-fatal */ }
          try { if (right) await sendFrame(rightFrame, right); } catch { /* non-fatal */ }
        } else {
          const frame = result.value;
          try { if (left) await sendFrame(frame, left); } catch { /* non-fatal */ }
          try { if (right) await sendFrame(frame, right); } catch { /* non-fatal */ }
        }

        const delay = anim.delays[frameIdx % anim.delays.length] ?? 100;
        frameIdx++;
        if (delay > 0) await new Promise<void>(r => setTimeout(r, delay));
      }

      if (!stopped && !hold) startIdleTimer();
    })();
  }

  function startIdleAnimation() {
    stopAnim();
    const idleName = currentConfig.daemon.idle_animation;
    if (idleName === 'none') return;

    if (idleName === 'heatmap') {
      stopCurrentAnim = runHeatmapOnModules();
      return;
    }

    if (idleName === 'audio-eq') {
      stopCurrentAnim = runAudioEqOnModules();
      return;
    }

    if (idleName === 'scroll') {
      const text = currentConfig.startup.scroll_text;
      runOnModules(createScrollAnimation({ text, loop: true }));
      return;
    }

    if (idleName === 'gif') {
      const gifPath = currentConfig.daemon.idle_gif_path;
      if (!gifPath) {
        process.stderr.write('dark-matrix: idle_animation=gif but idle_gif_path not set\n');
        return;
      }
      const home = os.homedir();
      void fs.realpath(gifPath).then((resolved) => {
        if (!resolved.startsWith(home + '/') && resolved !== home) {
          process.stderr.write('dark-matrix: idle_gif_path outside home directory\n');
          return;
        }
        const mode = currentConfig.daemon.idle_gif_mode ?? 'gray';
        const dual = currentConfig.daemon.idle_gif_dual ?? false;
        startGifAnimation(resolved, true, dual, mode);
      }).catch(() => {
        process.stderr.write(`dark-matrix: idle_gif_path not found: ${gifPath}\n`);
      });
      return;
    }

    // gol-random
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

  let currentIntentId: string | null = null;
  const disposeDispatcher = dispatcher.onChange((intent) => {
    if (intent) {
      if (intent.id === currentIntentId) return;
      currentIntentId = intent.id;
      startNotificationAnimation(intent);
    } else {
      currentIntentId = null;
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
        if (event && event.type !== 'unknown') {
          const toolName = event.type === 'agent_spawn' ? 'Agent' : event.tool;
          bumpTool(heatmapState, toolName);
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
            case 'scroll': {
              const m = msg as { cmd: string; text?: string; hold?: boolean; size?: string; speed?: string };
              if (typeof m.text !== 'string' || m.text.trim() === '') {
                socket.write(JSON.stringify({ ok: false, error: 'text required' }) + '\n');
                break;
              }
              const safe = m.text.replace(/[^\x20-\x7e]/g, '').slice(0, SCROLL_MAX_LEN) || '???';
              const scrollSize = (['tiny','small','medium','large'] as const).find(s => s === m.size) ?? 'small';
              const speedPresets: Record<string, { fps: number; pixelsPerTick: number }> = {
                slow: { fps: 10, pixelsPerTick: 1 },
                normal: { fps: 20, pixelsPerTick: 1 },
                fast: { fps: 20, pixelsPerTick: 2 },
              };
              const { fps: scrollFps, pixelsPerTick } = speedPresets[m.speed ?? 'normal'] ?? speedPresets['normal']!;
              stopAnim();
              if (idleTimer) clearTimeout(idleTimer);
              const scrollAnim = createScrollAnimation({ text: safe, loop: !!m.hold, size: scrollSize, pixelsPerTick });
              stopCurrentAnim = runScrollOnModules(scrollAnim, scrollFps);
              if (!m.hold) {
                const dur = safe.length * 100 + 2000;
                setTimeout(() => { if (!dispatcher.current()) startIdleTimer(); }, dur);
              }
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'animate': {
              const m = msg as { cmd: string; type?: string; path?: string; hold?: boolean; dual?: boolean; mode?: string };
              if (m.type !== 'gif' || typeof m.path !== 'string' || !/\.gif$/i.test(m.path)) {
                socket.write(JSON.stringify({ ok: false, error: 'expected type:gif and a .gif path' }) + '\n');
                break;
              }
              const gifMode = m.mode === 'bw' ? 'bw' : 'gray';
              startGifAnimation(m.path, !!m.hold, !!m.dual, gifMode);
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'frame': {
              const m = msg as { cmd: string; left?: string; right?: string; mode?: string };
              const mode = m.mode === 'gray' ? 'gray' : 'bw';
              stopAnim();
              if (idleTimer) clearTimeout(idleTimer);
              frameHeld = true;
              const pairs: Array<[string | undefined, string | undefined]> = [
                [m.left, currentConfig.modules.left],
                [m.right, currentConfig.modules.right],
              ];
              let validationError: string | null = null;
              for (const [b64] of pairs) {
                if (b64 === undefined) continue;
                const buf = Buffer.from(b64, 'base64');
                if (buf.length !== FRAME_SIZE) { validationError = 'invalid frame length'; break; }
              }
              if (validationError) {
                socket.write(JSON.stringify({ ok: false, error: validationError }) + '\n');
                break;
              }
              void (async () => {
                for (const [b64, dev] of pairs) {
                  if (b64 === undefined || !dev) continue;
                  const frame = new Uint8Array(Buffer.from(b64, 'base64')) as Frame;
                  if (mode === 'bw') {
                    transport.liveFrameBw(packBW(frame), dev).catch(() => {});
                  } else {
                    transport.liveFrameGray(frame, dev).catch(() => {});
                  }
                }
              })();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'frame-stop':
              frameHeld = false;
              startIdleTimer();
              socket.write(JSON.stringify({ ok: true }) + '\n');
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
