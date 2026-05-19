import net from 'node:net';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { loadConfig, writeDefaultConfig, watchConfig } from '../lib/config.js';
import type { Config } from '../lib/config.js';
import { startBrightnessLoop } from '../lib/brightness.js';
import { watchSwitches } from '../lib/ec-switches.js';
import { watchVms } from '../lib/vm-source.js';
import { parseClaudeHook } from '../lib/claude-source.js';
import { parseProject, base64ToFrame } from '../designer/format.js';
import type { DmxProject } from '../designer/format.js';
import { watchDesktopNotifications } from '../lib/dbus-notifications.js';
import { watchMic } from '../lib/mic-source.js';
import { Dispatcher, ecSwitchIntent, vmIntent, notificationIntent } from '../lib/dispatcher.js';
import { routeNotification } from '../lib/notification-routing.js';
import { SerialTransport } from '../lib/transport.js';
import { runAnimation } from '../lib/animation.js';
import { createStartupAnimation } from '../animations/startup.js';
import { createScrollAnimation } from '../animations/scroll.js';
import { createGolAnimation } from '../animations/gol.js';
import { createHeatmapState, bumpTool, tickHeatmap, renderHeatmap } from '../animations/heatmap.js';
import { createAudioEqAnimation, createAudioBandStream } from '../animations/audio-eq.js';
import type { AudioSource } from '../animations/audio-eq.js';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../animations/audio-renderers.js';
import type { AudioStyle } from '../animations/audio-renderers.js';
import { createClockRenderer, isClockFace } from '../animations/clock-renderers.js';
import { createDataRenderer } from '../animations/data-renderers.js';
import { DATA_STYLES } from '../animations/data-renderers.js';
import type { DataStyle, DataWidgetConfig, DataRenderer } from '../animations/data-renderers.js';
import { watchProcStats } from '../lib/proc-source.js';
import { createPresetTriggerEngine } from '../lib/preset-triggers.js';
import { createGifAnimation } from '../animations/gif.js';
import type { GifAnimation } from '../animations/gif.js';
import type { DisplayIntent } from '../lib/dispatcher.js';
import { packBW, FRAME_SIZE, FRAME_COLS, FRAME_ROWS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import { composeFrames } from '../lib/compositor.js';
import type { NotifyOverlay } from '../lib/compositor.js';
import { loadNotificationAsset } from '../lib/notification-assets.js';

const SCROLL_MAX_LEN = 120;
const MAX_NOTIFY_DURATION_MS = 30_000;

let activeOverlay: NotifyOverlay | null = null;
export function setActiveOverlay(o: NotifyOverlay | null): void { activeOverlay = o; }

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

  // Pre-populate currentConfig.hud from active_hud_preset so runHudOnModules
  // uses the right widgets even before the designer sends a hud-config message.
  if (currentConfig.active_hud_preset) {
    const activePreset = (currentConfig.hud_presets ?? []).find(p => p.name === currentConfig.active_hud_preset);
    if (activePreset) currentConfig = { ...currentConfig, hud: { left: activePreset.left, right: activePreset.right } };
  }

  let currentBrightness = 0;
  const transport = new SerialTransport();
  const dispatcher = new Dispatcher();
  let stopCurrentAnim: (() => void) | null = null;
  let stopCurrentOverlay: (() => void) | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hudHardwareActive = false;
  let hudAudioStreaming = false;
  let hudAudioSource: 'monitor' | 'mic' = 'monitor';
  let frameHeldLeft = false;
  let frameHeldRight = false;
  // Shared band listeners: audio-viz sockets subscribe here when HUD loop owns audio
  const hudAudioListeners = new Map<symbol, (ctx: { bands: number[]; fftSize: number; gain: number }) => void>();
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
    triggerEngine.notifyActive();
    const idleMs = currentConfig.daemon.idle_after_ms;
    idleTimer = setTimeout(() => startIdleAnimation(), idleMs);
  }

  function resumeAfterInterrupt() {
    frameHeldLeft = false;
    frameHeldRight = false;
    if (hudHardwareActive || currentConfig.hud) {
      stopAnim();
      stopCurrentAnim = runHudOnModules();
    } else {
      startIdleAnimation();
    }
  }

  function stopOverlay(): void {
    if (stopCurrentOverlay) { stopCurrentOverlay(); stopCurrentOverlay = null; }
  }

  function cropToBottomStrip(frame: Frame, stripRows: number): Frame {
    const out = new Uint8Array(FRAME_SIZE) as unknown as Frame;
    const startRow = FRAME_ROWS - stripRows;
    for (let col = 0; col < FRAME_COLS; col++) {
      for (let row = startRow; row < FRAME_ROWS; row++) {
        out[col * FRAME_ROWS + row] = frame[col * FRAME_ROWS + row] ?? 0;
      }
    }
    return out;
  }

  function runOnModules(anim: ReturnType<typeof createScrollAnimation> | null, singleAnim?: () => ReturnType<typeof createGolAnimation>, onComplete?: () => void) {
    if (anim) {
      stopCurrentAnim = runScrollOnModules(anim, 20, onComplete);
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

  function runScrollOnModules(anim: ReturnType<typeof createScrollAnimation>, fps = 20, onComplete?: () => void): () => void {
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
        const [cl, cr] = composeFrames([leftFrame, rightFrame], activeOverlay);
        try { if (left) await transport.frameBw(packBW(cl), left); } catch { /* non-fatal */ }
        try { if (right) await transport.frameBw(packBW(cr), right); } catch { /* non-fatal */ }
        nextAt += frameMs;
        const wait = nextAt - Date.now();
        if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
      }
      // Only release on natural completion — force-stop means another animation
      // is already starting and will reuse the open ports.
      if (natural) {
        if (left) await transport.release(left).catch(() => {});
        if (right) await transport.release(right).catch(() => {});
        onComplete?.();
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
        const [hcl, hcr] = composeFrames([leftFrame, rightFrame] as [Frame, Frame], activeOverlay);
        try { if (left) await transport.frameBw(packBW(hcl), left); } catch { /* non-fatal */ }
        try { if (right) await transport.frameBw(packBW(hcr), right); } catch { /* non-fatal */ }
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


  async function resolveDefaultDeviceId(
    role: '@DEFAULT_AUDIO_SINK@' | '@DEFAULT_AUDIO_SOURCE@',
  ): Promise<string | undefined> {
    return new Promise((resolve) => {
      const proc = spawn('wpctl', ['inspect', role], { shell: false });
      let out = '';
      let settled = false;
      const settle = (v: string | undefined) => { if (!settled) { settled = true; resolve(v); } };
      const timeout = setTimeout(() => { proc.kill(); settle(undefined); }, 2000);
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.on('close', () => {
        clearTimeout(timeout);
        if (settled) return;
        if (role === '@DEFAULT_AUDIO_SINK@') {
          // Use node name + .monitor to capture playback; node names are stable
          // across WirePlumber graph rebuilds, unlike numeric node IDs.
          const m = /node\.name\s*=\s*"([^"]+)"/.exec(out);
          const name = m?.[1];
          settle(name && /^[\w.\-]+$/.test(name) ? `${name}.monitor` : undefined);
        } else {
          // Source IDs: numeric ID is stable enough — sinks are more aggressively
          // reassigned by WirePlumber due to monitor stream teardown.
          const m = /^id (\d+)/.exec(out);
          settle(m ? m[1] : undefined);
        }
      });
      proc.on('error', () => { clearTimeout(timeout); settle(undefined); });
    });
  }


  // Bayer 4×4 ordered dithering — maps 0-255 grayscale to binary in-place.
  // Operates at serial-frame speed, so uses simple array indexing.
  const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;
  function ditherBW(f: import('../lib/frame.js').Frame, cols: number, rows: number): void {
    for (let col = 0; col < cols; col++)
      for (let row = 0; row < rows; row++) {
        const t = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
        f[col * rows + row] = (f[col * rows + row] ?? 0) > t ? 255 : 0;
      }
  }

  function runAudioEqOnModules(sourceOverride?: AudioSource, style: AudioStyle = 'dark-matter'): () => void {
    const { left, right } = currentConfig.modules;
    let stopped = false;
    let anim: ReturnType<typeof createAudioEqAnimation> | null = null;

    const loop = async () => {
      const { packBW, FRAME_COLS, FRAME_ROWS, createFrame } = await import('../lib/frame.js');
      const eqSource = sourceOverride ?? currentConfig.daemon.idle_eq_source ?? 'monitor';
      const target = await resolveDefaultDeviceId(
        eqSource === 'monitor' ? '@DEFAULT_AUDIO_SINK@' : '@DEFAULT_AUDIO_SOURCE@',
      );
      if (stopped) return;
      anim = createAudioEqAnimation({ source: eqSource, style, ...(target ? { target } : {}) });
      const iter = anim[Symbol.asyncIterator]();
      while (!stopped) {
        const result = await iter.next();
        if (stopped || result.done) break;
        const leftFrame = result.value;
        ditherBW(leftFrame, FRAME_COLS, FRAME_ROWS);
        // Mirror: right col 0 = left col 8, right col 1 = left col 7, ...
        const rightFrame = createFrame();
        for (let col = 0; col < FRAME_COLS; col++) {
          for (let row = 0; row < FRAME_ROWS; row++) {
            rightFrame[col * FRAME_ROWS + row] = leftFrame[(FRAME_COLS - 1 - col) * FRAME_ROWS + row] ?? 0;
          }
        }
        const [acl, acr] = composeFrames([leftFrame, rightFrame], activeOverlay);
        try { if (left) await transport.frameBw(packBW(acl), left); } catch { /* non-fatal */ }
        try { if (right) await transport.frameBw(packBW(acr), right); } catch { /* non-fatal */ }
      }
    };

    void loop();
    return () => { stopped = true; anim?.stop(); };
  }

  function applyPreset(preset: import('../lib/config.js').HudPreset): void {
    currentConfig = { ...currentConfig, hud: { left: preset.left, right: preset.right } };
    if (hudHardwareActive || currentConfig.daemon.idle_animation === 'hud') {
      stopCurrentAnim?.();
      stopCurrentAnim = runHudOnModules();
    }
  }

  function hudDataConfig(side: 'left' | 'right'): DataWidgetConfig {
    const w = side === 'left' ? currentConfig.hud?.left : currentConfig.hud?.right;
    if (w?.widget !== 'data') return {};
    const cfg: DataWidgetConfig = {};
    if (w.style)        cfg.style       = w.style;
    if (w.top_left)     cfg.topLeft     = w.top_left;
    if (w.top_right)    cfg.topRight    = w.top_right;
    if (w.bottom_left)  cfg.bottomLeft  = w.bottom_left;
    if (w.bottom_right) cfg.bottomRight = w.bottom_right;
    return cfg;
  }

  type AudioCtxData = { bands: number[]; fftSize: number; gain: number };

  interface WidgetRenderer {
    render(now: Date, audioCtx: AudioCtxData | null): Frame;
    stop(): void;
  }

  function createWidgetRenderer(
    widget: NonNullable<NonNullable<Config['hud']>['left']>,
    side: 'left' | 'right',
    procDataRendererRef: { renderer: DataRenderer | null },
  ): WidgetRenderer {
    switch (widget.widget) {
      case 'clock': {
        const face = widget.face ?? 'elegant';
        const clockRenderer = createClockRenderer(face);
        return {
          render(now, audioCtx) {
            const base = audioCtx ? { now, ...audioCtx } : { now };
            return clockRenderer({ ...base, side });
          },
          stop() { /* stateless */ },
        };
      }
      case 'data': {
        const dataRenderer = createDataRenderer(
          side === 'left' ? hudDataConfig('left') : hudDataConfig('right'),
        );
        procDataRendererRef.renderer = dataRenderer;
        return {
          render(_now, _audioCtx) { return dataRenderer.render(); },
          stop() { /* no cleanup needed */ },
        };
      }
      case 'heatmap': {
        return {
          render(_now, _audioCtx) {
            const [lf, rf] = renderHeatmap(heatmapState);
            return side === 'left' ? lf! : rf!;
          },
          stop() { /* stateless */ },
        };
      }
      case 'audio': {
        const style = widget.style ?? 'dark-matter';
        const audioRenderer = createAudioRenderer(style);
        return {
          render(_now, audioCtx) {
            const ctx = audioCtx ?? { bands: new Array(9).fill(0) as number[], fftSize: 2048, gain: 1.0 };
            const raw = audioRenderer(ctx);
            if (side === 'right') {
              const mirrored = new Uint8Array(raw.length);
              for (let col = 0; col < FRAME_COLS; col++) {
                const src = FRAME_COLS - 1 - col;
                for (let row = 0; row < FRAME_ROWS; row++) {
                  mirrored[col * FRAME_ROWS + row] = raw[src * FRAME_ROWS + row] ?? 0;
                }
              }
              return mirrored as Frame;
            }
            return raw;
          },
          stop() { /* stateless */ },
        };
      }
      case 'image': {
        const assetsDir = path.join(os.homedir(), '.config', 'dark-matrix', 'assets');
        const resolved = path.resolve(assetsDir, widget.file);
        if (!resolved.startsWith(assetsDir + path.sep)) {
          throw new Error(`invalid asset path: ${widget.file}`);
        }
        let project: DmxProject;
        try {
          project = parseProject(readFileSync(resolved, 'utf-8'));
        } catch (err) {
          console.error(`[image renderer] failed to load ${widget.file}:`, err);
          const empty = new Uint8Array(FRAME_COLS * FRAME_ROWS) as unknown as Frame;
          return { render: () => empty, stop() {} };
        }
        const width = project.width;
        const bytesPerFrame = width * FRAME_ROWS;
        const frames: Uint8Array[] = project.frames.map(f => base64ToFrame(f.pixels, bytesPerFrame));
        const speed = widget.speed ?? 1;
        const delays = project.frames.map(f => Math.round(f.delayMs / speed));
        const loop = widget.loop ?? project.loop;

        let frameIdx = 0;
        let elapsed = 0;
        let lastTick: number | null = null;

        return {
          render(now, _audioCtx) {
            const nowMs = now.getTime();
            if (lastTick !== null) elapsed += nowMs - lastTick;
            lastTick = nowMs;

            while (elapsed >= (delays[frameIdx] ?? 100)) {
              elapsed -= delays[frameIdx] ?? 100;
              if (frameIdx < frames.length - 1) {
                frameIdx++;
              } else if (loop) {
                frameIdx = 0;
              }
              // if !loop, stay on last frame
            }

            const raw = frames[frameIdx]!;

            if (width === 18) {
              const half = new Uint8Array(FRAME_COLS * FRAME_ROWS);
              const colOffset = side === 'left' ? 0 : FRAME_COLS;
              for (let col = 0; col < FRAME_COLS; col++) {
                for (let row = 0; row < FRAME_ROWS; row++) {
                  half[col * FRAME_ROWS + row] = raw[(col + colOffset) * FRAME_ROWS + row] ?? 0;
                }
              }
              return half as unknown as Frame;
            }

            return raw as unknown as Frame;
          },
          stop() { /* nothing to clean up */ },
        };
      }
      default: {
        const _exhaustive: never = widget;
        void _exhaustive;
        return createWidgetRenderer({ widget: 'clock', face: 'elegant' }, side, procDataRendererRef);
      }
    }
  }

  function runHudOnModules(): () => void {
    const { left, right } = currentConfig.modules;
    let stopped = false;

    const defaultClock = { widget: 'clock', face: 'elegant' } as const;
    const leftHudWidget  = currentConfig.hud?.left  ?? defaultClock;
    const rightHudWidget = currentConfig.hud?.right ?? defaultClock;

    const leftProcRef:  { renderer: DataRenderer | null } = { renderer: null };
    const rightProcRef: { renderer: DataRenderer | null } = { renderer: null };

    const leftRenderer  = createWidgetRenderer(leftHudWidget,  'left',  leftProcRef);
    const rightRenderer = createWidgetRenderer(rightHudWidget, 'right', rightProcRef);

    const needsProc = leftHudWidget.widget === 'data' || rightHudWidget.widget === 'data';
    const stopProc = needsProc
      ? watchProcStats((stats) => {
          leftProcRef.renderer?.update(stats);
          rightProcRef.renderer?.update(stats);
        })
      : null;

    const needsHeatmap = leftHudWidget.widget === 'heatmap' || rightHudWidget.widget === 'heatmap';

    const leftClockFace  = leftHudWidget.widget  === 'clock' ? leftHudWidget.face  : 'elegant';
    const rightClockFace = rightHudWidget.widget === 'clock' ? rightHudWidget.face : 'elegant';
    const needsAudio = leftClockFace === 'binary-audio' || rightClockFace === 'binary-audio'
      || leftHudWidget.widget === 'audio' || rightHudWidget.widget === 'audio';
    if (needsAudio) hudAudioStreaming = true;

    let audioCtx: AudioCtxData | null = null;
    const stopAudio = needsAudio
      ? streamAudioBands(hudAudioSource, (ctx) => {
          audioCtx = ctx;
          for (const cb of hudAudioListeners.values()) cb(ctx);
        }, () => { audioCtx = null; })
      : null;

    const loop = async () => {
      while (!stopped) {
        const now = new Date();

        if (needsHeatmap) tickHeatmap(heatmapState);

        const lf = leftRenderer.render(now, audioCtx);
        ditherBW(lf, FRAME_COLS, FRAME_ROWS);

        const rf = rightRenderer.render(now, audioCtx);
        ditherBW(rf, FRAME_COLS, FRAME_ROWS);

        const [hcl2, hcr2] = composeFrames([lf, rf], activeOverlay);
        try { if (left  && !frameHeldLeft)  await transport.frameBw(packBW(hcl2), left);  } catch { /* non-fatal */ }
        try { if (right && !frameHeldRight) await transport.frameBw(packBW(hcr2), right); } catch { /* non-fatal */ }
        await new Promise<void>(r => setTimeout(r, 100));
      }
    };

    void loop();
    return () => {
      stopped = true;
      stopAudio?.();
      stopProc?.();
      leftRenderer.stop();
      rightRenderer.stop();
      hudAudioStreaming = false;
    };
  }

  function streamAudioBands(
    source: AudioSource,
    onBands: (ctx: { bands: number[]; fftSize: number; gain: number }) => void,
    onEnd?: () => void,
  ): () => void {
    let stopped = false;
    let stream: ReturnType<typeof createAudioBandStream> | null = null;

    const run = async () => {
      while (!stopped) {
        const target = await resolveDefaultDeviceId(
          source === 'monitor' ? '@DEFAULT_AUDIO_SINK@' : '@DEFAULT_AUDIO_SOURCE@',
        );
        if (stopped) break;
        stream = createAudioBandStream({ source, gain: source === 'monitor' ? 1.5 : 1.0, ...(target ? { target } : {}) });
        const iter = stream[Symbol.asyncIterator]();
        let gotData = false;
        const watchedStream = stream;
        const startupWatchdog = setTimeout(() => { if (!gotData && !stopped) watchedStream?.stop(); }, 3000);
        while (!stopped) {
          const result = await iter.next();
          if (stopped || result.done) break;
          if (!gotData) { gotData = true; clearTimeout(startupWatchdog); }
          onBands(result.value);
        }
        clearTimeout(startupWatchdog);
        if (!stopped) {
          onEnd?.();
          await new Promise<void>(r => setTimeout(r, 2000));
        }
      }
    };

    void run();
    return () => { stopped = true; stream?.stop(); };
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
        if (!stopped && !hold) resumeAfterInterrupt();
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
          const [gcl, gcr] = composeFrames([leftFrame, rightFrame], activeOverlay);
          try { if (left) await sendFrame(gcl, left); } catch { /* non-fatal */ }
          try { if (right) await sendFrame(gcr, right); } catch { /* non-fatal */ }
        } else {
          const frame = result.value;
          const [gcl2, gcr2] = composeFrames([frame, frame], activeOverlay);
          try { if (left) await sendFrame(gcl2, left); } catch { /* non-fatal */ }
          try { if (right) await sendFrame(gcr2, right); } catch { /* non-fatal */ }
        }

        const delay = anim.delays[frameIdx % anim.delays.length] ?? 100;
        frameIdx++;
        if (delay > 0) await new Promise<void>(r => setTimeout(r, delay));
      }

      if (!stopped && !hold) resumeAfterInterrupt();
    })();
  }

  function startDmxAnimation(filePath: string, loop: boolean): void {
    stopAnim();
    let stopped = false;
    stopCurrentAnim = () => { stopped = true; };

    void (async () => {
      let raw: string;
      try {
        raw = await fs.readFile(filePath, 'utf-8');
      } catch (err) {
        process.stderr.write(`dark-matrix: dmx load failed: ${String(err)}\n`);
        return;
      }

      let project: DmxProject;
      try {
        project = parseProject(raw);
      } catch (err) {
        process.stderr.write(`dark-matrix: dmx parse failed: ${String(err)}\n`);
        return;
      }

      if (stopped) return;

      const { left, right } = currentConfig.modules;
      const { frames, mode, width, height } = project;
      const dual = width === 18;

      do {
        for (const dmxFrame of frames) {
          if (stopped) break;
          const pixels = base64ToFrame(dmxFrame.pixels, width * height);
          if (dual) {
            const leftBuf = new Uint8Array(FRAME_SIZE) as unknown as Frame;
            const rightBuf = new Uint8Array(FRAME_SIZE) as unknown as Frame;
            for (let col = 0; col < FRAME_COLS; col++) {
              for (let row = 0; row < FRAME_ROWS; row++) {
                leftBuf[col * FRAME_ROWS + row] = pixels[col * FRAME_ROWS + row] ?? 0;
                rightBuf[col * FRAME_ROWS + row] = pixels[(col + FRAME_COLS) * FRAME_ROWS + row] ?? 0;
              }
            }
            const [dcl, dcr] = composeFrames([leftBuf, rightBuf], activeOverlay);
            if (mode === 'bw') {
              try { if (left) await transport.frameBw(packBW(dcl), left); } catch { /* non-fatal */ }
              try { if (right) await transport.frameBw(packBW(dcr), right); } catch { /* non-fatal */ }
            } else {
              try { if (left) await transport.frameGray(dcl, left); } catch { /* non-fatal */ }
              try { if (right) await transport.frameGray(dcr, right); } catch { /* non-fatal */ }
            }
          } else {
            const frame = pixels as unknown as Frame;
            const [dcl2, dcr2] = composeFrames([frame, frame], activeOverlay);
            if (mode === 'bw') {
              try { if (left) await transport.frameBw(packBW(dcl2), left); } catch { /* non-fatal */ }
              try { if (right) await transport.frameBw(packBW(dcr2), right); } catch { /* non-fatal */ }
            } else {
              try { if (left) await transport.frameGray(dcl2, left); } catch { /* non-fatal */ }
              try { if (right) await transport.frameGray(dcr2, right); } catch { /* non-fatal */ }
            }
          }
          if (dmxFrame.delayMs > 0 && !stopped) {
            await new Promise<void>(r => setTimeout(r, dmxFrame.delayMs));
          }
        }
      } while (!stopped && loop);

      if (!stopped) {
        if (left) await transport.release(left).catch(() => {});
        if (right) await transport.release(right).catch(() => {});
      }
    })();
  }

  function startIdleAnimation() {
    hudHardwareActive = false;
    triggerEngine.notifyIdle();
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

    if (idleName === 'hud') {
      stopCurrentAnim = runHudOnModules();
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

  function startTextNotification(intent: DisplayIntent, composite: 'replace' | 'overlay'): void {
    const safe = intent.content.replace(/[^\x20-\x7e]/g, '').slice(0, SCROLL_MAX_LEN);
    const text = safe.length > 0 ? safe : '???';
    const size = intent.textSize ?? 'small';
    const anim = createScrollAnimation({ text, loop: false, size, ...(composite === 'overlay' ? { stripRows: 8 } : {}) });

    if (composite === 'replace') {
      stopAnim();
      if (idleTimer) clearTimeout(idleTimer);
      runOnModules(anim, undefined, () => {
        const curr = dispatcher.current();
        if (!curr || curr.id === intent.id) resumeAfterInterrupt();
      });
      return;
    }

    let stopped = false;
    stopCurrentOverlay = () => { stopped = true; anim.stop(); setActiveOverlay(null); };
    void (async () => {
      const iter = anim[Symbol.asyncIterator]();
      const frameMs = 1000 / 20;
      let nextAt = Date.now();
      while (!stopped) {
        const result = await iter.next();
        if (stopped || result.done) break;
        const [lf, rf] = result.value;
        setActiveOverlay({ left: cropToBottomStrip(lf, 8), right: cropToBottomStrip(rf, 8) });
        nextAt += frameMs;
        const wait = nextAt - Date.now();
        if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
      }
      if (!stopped) {
        setActiveOverlay(null);
        stopCurrentOverlay = null;
        const remaining = intent.expiresAt - Date.now();
        setTimeout(() => dispatcher.gc(), Math.max(0, remaining));
      }
    })();
  }

  async function startImageNotification(intent: DisplayIntent, composite: 'replace' | 'overlay'): Promise<void> {
    if (!intent.assetPath) { startTextNotification(intent, composite); return; }
    let handle: Awaited<ReturnType<typeof loadNotificationAsset>>;
    try {
      handle = await loadNotificationAsset(intent.assetPath);
    } catch {
      startTextNotification(intent, composite);
      return;
    }
    if (handle.kind !== 'image') { startTextNotification(intent, composite); return; }
    const frame = handle.frame;
    const { left: leftDev, right: rightDev } = currentConfig.modules;

    if (composite === 'replace') {
      stopAnim();
      if (idleTimer) clearTimeout(idleTimer);
      try { if (leftDev) await transport.frameGray(frame, leftDev); } catch { /* non-fatal */ }
      try { if (rightDev) await transport.frameGray(frame, rightDev); } catch { /* non-fatal */ }
      let done = false;
      const timer = setTimeout(() => {
        done = true;
        stopCurrentAnim = null;
        const curr = dispatcher.current();
        if (!curr || curr.id === intent.id) resumeAfterInterrupt();
      }, intent.durationMs);
      stopCurrentAnim = () => { if (!done) { done = true; clearTimeout(timer); } };
      return;
    }

    let stopped = false;
    await new Promise<void>(r => {
      const timer = setTimeout(r, intent.durationMs);
      stopCurrentOverlay = () => { stopped = true; clearTimeout(timer); setActiveOverlay(null); r(); };
      setActiveOverlay({ left: frame, right: frame });
    });
    if (!stopped) {
      setActiveOverlay(null);
      stopCurrentOverlay = null;
      const remaining = intent.expiresAt - Date.now();
      setTimeout(() => dispatcher.gc(), Math.max(0, remaining));
    }
  }

  async function startGifNotification(intent: DisplayIntent, composite: 'replace' | 'overlay'): Promise<void> {
    if (!intent.assetPath) { startTextNotification(intent, composite); return; }
    let handle: Awaited<ReturnType<typeof loadNotificationAsset>>;
    try {
      handle = await loadNotificationAsset(intent.assetPath);
    } catch {
      startTextNotification(intent, composite);
      return;
    }
    if (handle.kind !== 'gif') { startTextNotification(intent, composite); return; }
    const gifPath = handle.path;
    const { left: leftDev, right: rightDev } = currentConfig.modules;

    let stopped = false;
    let gifAnim: GifAnimation | null = null;

    if (composite === 'replace') {
      stopAnim();
      if (idleTimer) clearTimeout(idleTimer);
      stopCurrentAnim = () => { stopped = true; gifAnim?.stop(); };
    } else {
      stopCurrentOverlay = () => { stopped = true; gifAnim?.stop(); setActiveOverlay(null); };
    }

    try {
      gifAnim = await createGifAnimation({ path: gifPath, loop: true, dual: false, mode: 'gray' });
    } catch {
      if (!stopped) {
        if (composite === 'replace') resumeAfterInterrupt();
        else { setActiveOverlay(null); stopCurrentOverlay = null; }
      }
      return;
    }
    if (stopped) { gifAnim.stop(); return; }

    const resolvedAnim = gifAnim;
    if (composite === 'replace') {
      stopCurrentAnim = () => { stopped = true; resolvedAnim.stop(); };
    } else {
      stopCurrentOverlay = () => { stopped = true; resolvedAnim.stop(); setActiveOverlay(null); };
    }

    const iter = gifAnim[Symbol.asyncIterator]();
    const deadline = Date.now() + intent.durationMs;
    let frameIdx = 0;

    while (!stopped && Date.now() < deadline) {
      const result = await iter.next();
      if (stopped || result.done) break;
      const gifFrame = result.value;
      if (composite === 'replace') {
        const [cl, cr] = composeFrames([gifFrame, gifFrame], activeOverlay);
        try { if (leftDev) await transport.frameGray(cl, leftDev); } catch { /* non-fatal */ }
        try { if (rightDev) await transport.frameGray(cr, rightDev); } catch { /* non-fatal */ }
      } else {
        setActiveOverlay({ left: gifFrame, right: gifFrame });
      }
      const delay = gifAnim.delays[frameIdx % gifAnim.delays.length] ?? 100;
      frameIdx++;
      if (delay > 0 && !stopped) await new Promise<void>(r => setTimeout(r, delay));
    }

    gifAnim.stop();
    if (!stopped) {
      if (composite === 'replace') {
        stopCurrentAnim = null;
        if (leftDev) await transport.release(leftDev).catch(() => {});
        if (rightDev) await transport.release(rightDev).catch(() => {});
        const curr = dispatcher.current();
        if (!curr || curr.id === intent.id) resumeAfterInterrupt();
      } else {
        setActiveOverlay(null);
        stopCurrentOverlay = null;
        const remaining = intent.expiresAt - Date.now();
        setTimeout(() => dispatcher.gc(), Math.max(0, remaining));
      }
    }
  }

  async function startDmxNotification(intent: DisplayIntent, composite: 'replace' | 'overlay'): Promise<void> {
    if (!intent.assetPath) { startTextNotification(intent, composite); return; }
    let handle: Awaited<ReturnType<typeof loadNotificationAsset>>;
    try {
      handle = await loadNotificationAsset(intent.assetPath);
    } catch {
      startTextNotification(intent, composite);
      return;
    }
    if (handle.kind !== 'dmx') { startTextNotification(intent, composite); return; }
    const dmxPath = handle.path;

    let raw: string;
    try { raw = await fs.readFile(dmxPath, 'utf-8'); } catch {
      startTextNotification(intent, composite);
      return;
    }
    let project: DmxProject;
    try { project = parseProject(raw); } catch {
      startTextNotification(intent, composite);
      return;
    }

    const { left: leftDev, right: rightDev } = currentConfig.modules;
    const { frames: dmxFrames, mode: dmxMode, width: dmxWidth, height: dmxHeight } = project;
    const dual = dmxWidth === 18;

    if (dmxFrames.length === 0) { startTextNotification(intent, composite); return; }

    const deadline = Date.now() + intent.durationMs;
    let stopped = false;

    if (composite === 'replace') {
      stopAnim();
      if (idleTimer) clearTimeout(idleTimer);
      stopCurrentAnim = () => { stopped = true; };
    } else {
      stopCurrentOverlay = () => { stopped = true; setActiveOverlay(null); };
    }

    outer: do {
      for (const dmxFrame of dmxFrames) {
        if (stopped || Date.now() >= deadline) break outer;
        const pixels = base64ToFrame(dmxFrame.pixels, dmxWidth * dmxHeight);
        if (dual) {
          const leftBuf = new Uint8Array(FRAME_SIZE) as unknown as Frame;
          const rightBuf = new Uint8Array(FRAME_SIZE) as unknown as Frame;
          for (let col = 0; col < FRAME_COLS; col++) {
            for (let row = 0; row < FRAME_ROWS; row++) {
              leftBuf[col * FRAME_ROWS + row] = pixels[col * FRAME_ROWS + row] ?? 0;
              rightBuf[col * FRAME_ROWS + row] = pixels[(col + FRAME_COLS) * FRAME_ROWS + row] ?? 0;
            }
          }
          if (composite === 'replace') {
            const [cl, cr] = composeFrames([leftBuf, rightBuf], activeOverlay);
            if (dmxMode === 'bw') {
              try { if (leftDev) await transport.frameBw(packBW(cl), leftDev); } catch { /* non-fatal */ }
              try { if (rightDev) await transport.frameBw(packBW(cr), rightDev); } catch { /* non-fatal */ }
            } else {
              try { if (leftDev) await transport.frameGray(cl, leftDev); } catch { /* non-fatal */ }
              try { if (rightDev) await transport.frameGray(cr, rightDev); } catch { /* non-fatal */ }
            }
          } else {
            setActiveOverlay({ left: leftBuf, right: rightBuf });
          }
        } else {
          const framePx = pixels as unknown as Frame;
          if (composite === 'replace') {
            const [cl2, cr2] = composeFrames([framePx, framePx], activeOverlay);
            if (dmxMode === 'bw') {
              try { if (leftDev) await transport.frameBw(packBW(cl2), leftDev); } catch { /* non-fatal */ }
              try { if (rightDev) await transport.frameBw(packBW(cr2), rightDev); } catch { /* non-fatal */ }
            } else {
              try { if (leftDev) await transport.frameGray(cl2, leftDev); } catch { /* non-fatal */ }
              try { if (rightDev) await transport.frameGray(cr2, rightDev); } catch { /* non-fatal */ }
            }
          } else {
            setActiveOverlay({ left: framePx, right: framePx });
          }
        }
        if (dmxFrame.delayMs > 0 && !stopped) await new Promise<void>(r => setTimeout(r, dmxFrame.delayMs));
      }
    } while (!stopped && Date.now() < deadline);

    if (!stopped) {
      if (composite === 'replace') {
        stopCurrentAnim = null;
        if (leftDev) await transport.release(leftDev).catch(() => {});
        if (rightDev) await transport.release(rightDev).catch(() => {});
        const curr = dispatcher.current();
        if (!curr || curr.id === intent.id) resumeAfterInterrupt();
      } else {
        setActiveOverlay(null);
        stopCurrentOverlay = null;
        const remaining = intent.expiresAt - Date.now();
        setTimeout(() => dispatcher.gc(), Math.max(0, remaining));
      }
    }
  }

  function startNotificationAnimation(intent: DisplayIntent): void {
    stopOverlay();
    const style = intent.style ?? 'text';
    const composite = intent.composite ?? 'replace';
    if (style === 'image') {
      void startImageNotification(intent, composite);
    } else if (style === 'gif') {
      void startGifNotification(intent, composite);
    } else if (style === 'dmx') {
      void startDmxNotification(intent, composite);
    } else {
      startTextNotification(intent, composite);
    }
  }

  let currentIntentId: string | null = null;
  const disposeDispatcher = dispatcher.onChange((intent) => {
    if (intent) {
      if (intent.id === currentIntentId) return;
      currentIntentId = intent.id;
      startNotificationAnimation(intent);
    } else {
      currentIntentId = null;
      if (currentConfig.hud) {
        if (!stopCurrentAnim) stopCurrentAnim = runHudOnModules();
        // else HUD loop already running — leave it alone, don't bounce the audio stream
      } else {
        stopAnim();
        startIdleAnimation();
      }
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

  disposeWatches.push(watchDesktopNotifications((n) => {
    const base = notificationIntent(n);
    const route = routeNotification(base, currentConfig.notification_rules ?? []);
    if (route.action === 'none') return;
    const intent: DisplayIntent = { ...base };
    intent.style = route.action === 'scroll' ? 'text' : route.action;
    intent.composite = route.composite;
    if (route.assetPath !== undefined) intent.assetPath = route.assetPath;
    if (route.durationMs !== undefined) {
      intent.durationMs = route.durationMs;
      intent.expiresAt = Date.now() + route.durationMs;
    }
    dispatcher.push(intent);
  }));

  let micAnimActive = false;
  disposeWatches.push(watchMic((e) => {
    if (e.active && !micAnimActive) {
      if (hudAudioStreaming) {
        // HUD binary-audio face is active — switch its source to mic
        hudAudioSource = 'mic';
        stopAnim();
        stopCurrentAnim = runHudOnModules();
      } else {
        micAnimActive = true;
        stopAnim();
        if (idleTimer) clearTimeout(idleTimer);
        stopCurrentAnim = runAudioEqOnModules('mic');
      }
    } else if (!e.active) {
      if (hudAudioSource === 'mic') {
        hudAudioSource = 'monitor';
        stopAnim();
        resumeAfterInterrupt();
      } else if (micAnimActive) {
        micAnimActive = false;
        stopAnim();
        resumeAfterInterrupt();
      }
    }
  }, { intervalMs: 2000 }));

  // Preset trigger engine
  const triggerEngine = createPresetTriggerEngine({
    presets: currentConfig.hud_presets ?? [],
    onActivate: (name) => {
      const preset = (currentConfig.hud_presets ?? []).find(p => p.name === name);
      if (preset) applyPreset(preset);
    },
  });

  // Feed proc stats into the trigger engine
  disposeWatches.push(watchProcStats((stats) => {
    triggerEngine.updateStats(stats);
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
            case 'status':
              socket.write(JSON.stringify({
                ok: true,
                modules: {
                  left:  deviceAvailable.get(currentConfig.modules.left)  ?? false,
                  right: deviceAvailable.get(currentConfig.modules.right) ?? false,
                },
              }) + '\n');
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
                setTimeout(() => { if (!dispatcher.current()) resumeAfterInterrupt(); }, dur);
              }
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'play': {
              const m = msg as { cmd: string; path?: string; loop?: boolean };
              if (typeof m.path !== 'string' || !/\.dmx\.json$/i.test(m.path)) {
                socket.write(JSON.stringify({ ok: false, error: 'expected a .dmx.json path' }) + '\n');
                break;
              }
              void fs.realpath(m.path).then((resolved) => {
                if (socket.destroyed) return;
                const home = os.homedir();
                if (!resolved.startsWith(home + '/') && resolved !== home) {
                  socket.write(JSON.stringify({ ok: false, error: 'path outside home directory' }) + '\n');
                  return;
                }
                startDmxAnimation(resolved, !!m.loop);
                socket.write(JSON.stringify({ ok: true }) + '\n');
              }).catch(() => {
                if (socket.destroyed) return;
                socket.write(JSON.stringify({ ok: false, error: 'path not found' }) + '\n');
              });
              break;
            }
            case 'animate': {
              const m = msg as { cmd: string; type?: string; path?: string; hold?: boolean; dual?: boolean; mode?: string };
              if (m.type !== 'gif' || typeof m.path !== 'string' || !/\.gif$/i.test(m.path)) {
                socket.write(JSON.stringify({ ok: false, error: 'expected type:gif and a .gif path' }) + '\n');
                break;
              }
              const gifMode = m.mode === 'bw' ? 'bw' : 'gray';
              void fs.realpath(m.path).then((resolved) => {
                if (socket.destroyed) return;
                const home = os.homedir();
                if (!resolved.startsWith(home + '/') && resolved !== home) {
                  socket.write(JSON.stringify({ ok: false, error: 'path outside home directory' }) + '\n');
                  return;
                }
                startGifAnimation(resolved, !!m.hold, !!m.dual, gifMode);
                socket.write(JSON.stringify({ ok: true }) + '\n');
              }).catch(() => {
                if (socket.destroyed) return;
                socket.write(JSON.stringify({ ok: false, error: 'path not found' }) + '\n');
              });
              break;
            }
            case 'frame': {
              const m = msg as { cmd: string; left?: string; right?: string; mode?: string };
              const mode = m.mode === 'gray' ? 'gray' : 'bw';
              if (m.left  !== undefined) frameHeldLeft  = true;
              if (m.right !== undefined) frameHeldRight = true;
              if (!currentConfig.hud) {
                // No HUD running — stop any idle animation so it doesn't clobber the preview
                stopAnim();
                if (idleTimer) clearTimeout(idleTimer);
              }
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
              frameHeldLeft = false;
              frameHeldRight = false;
              if (!currentConfig.hud) startIdleTimer();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            case 'audio-viz': {
              const m = msg as { cmd: string; source?: string };
              const source: AudioSource = m.source === 'mic' ? 'mic' : 'monitor';
              socket.write(JSON.stringify({ ok: true }) + '\n');
              if (hudHardwareActive) {
                // HUD mode: never start a competing pw-record.
                // If the loop is streaming audio with a different source, switch it.
                if (hudAudioStreaming && source !== hudAudioSource) {
                  hudAudioSource = source;
                  stopAnim();
                  stopCurrentAnim = runHudOnModules();
                } else {
                  // Loop not yet streaming (clock widget) or source matches — just
                  // record the preference so runHudOnModules picks it up when needed.
                  hudAudioSource = source;
                }
                // Subscribe to the shared HUD band stream — no second pw-record
                const key = Symbol();
                hudAudioListeners.set(key, (ctx) => {
                  if (!socket.destroyed) socket.write(JSON.stringify({ type: 'audio-bands', ...ctx }) + '\n');
                });
                const unsub = () => hudAudioListeners.delete(key);
                socket.once('close', unsub);
                socket.once('error', unsub);
              } else {
                const stopViz = streamAudioBands(source, (ctx) => {
                  if (socket.destroyed) return;
                  socket.write(JSON.stringify({ type: 'audio-bands', ...ctx }) + '\n');
                });
                socket.once('close', stopViz);
                socket.once('error', stopViz);
              }
              break;
            }
            case 'audio-hardware-start': {
              const m = msg as { cmd: string; style?: string; source?: string };
              const knownStyles = AUDIO_STYLES.map(s => s.id as string);
              const isAudioStyle = (s: string): s is AudioStyle => knownStyles.includes(s);
              const style: AudioStyle = m.style && isAudioStyle(m.style) ? m.style : 'dark-matter';
              const source: AudioSource = m.source === 'mic' ? 'mic' : 'monitor';
              stopAnim();
              if (idleTimer) clearTimeout(idleTimer);
              stopCurrentAnim = runAudioEqOnModules(source, style);
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'audio-hardware-stop': {
              stopAnim();
              startIdleTimer();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'hud-hardware-start': {
              stopAnim();
              if (idleTimer) clearTimeout(idleTimer);
              hudHardwareActive = true;
              stopCurrentAnim = runHudOnModules();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'hud-hardware-stop': {
              hudHardwareActive = false;
              hudAudioSource = 'monitor';
              if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
              if (!currentConfig.hud) startIdleAnimation();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'hud-config': {
              const m = msg as { cmd: string; leftFace?: string; leftWidget?: string; leftDataStyle?: string; leftAudioStyle?: string; leftFile?: string; rightFace?: string; rightWidget?: string; rightDataStyle?: string; rightAudioStyle?: string; rightFile?: string };
              const newHud = { ...currentConfig.hud };
              if (m.leftWidget === 'heatmap') {
                newHud.left = { widget: 'heatmap' };
              } else if (m.leftWidget === 'audio') {
                const style = AUDIO_STYLES.find(s => s.id === m.leftAudioStyle)?.id;
                newHud.left = { widget: 'audio', ...(style ? { style } : {}) };
              } else if (m.leftWidget === 'data') {
                const style = DATA_STYLES.find(s => s.id === m.leftDataStyle)?.id;
                newHud.left = { widget: 'data', ...(style ? { style } : {}) };
              } else if (m.leftWidget === 'image' && typeof m.leftFile === 'string') {
                newHud.left = { widget: 'image', file: m.leftFile };
              } else if (typeof m.leftFace === 'string') {
                const face = isClockFace(m.leftFace) ? m.leftFace : 'elegant';
                newHud.left = { widget: 'clock', face };
              }
              if (m.rightWidget === 'heatmap') {
                newHud.right = { widget: 'heatmap' };
              } else if (m.rightWidget === 'audio') {
                const style = AUDIO_STYLES.find(s => s.id === m.rightAudioStyle)?.id;
                newHud.right = { widget: 'audio', ...(style ? { style } : {}) };
              } else if (m.rightWidget === 'data') {
                const style = DATA_STYLES.find(s => s.id === m.rightDataStyle)?.id;
                newHud.right = { widget: 'data', ...(style ? { style } : {}) };
              } else if (m.rightWidget === 'image' && typeof m.rightFile === 'string') {
                newHud.right = { widget: 'image', file: m.rightFile };
              } else if (typeof m.rightFace === 'string') {
                const face = isClockFace(m.rightFace) ? m.rightFace : 'elegant';
                newHud.right = { widget: 'clock', face };
              }
              currentConfig = { ...currentConfig, hud: newHud };
              if ((hudHardwareActive || currentConfig.daemon.idle_animation === 'hud') && !dispatcher.current()) {
                stopAnim();
                stopCurrentAnim = runHudOnModules();
              }
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'hud-preset': {
              const m = msg as { cmd: string; name?: string };
              const preset = (currentConfig.hud_presets ?? []).find(p => p.name === m.name);
              if (!preset) {
                socket.write(JSON.stringify({ ok: false, error: `preset not found: "${m.name ?? ''}"` }) + '\n');
                break;
              }
              applyPreset(preset);
              socket.write(JSON.stringify({ ok: true, name: preset.name }) + '\n');
              break;
            }
            case 'notify-test': {
              const m = msg as {
                cmd: string;
                appName?: string;
                summary?: string;
                body?: string;
                style?: 'text' | 'image' | 'gif' | 'dmx';
                textSize?: 'tiny' | 'small' | 'medium' | 'large';
                assetPath?: string;
                composite?: 'replace' | 'overlay';
                durationMsOverride?: number;
              };
              const n = { appName: m.appName ?? 'test', summary: m.summary ?? 'test notification', body: m.body ?? '' };
              const base = notificationIntent(n);
              const route = routeNotification(base, currentConfig.notification_rules ?? []);
              const effectiveAction = m.style === 'text' ? 'scroll' : (m.style ?? route.action);
              if (effectiveAction !== 'none') {
                const intent: DisplayIntent = { ...base };
                intent.style = effectiveAction === 'scroll' ? 'text' : effectiveAction;
                intent.composite = m.composite ?? route.composite;
                if (m.textSize !== undefined) intent.textSize = m.textSize;
                const assetPath = m.assetPath ?? route.assetPath;
                if (assetPath !== undefined) intent.assetPath = assetPath;
                const rawDur = m.durationMsOverride;
                const overrideDur = typeof rawDur === 'number' && Number.isFinite(rawDur) && rawDur > 0
                  ? Math.min(rawDur, MAX_NOTIFY_DURATION_MS) : undefined;
                const durMs = overrideDur ?? route.durationMs;
                if (durMs !== undefined) {
                  intent.durationMs = durMs;
                  intent.expiresAt = Date.now() + durMs;
                }
                dispatcher.push(intent);
              }
              socket.write(JSON.stringify({ ok: true, action: effectiveAction }) + '\n');
              break;
            }
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
    // Preserve in-memory hud — it's driven by hud-config messages and never written to disk.
    currentConfig = { ...cfg, ...(currentConfig.hud ? { hud: currentConfig.hud } : {}) };
    triggerEngine.updatePresets(cfg.hud_presets ?? []);
    disposeBrightness();
    disposeBrightness = startBrightnessLoop(currentConfig, async (pct) => {
      currentBrightness = pct;
      await setBrightness(pct);
    });
    // Restart the idle animation if it is currently running so it picks up
    // any changed idle_animation / idle_gif_path / hud settings.
    if (!hudHardwareActive && !frameHeldLeft && !frameHeldRight && !dispatcher.current()) {
      stopAnim();
      if (currentConfig.hud) {
        stopCurrentAnim = runHudOnModules();
      } else {
        startIdleAnimation();
      }
    }
  });

  // Startup animation
  if (currentConfig.startup.animation !== 'none') {
    if (currentConfig.startup.animation === 'gol-random') {
      runOnModules(null, () => createGolAnimation({ frames: 420, loop: false }));
    } else if (currentConfig.startup.animation === 'scroll') {
      const text = currentConfig.startup.scroll_text;
      runOnModules(createScrollAnimation({ text, loop: false }));
    } else if (currentConfig.startup.animation === 'dmx') {
      const dmxPath = currentConfig.startup.dmx_path;
      if (dmxPath) startDmxAnimation(dmxPath, false);
      else process.stderr.write('dark-matrix: startup.animation is dmx but dmx_path is not set\n');
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
    triggerEngine.stop();
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
