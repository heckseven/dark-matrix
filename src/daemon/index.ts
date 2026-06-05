import net from 'node:net';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { loadConfig, bootstrapConfig, watchConfig, resolveSocketPath } from '../lib/config.js';
import type { Config } from '../lib/config.js';
import { DAEMON_WIDGET_REGISTRY } from './widgets/index.js';
import type { WidgetRenderer, DaemonWidgetContext } from './widgets/types.js';
import type { HudConfigMessage } from './widgets/types.js';
import { startBrightnessLoop } from '../lib/brightness.js';
import { watchSwitches, type SwitchSource, type SwitchState } from '../lib/ec-switches.js';
import { watchVms } from '../lib/vm-source.js';
import { parseClaudeHook } from '../lib/claude-source.js';
import { parseProject, base64ToFrame } from '../deck/format.js';
import type { DmxProject } from '../deck/format.js';
import { watchDesktopNotifications } from '../lib/dbus-notifications.js';
import { watchMic } from '../lib/mic-source.js';
import { Dispatcher, ecSwitchIntent, vmIntent, claudeIntent, notificationIntent, batteryIntent } from '../lib/dispatcher.js';
import { routeNotification } from '../lib/notification-routing.js';
import { SerialTransport } from '../lib/transport.js';
import { runAnimation } from '../lib/animation.js';
import { createStartupAnimation } from '../animations/startup.js';
import { createScrollAnimation } from '../animations/scroll.js';
import { createGolAnimation } from '../animations/gol.js';
import { createAudioEqAnimation, createAudioBandStream } from '../animations/audio-eq.js';
import type { AudioSource } from '../animations/audio-eq.js';
import { AUDIO_STYLES } from '../animations/audio-renderers.js';
import type { AudioStyle } from '../animations/audio-renderers.js';
import type { DataWidgetConfig, DataRenderer } from '../animations/data-renderers.js';
import { createTextRenderer, TEXT_STYLES, TEXT_SPEEDS, TEXT_FLICKERS, TEXT_TRANSITIONS } from '../animations/text-renderers.js';
import type { TextStyle, TextSize, TextSpeed, TextFlicker, TextTransition } from '../animations/text-renderers.js';
import type { ClaudeRendererApi } from '../animations/claude-renderers.js';
import { watchProcStats } from '../lib/proc-source.js';
import { createPresetTriggerEngine } from '../lib/preset-triggers.js';
import { createGifAnimation } from '../animations/gif.js';
import type { GifAnimation } from '../animations/gif.js';
import type { DisplayIntent, DisplaySource } from '../lib/dispatcher.js';
import { packBW, FRAME_SIZE, FRAME_COLS, FRAME_ROWS, createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';
import { getTransitionFrames } from '../animations/transitions.js';
import type { TransitionFrame } from '../animations/transitions.js';
import { composeFrames } from '../lib/compositor.js';
import type { NotifyOverlay } from '../lib/compositor.js';
import { loadNotificationAsset } from '../lib/notification-assets.js';

const SCROLL_MAX_LEN = 120;
const MAX_NOTIFY_DURATION_MS = 30_000;

// Built-in designs dir (dist/deck/builtins); resolution via ../lib/builtins.ts.
const BUILTINS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deck/builtins');
const DAEMON_VERSION: string = (() => {
  try {
    const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch { return '0.0.0'; }
})();

let activeOverlay: NotifyOverlay | null = null;
export function setActiveOverlay(o: NotifyOverlay | null): void { activeOverlay = o; }

type PersistedTimerEpoch = { durationMs: number; repeat: boolean; style: 'elegant' | 'hourglass' | 'twinz'; epochMs: number } | null;

export const socketPath = resolveSocketPath;

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
      await bootstrapConfig();
      currentConfig = await loadConfig();
    } else {
      throw err;
    }
  }

  // Pre-populate currentConfig.hud from active_hud_preset so runHudOnModules
  // uses the right widgets even before the deck sends a hud-config message.
  if (currentConfig.active_hud_preset) {
    const activePreset = (currentConfig.hud_presets ?? []).find(p => p.name === currentConfig.active_hud_preset);
    if (activePreset) currentConfig = { ...currentConfig, hud: { left: activePreset.left, right: activePreset.right } };
  }

  const daemonStartedAt = Date.now();
  let currentBrightness = 0;
  let currentAnimName = 'hud';
  const transport = new SerialTransport();
  const dispatcher = new Dispatcher();
  let stopCurrentAnim: (() => void) | null = null;
  let stopCurrentOverlay: (() => void) | null = null;
  let hudHardwareActive = false;
  let hudAudioStreaming = false;
  let hudAudioSource: 'monitor' | 'mic' = 'monitor';
  let frameHeldLeft = false;
  let frameHeldRight = false;
  // Shared band listeners: audio-viz sockets subscribe here when HUD loop owns audio
  const hudAudioListeners = new Map<symbol, (ctx: { bands: number[]; fftSize: number; gain: number }) => void>();
  const claudeRenderers = new Set<ClaudeRendererApi>();

  // Timer epoch persisted across HUD loop restarts so navigation doesn't reset timers.
  // Invalidated (set to null) when the widget type changes away from timer, or when the
  // timer config (durationMs, repeat, style) changes.
  const persistedTimerEpochs: { left: PersistedTimerEpoch; right: PersistedTimerEpoch } = { left: null, right: null };

  // Recent notification content per source, used by the deck UI to suggest
  // glob examples. Most-recent first, deduplicated, capped per source.
  const NOTIFICATION_HISTORY_SOURCES = ['desktop-notification', 'vm', 'claude', 'manual', 'twitch'] as const;
  const NOTIFICATION_HISTORY_MAX = 7;
  const NOTIFICATION_HISTORY_CONTENT_MAX = 512;
  type NotificationHistorySource = typeof NOTIFICATION_HISTORY_SOURCES[number];
  const notificationHistory = new Map<NotificationHistorySource, string[]>(
    NOTIFICATION_HISTORY_SOURCES.map(s => [s, []]),
  );
  function isHistorySource(s: DisplaySource): s is NotificationHistorySource {
    return (NOTIFICATION_HISTORY_SOURCES as readonly string[]).includes(s);
  }
  function recordNotificationExample(source: DisplaySource, content: string): void {
    if (!isHistorySource(source)) return;
    if (!content) return;
    const list = notificationHistory.get(source);
    if (!list) return;
    const trimmed = content.length > NOTIFICATION_HISTORY_CONTENT_MAX
      ? content.slice(0, NOTIFICATION_HISTORY_CONTENT_MAX) : content;
    const existing = list.indexOf(trimmed);
    if (existing !== -1) list.splice(existing, 1);
    list.unshift(trimmed);
    if (list.length > NOTIFICATION_HISTORY_MAX) list.length = NOTIFICATION_HISTORY_MAX;
  }

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

  // The HUD is the unconditional resting state. runHudOnModules() defaults to a
  // clock when no widgets are configured, so this is always safe to call.
  function startRestingState() {
    stopAnim();
    stopCurrentAnim = runHudOnModules();
  }

  function resumeAfterInterrupt() {
    frameHeldLeft = false;
    frameHeldRight = false;
    startRestingState();
  }

  function stopOverlay(): void {
    if (stopCurrentOverlay) { stopCurrentOverlay(); stopCurrentOverlay = null; }
  }


  function runOnModules(anim: ReturnType<typeof createScrollAnimation> | null, singleAnim?: () => ReturnType<typeof createGolAnimation>, onComplete?: () => void) {
    if (anim) {
      stopCurrentAnim = runScrollOnModules(anim, 20, onComplete);
      return;
    }
    if (singleAnim) {
      const devPaths = getModulePaths();
      const stops: Array<() => void> = [];
      let doneCount = 0;
      for (const dev of devPaths) {
        stops.push(runAnimation(singleAnim(), { transport, devicePath: dev, mode: 'bw' }, onComplete ? () => {
          if (++doneCount === devPaths.length) onComplete();
        } : undefined));
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
      if (natural) {
        onComplete?.();
      }
    };

    void loop();
    return () => { stopped = true; anim.stop(); };
  }

  function runTextRenderersOnModules(
    rendL: ReturnType<typeof createTextRenderer>,
    rendR: ReturnType<typeof createTextRenderer>,
    expiresAt: number,
    side: 'left' | 'right' | undefined,
    onComplete?: () => void,
  ): () => void {
    const { left, right } = currentConfig.modules;
    const frameMs = 1000 / 20;
    let stopped = false;

    const loop = async () => {
      let nextAt = Date.now();
      while (!stopped && Date.now() < expiresAt) {
        const now = new Date();
        const lf = side !== 'right' ? rendL.render(now) : createFrame();
        const rf = side !== 'left' ? rendR.render(now) : createFrame();
        const [cl, cr] = composeFrames([lf, rf], activeOverlay);
        try { if (left) await transport.frameBw(packBW(cl), left); } catch { /* non-fatal */ }
        try { if (right) await transport.frameBw(packBW(cr), right); } catch { /* non-fatal */ }
        nextAt += frameMs;
        const wait = nextAt - Date.now();
        if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
      }
      if (!stopped) {
        onComplete?.();
      }
    };

    void loop();
    return () => { stopped = true; rendL.stop(); rendR.stop(); };
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
        // Both roles resolve to a PipeWire node.name, which ffmpeg's pulse input
        // accepts directly. Sinks get the ".monitor" suffix to capture playback.
        const m = /node\.name\s*=\s*"([^"]+)"/.exec(out);
        const name = m?.[1];
        if (!name || !/^[\w.\-]+$/.test(name)) { settle(undefined); return; }
        settle(role === '@DEFAULT_AUDIO_SINK@' ? `${name}.monitor` : name);
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
    currentAnimName = 'audio-eq';
    const { left, right } = currentConfig.modules;
    let stopped = false;
    let anim: ReturnType<typeof createAudioEqAnimation> | null = null;

    const loop = async () => {
      const { packBW, FRAME_COLS, FRAME_ROWS, createFrame } = await import('../lib/frame.js');
      const eqSource = sourceOverride ?? 'monitor';
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
    if (hudHardwareActive || (currentAnimName === 'hud' && !dispatcher.current())) {
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

  function createWidgetRenderer(
    widget: NonNullable<NonNullable<Config['hud']>['left']>,
    side: 'left' | 'right',
    procDataRendererRef: { renderer: DataRenderer | null },
    zenSide?: 'left' | 'right',
  ): WidgetRenderer {
    if (widget.widget !== 'timer') persistedTimerEpochs[side] = null;
    const ctx: DaemonWidgetContext = {
      side,
      procDataRendererRef,
      zenSide,
      currentConfig,
      hudDataConfig,
      persistedTimerEpochs,
      claudeRenderers,
    };
    const descriptor = DAEMON_WIDGET_REGISTRY[widget.widget];
    return descriptor.createRenderer(widget as never, ctx);
  }

  // HUD render rate. Higher = smoother scrolling (text/marquee position is
  // wall-clock-continuous), at the cost of more serial writes per second.
  // Experimental knob — 30 FPS; drop back to ~33→100 if the modules can't keep up.
  const HUD_FRAME_MS = 33;

  function runHudOnModules(): () => void {
    currentAnimName = 'hud';
    const { left, right } = currentConfig.modules;
    let stopped = false;

    const defaultClock = { widget: 'clock', face: 'elegant' } as const;
    const leftHudWidget  = currentConfig.hud?.left  ?? defaultClock;
    const rightHudWidget = currentConfig.hud?.right ?? defaultClock;

    const leftProcRef:  { renderer: DataRenderer | null } = { renderer: null };
    const rightProcRef: { renderer: DataRenderer | null } = { renderer: null };

    // Zen spanning: only render as a single 18-wide canvas when both sides share the same style
    const leftDescriptor = DAEMON_WIDGET_REGISTRY[leftHudWidget.widget];
    const zenSpanning = leftDescriptor.canSpan?.(leftHudWidget as never, rightHudWidget as never) ?? false;

    const leftRenderer  = createWidgetRenderer(leftHudWidget,  'left',  leftProcRef,  zenSpanning ? 'left'  : undefined);
    const rightRenderer = createWidgetRenderer(rightHudWidget, 'right', rightProcRef, zenSpanning ? 'right' : undefined);

    const needsProc = leftHudWidget.widget === 'data' || rightHudWidget.widget === 'data';
    const stopProc = needsProc
      ? watchProcStats((stats) => {
          leftProcRef.renderer?.update(stats);
          rightProcRef.renderer?.update(stats);
        })
      : null;

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
        try {
          const now = new Date();

          const lf = leftRenderer.render(now, audioCtx);
          ditherBW(lf, FRAME_COLS, FRAME_ROWS);

          const rf = rightRenderer.render(now, audioCtx);
          ditherBW(rf, FRAME_COLS, FRAME_ROWS);

          const [hcl2, hcr2] = composeFrames([lf, rf], activeOverlay);
          try { if (left  && !frameHeldLeft)  await transport.frameBw(packBW(hcl2), left);  } catch { /* non-fatal */ }
          try { if (right && !frameHeldRight) await transport.frameBw(packBW(hcr2), right); } catch { /* non-fatal */ }
        } catch (err) {
          process.stderr.write(`dark-matrix: hud loop error: ${String(err)}\n`);
        }
        await new Promise<void>(r => setTimeout(r, HUD_FRAME_MS));
      }
    };

    void loop();
    return () => {
      stopped = true;
      stopAudio?.stop();
      stopProc?.();
      leftRenderer.stop();
      rightRenderer.stop();
      hudAudioStreaming = false;
    };
  }

  function streamAudioBands(
    source: AudioSource,
    onBands: (ctx: { bands: number[]; fftSize: number; gain: number; fullBands?: number[] }) => void,
    onEnd?: () => void,
    opts?: { fullBandCount?: number },
  ): { stop: () => void; setFullBandCount: (n: number) => void } {
    let stopped = false;
    let stream: ReturnType<typeof createAudioBandStream> | null = null;

    const run = async () => {
      while (!stopped) {
        const target = await resolveDefaultDeviceId(
          source === 'monitor' ? '@DEFAULT_AUDIO_SINK@' : '@DEFAULT_AUDIO_SOURCE@',
        );
        if (stopped) break;
        stream = createAudioBandStream({
          source,
          gain: source === 'monitor' ? 1.5 : 1.0,
          ...(target ? { target } : {}),
          ...(opts?.fullBandCount ? { fullBandCount: opts.fullBandCount } : {}),
        });
        const iter = stream[Symbol.asyncIterator]();
        let gotData = false;
        const watchedStream = stream;
        const startupWatchdog = setTimeout(() => { if (!gotData && !stopped) watchedStream?.stop(); }, 3000);
        while (!stopped) {
          const result = await iter.next();
          if (stopped || result.done) break;
          if (!gotData) { gotData = true; clearTimeout(startupWatchdog); }
          try { onBands(result.value); } catch { /* listener errors are non-fatal */ }
        }
        clearTimeout(startupWatchdog);
        if (!stopped) {
          onEnd?.();
          await new Promise<void>(r => setTimeout(r, 2000));
        }
      }
    };

    void run().catch((err) => {
      process.stderr.write(`dark-matrix: audio stream error: ${String(err)}\n`);
    });
    return {
      stop: () => { stopped = true; stream?.stop(); },
      setFullBandCount: (n: number) => { stream?.setFullBandCount(n); },
    };
  }

  function startGifAnimation(gifPath: string, hold: boolean, dual: boolean, mode: 'bw' | 'gray' = 'gray'): void {
    stopAnim();

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

  function startDmxAnimation(filePath: string, loop: boolean, onComplete?: () => void): void {
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
        onComplete?.();
      }
    })();
  }

  function startTextNotification(intent: DisplayIntent, composite: 'replace' | 'overlay'): void {
    const rawText = intent.textContent ?? intent.content;
    const safe = rawText.replace(/[^\x20-\x7e]/g, '').slice(0, SCROLL_MAX_LEN);
    const text = safe.length > 0 ? safe : '???';
    const size = intent.textSize ?? 'small';
    const style = intent.textStyle ?? 'marquee';
    const side = intent.side;

    const OVERLAY_STRIP_ROWS = 8;
    const position = intent.textPosition ?? 'bottom';
    const textStripStart = position === 'top' ? 0
      : position === 'middle' ? Math.floor((FRAME_ROWS - OVERLAY_STRIP_ROWS) / 2)
      : FRAME_ROWS - OVERLAY_STRIP_ROWS;

    // Marquee with no side restriction: use scroll animation for natural single-pass completion.
    if (style === 'marquee' && side === undefined) {
      const anim = createScrollAnimation({
        text, loop: false, size,
        ...(composite === 'overlay' ? { stripRows: OVERLAY_STRIP_ROWS, stripStart: textStripStart } : {}),
      });

      if (composite === 'replace') {
        stopAnim();
        runOnModules(anim, undefined, () => {
          stopCurrentAnim = null; // clear before complete() so next intent sees no live anim
          dispatcher.complete(intent.id);
        });
        return;
      }

      const replaceStart = Math.max(0, textStripStart - 1);
      const replaceEnd = Math.min(FRAME_ROWS, textStripStart + OVERLAY_STRIP_ROWS + 1);

      let stoppedScroll = false;
      stopCurrentOverlay = () => { stoppedScroll = true; anim.stop(); setActiveOverlay(null); };
      void (async () => {
        const iter = anim[Symbol.asyncIterator]();
        const frameMs = 1000 / 20;
        let nextAt = Date.now();
        while (!stoppedScroll) {
          const result = await iter.next();
          if (stoppedScroll || result.done) break;
          const [lf, rf] = result.value;
          setActiveOverlay({ left: lf, right: rf, mode: intent.overlayMode ?? 'replace', stripStart: replaceStart, stripEnd: replaceEnd });
          nextAt += frameMs;
          const wait = nextAt - Date.now();
          if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
        }
        if (!stoppedScroll) {
          setActiveOverlay(null);
          stopCurrentOverlay = null;
          const remaining = intent.expiresAt - Date.now();
          setTimeout(() => dispatcher.gc(), Math.max(0, remaining));
        }
      })();
      return;
    }

    // All other styles (and marquee with side restriction): use TextRenderer, loop until expiresAt.
    const widgetCfg = {
      text,
      style,
      size,
      ...(intent.textSpeed !== undefined ? { speed: intent.textSpeed } : {}),
      ...(intent.textFlicker !== undefined ? { flicker: intent.textFlicker } : {}),
      ...(intent.textTransition !== undefined ? { transition: intent.textTransition } : {}),
    };
    const rendL = createTextRenderer(widgetCfg, 'left');
    const rendR = createTextRenderer(widgetCfg, 'right');

    if (composite === 'replace') {
      stopAnim();
      stopCurrentAnim = runTextRenderersOnModules(rendL, rendR, intent.expiresAt, side, () => {
        stopCurrentAnim = null; // clear before complete() so next intent sees no live anim
        dispatcher.complete(intent.id);
      });
      return;
    }

    // Overlay path for non-marquee styles
    const replaceStart = Math.max(0, textStripStart - 1);
    const replaceEnd = Math.min(FRAME_ROWS, textStripStart + OVERLAY_STRIP_ROWS + 1);

    let stopped = false;
    stopCurrentOverlay = () => { stopped = true; rendL.stop(); rendR.stop(); setActiveOverlay(null); };
    void (async () => {
      const frameMs = 1000 / 20;
      let nextAt = Date.now();
      while (!stopped && Date.now() < intent.expiresAt) {
        const now = new Date();
        const lf = side !== 'right' ? rendL.render(now) : null;
        const rf = side !== 'left' ? rendR.render(now) : null;
        setActiveOverlay({ left: lf, right: rf, mode: intent.overlayMode ?? 'replace', stripStart: replaceStart, stripEnd: replaceEnd });
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

  function flipFrameH(frame: Frame): Frame {
    const out = createFrame();
    for (let col = 0; col < FRAME_COLS; col++)
      for (let row = 0; row < FRAME_ROWS; row++)
        (out as Uint8Array)[(FRAME_COLS - 1 - col) * FRAME_ROWS + row] = (frame as Uint8Array)[col * FRAME_ROWS + row] ?? 0;
    return out;
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

    const loopDurationMs = intent.loopCount !== undefined
      ? dmxFrames.reduce((s, f) => s + f.delayMs, 0) * intent.loopCount
      : undefined;
    if (loopDurationMs !== undefined) {
      intent.durationMs = Math.max(loopDurationMs, 50);
      intent.expiresAt = Date.now() + intent.durationMs;
    }
    const deadline = Date.now() + intent.durationMs;
    let stopped = false;

    if (composite === 'replace') {
      stopAnim();
      stopCurrentAnim = () => { stopped = true; };
    } else {
      stopCurrentOverlay = () => { stopped = true; setActiveOverlay(null); };
    }

    // Pre-compute transitions using the first DMX frame as reference
    const tf = intent.transition;
    type DualStep = { left: Frame | null; right: Frame | null; delayMs: number };
    let entrySteps: DualStep[] = [];
    let exitSteps:  DualStep[] = [];
    if (tf) {
      const fp = base64ToFrame(dmxFrames[0]!.pixels, dmxWidth * dmxHeight);
      let leftRef: Frame;
      let rightRef: Frame;
      if (dual) {
        leftRef  = new Uint8Array(FRAME_SIZE) as unknown as Frame;
        rightRef = new Uint8Array(FRAME_SIZE) as unknown as Frame;
        for (let c = 0; c < FRAME_COLS; c++)
          for (let r = 0; r < FRAME_ROWS; r++) {
            (leftRef  as Uint8Array)[c * FRAME_ROWS + r] = fp[c * FRAME_ROWS + r] ?? 0;
            (rightRef as Uint8Array)[c * FRAME_ROWS + r] = fp[(c + FRAME_COLS) * FRAME_ROWS + r] ?? 0;
          }
      } else {
        leftRef  = fp as unknown as Frame;
        rightRef = fp as unknown as Frame;
      }
      const leftEntry  = getTransitionFrames(leftRef,  tf, true);
      const leftExit   = getTransitionFrames(leftRef,  tf, false);
      const rightEntry = dual ? getTransitionFrames(rightRef, tf, true)  : leftEntry;
      const rightExit  = dual ? getTransitionFrames(rightRef, tf, false) : leftExit;
      const BLANK = createFrame();
      const [leftPresent, rightPresent] = (tf === 'wipe' && dual)
        ? [deviceAvailable.get(leftDev) ?? false, deviceAvailable.get(rightDev) ?? false]
        : [false, false];
      // In overlay mode, idle side should pass null (HUD shows through). In replace mode,
      // send BLANK so the device goes dark while the other panel is transitioning.
      const idle = composite === 'overlay' ? null : BLANK;
      if (tf === 'wipe' && dual && leftPresent && rightPresent) {
        // Staggered: left panel transitions fully, then right panel transitions.
        for (const { frame: f, delayMs } of leftEntry)  entrySteps.push({ left: f,       right: idle,     delayMs });
        for (const { frame: f, delayMs } of rightEntry) entrySteps.push({ left: leftRef, right: f,        delayMs });
        for (const { frame: f, delayMs } of leftExit)   exitSteps.push({ left: f,        right: rightRef, delayMs });
        for (const { frame: f, delayMs } of rightExit)  exitSteps.push({ left: idle,     right: f,        delayMs });
      } else if (tf === 'slide' && dual) {
        // Full-width pan: the 18-wide image slides in from the left across both panels.
        // Each step shifts the image one column right; both panels update simultaneously.
        for (let s = 1; s <= dmxWidth; s++) {
          const lf = createFrame();
          const rf = createFrame();
          for (let d = 0; d < FRAME_COLS; d++) {
            const imgCol = d + dmxWidth - s;
            if (imgCol < dmxWidth)
              for (let row = 0; row < FRAME_ROWS; row++)
                (lf as Uint8Array)[d * FRAME_ROWS + row] = fp[imgCol * FRAME_ROWS + row] ?? 0;
          }
          for (let d = 0; d < FRAME_COLS; d++) {
            const imgCol = FRAME_COLS + d + dmxWidth - s;
            if (imgCol < dmxWidth)
              for (let row = 0; row < FRAME_ROWS; row++)
                (rf as Uint8Array)[d * FRAME_ROWS + row] = fp[imgCol * FRAME_ROWS + row] ?? 0;
          }
          entrySteps.push({ left: lf, right: rf, delayMs: 30 });
        }
        for (let s = 1; s <= dmxWidth; s++) {
          const lf = createFrame();
          const rf = createFrame();
          for (let d = 0; d < FRAME_COLS; d++) {
            const imgCol = d - s;
            if (imgCol >= 0)
              for (let row = 0; row < FRAME_ROWS; row++)
                (lf as Uint8Array)[d * FRAME_ROWS + row] = fp[imgCol * FRAME_ROWS + row] ?? 0;
          }
          for (let d = 0; d < FRAME_COLS; d++) {
            const imgCol = FRAME_COLS + d - s;
            if (imgCol >= 0)
              for (let row = 0; row < FRAME_ROWS; row++)
                (rf as Uint8Array)[d * FRAME_ROWS + row] = fp[imgCol * FRAME_ROWS + row] ?? 0;
          }
          exitSteps.push({ left: lf, right: rf, delayMs: 30 });
        }
      } else {
        for (let i = 0; i < leftEntry.length; i++)
          entrySteps.push({ left: leftEntry[i]!.frame, right: rightEntry[i]!.frame, delayMs: leftEntry[i]!.delayMs });
        for (let i = 0; i < leftExit.length; i++)
          exitSteps.push({ left: leftExit[i]!.frame, right: rightExit[i]!.frame, delayMs: leftExit[i]!.delayMs });
      }
    }
    // Apply mirror/side to transition steps for single-panel assets
    if (!dual && (intent.mirror || intent.side)) {
      const blank = () => composite === 'overlay' ? null : createFrame();
      for (const step of [...entrySteps, ...exitSteps]) {
        if (intent.side === 'right') { step.left = blank(); }
        else if (intent.side === 'left') { step.right = blank(); }
        else if (intent.mirror && step.left !== null) { step.right = flipFrameH(step.left); }
      }
    }

    const adjDeadline = deadline - exitSteps.reduce((s, step) => s + step.delayMs, 0);

    for (const { left: lf, right: rf, delayMs } of entrySteps) {
      if (stopped) break;
      if (composite === 'replace') {
        if (lf !== null) try { if (leftDev)  await transport.frameBw(packBW(lf), leftDev);  } catch { /* non-fatal */ }
        if (rf !== null) try { if (rightDev) await transport.frameBw(packBW(rf), rightDev); } catch { /* non-fatal */ }
      } else {
        setActiveOverlay({ left: lf, right: rf, ...(intent.overlayMode !== undefined ? { mode: intent.overlayMode } : {}) });
      }
      if (delayMs > 0 && !stopped) await new Promise<void>(r => setTimeout(r, delayMs));
    }

    const renderFrame = async (dmxFrame: { pixels: string; delayMs: number }) => {
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
          setActiveOverlay({ left: leftBuf, right: rightBuf, ...(intent.overlayMode !== undefined ? { mode: intent.overlayMode } : {}) });
        }
      } else {
        const framePx = pixels as unknown as Frame;
        const leftPx: Frame | null = intent.side === 'right' ? (composite === 'overlay' ? null : createFrame()) : framePx;
        const rightPx: Frame | null = intent.side === 'left' ? (composite === 'overlay' ? null : createFrame()) : (intent.mirror ? flipFrameH(framePx) : framePx);
        if (composite === 'replace') {
          const [cl2, cr2] = composeFrames([leftPx ?? createFrame(), rightPx ?? createFrame()], activeOverlay);
          if (dmxMode === 'bw') {
            try { if (leftDev) await transport.frameBw(packBW(cl2), leftDev); } catch { /* non-fatal */ }
            try { if (rightDev) await transport.frameBw(packBW(cr2), rightDev); } catch { /* non-fatal */ }
          } else {
            try { if (leftDev) await transport.frameGray(cl2, leftDev); } catch { /* non-fatal */ }
            try { if (rightDev) await transport.frameGray(cr2, rightDev); } catch { /* non-fatal */ }
          }
        } else {
          setActiveOverlay({ left: leftPx, right: rightPx, ...(intent.overlayMode !== undefined ? { mode: intent.overlayMode } : {}) });
        }
      }
      if (dmxFrame.delayMs > 0 && !stopped) await new Promise<void>(r => setTimeout(r, dmxFrame.delayMs));
    };

    if (intent.loopCount !== undefined) {
      for (let i = 0; i < intent.loopCount && !stopped; i++) {
        for (const dmxFrame of dmxFrames) {
          if (stopped) break;
          await renderFrame(dmxFrame);
        }
      }
    } else {
      outer: do {
        for (const dmxFrame of dmxFrames) {
          if (stopped || Date.now() >= adjDeadline) break outer;
          await renderFrame(dmxFrame);
        }
      } while (!stopped && Date.now() < adjDeadline);
    }

    for (const { left: lf, right: rf, delayMs } of exitSteps) {
      if (stopped) break;
      if (composite === 'replace') {
        if (lf !== null) try { if (leftDev)  await transport.frameBw(packBW(lf), leftDev);  } catch { /* non-fatal */ }
        if (rf !== null) try { if (rightDev) await transport.frameBw(packBW(rf), rightDev); } catch { /* non-fatal */ }
      } else {
        setActiveOverlay({ left: lf, right: rf, ...(intent.overlayMode !== undefined ? { mode: intent.overlayMode } : {}) });
      }
      if (delayMs > 0 && !stopped) await new Promise<void>(r => setTimeout(r, delayMs));
    }

    if (!stopped) {
      if (composite === 'replace') {
        stopCurrentAnim = null; // clear before complete() so next intent sees no live anim
        dispatcher.complete(intent.id);
      } else {
        setActiveOverlay(null);
        stopCurrentOverlay = null;
        const remaining = intent.expiresAt - Date.now();
        setTimeout(() => dispatcher.gc(), Math.max(0, remaining));
      }
    }
  }

  function startNotificationAnimation(intent: DisplayIntent): void {
    currentAnimName = 'notification';
    stopOverlay();
    const composite = intent.composite ?? 'replace';
    if (intent.style === 'dmx') {
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
      // HUD is the resting state — resume it unless it's already running underneath
      // (e.g. an overlay notification just cleared and the HUD loop never stopped).
      if (!stopCurrentAnim) stopCurrentAnim = runHudOnModules();
    }
  });

  // Notification source watchers
  const disposeWatches: Array<() => void> = [];

  function routeAndPush(base: DisplayIntent): void {
    const route = routeNotification(base, currentConfig.notification_rules ?? []);
    recordNotificationExample(base.source, base.content);
    if (route.action === 'suppress') return;
    const intent: DisplayIntent = { ...base };
    intent.style = route.action === 'text' ? 'text' : 'dmx';
    intent.composite = route.composite;
    if (route.assetPath !== undefined) intent.assetPath = route.assetPath;
    if (route.overlayMode !== undefined) intent.overlayMode = route.overlayMode;
    if (route.transition !== undefined) intent.transition = route.transition;
    if (route.loopCount !== undefined) {
      intent.loopCount = route.loopCount;
    } else if (route.durationMs !== undefined) {
      intent.durationMs = route.durationMs;
      intent.expiresAt = Date.now() + route.durationMs;
    }
    if (route.mirror !== undefined) intent.mirror = route.mirror;
    if (route.side !== undefined) intent.side = route.side;
    if (route.textContent !== undefined) intent.textContent = route.textContent;
    if (route.textSize !== undefined) intent.textSize = route.textSize;
    if (route.textStyle !== undefined) intent.textStyle = route.textStyle;
    if (route.textSpeed !== undefined) intent.textSpeed = route.textSpeed;
    if (route.textFlicker !== undefined) intent.textFlicker = route.textFlicker;
    if (route.textTransition !== undefined) intent.textTransition = route.textTransition;
    dispatcher.push(intent);
  }

  let currentEcSource: SwitchSource = 'none';
  let currentSwitchState: SwitchState | null = null;

  function startEcSwitches(): () => void {
    currentEcSource = 'none';
    currentSwitchState = null;
    const nativeHelperPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dark-matrix-privacy');
    return watchSwitches((e) => {
      routeAndPush(ecSwitchIntent(e));
    }, {
      intervalMs: 500,
      nativeHelperPath,
      ...(currentConfig.ectool_path !== undefined ? { ectoolPath: currentConfig.ectool_path } : {}),
      onSource: (s) => { currentEcSource = s; },
      onState: (s) => { currentSwitchState = s; },
    });
  }
  let disposeEcSwitches = startEcSwitches();
  disposeWatches.push(() => disposeEcSwitches());

  disposeWatches.push(watchVms((e) => {
    routeAndPush(vmIntent(e));
  }, { intervalMs: 2000 }));

  disposeWatches.push(watchDesktopNotifications((n) => {
    routeAndPush(notificationIntent(n));
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

  // Feed proc stats into the trigger engine + battery notification monitoring
  const firedBatteryThresholds = new Set<number>();
  let prevBatteryCharging: boolean | null = null;

  disposeWatches.push(watchProcStats((stats) => {
    triggerEngine.updateStats(stats);

    const { batteryPct, batteryCharging } = stats;
    if (batteryPct !== null && batteryCharging !== null) {
      // Full clear on discharging → charging transition
      if (prevBatteryCharging === false && batteryCharging === true) {
        firedBatteryThresholds.clear();
      }
      prevBatteryCharging = batteryCharging;

      if (!batteryCharging) {
        // Re-arm individual thresholds the battery has risen back above
        for (const fired of [...firedBatteryThresholds]) {
          if (batteryPct > fired) firedBatteryThresholds.delete(fired);
        }

        // Fire the highest unfired threshold crossed, one per interval
        const ruleThresholds = (currentConfig.notification_rules ?? [])
          .filter(r => r.source === 'battery' && r.battery_threshold !== undefined)
          .map(r => r.battery_threshold!);
        const baseThresholds = currentConfig.battery_alerts?.thresholds
          ?? (ruleThresholds.length > 0 ? [] : [20, 10, 5]);
        const thresholds = [...new Set([...baseThresholds, ...ruleThresholds])].sort((a, b) => b - a);
        for (const threshold of thresholds) {
          if (batteryPct <= threshold && !firedBatteryThresholds.has(threshold)) {
            firedBatteryThresholds.add(threshold);
            routeAndPush(batteryIntent(batteryPct));
            break;
          }
        }
      }
    }
  }, { intervalMs: 2000 }));

  // Brightness loop
  let disposeBrightness = startBrightnessLoop(currentConfig, async (pct) => {
    currentBrightness = pct;
    await setBrightness(pct);
  });

  const sockPath = socketPath();
  const server = net.createServer((socket) => {
    let buf = '';
    let activeVizStream: { stop: () => void; setFullBandCount: (n: number) => void } | null = null;
    socket.on('data', (chunk) => {
      buf += chunk.toString();

      // HTTP POST /hook (Claude activity)
      const body = extractHttpBody(buf);
      if (body !== null) {
        const event = parseClaudeHook(body.trim());
        if (event && event.type !== 'unknown') {
          for (const r of claudeRenderers) {
            r.onEvent({
              type: event.type,
              ...(event.type === 'tool_use' ? { tool: event.tool } : {}),
              sessionId: event.session_id,
              rawByteLen: body.length,
            });
          }
          const intent = claudeIntent(event);
          if (intent) routeAndPush(intent);
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
              socket.write(JSON.stringify({ ok: true, pong: true, version: DAEMON_VERSION }) + '\n');
              break;
            case 'status': {
              const modulesPayload = {
                ok: true,
                modules: {
                  left:  deviceAvailable.get(currentConfig.modules.left)  ?? false,
                  right: deviceAvailable.get(currentConfig.modules.right) ?? false,
                },
                uptimeMs: Date.now() - daemonStartedAt,
                animationName: currentAnimName,
                brightnessValue: currentBrightness,
                brightnessMode: currentConfig.brightness.mode,
                version: DAEMON_VERSION,
                ...(currentSwitchState !== null ? { switches: currentSwitchState } : {}),
              };
              socket.write(JSON.stringify(modulesPayload) + '\n');
              break;
            }
            case 'ec-status':
              socket.write(JSON.stringify({ ok: true, source: currentEcSource }) + '\n');
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
            case 'notification-history': {
              const history: Record<string, string[]> = {};
              for (const [src, list] of notificationHistory) history[src] = [...list];
              socket.write(JSON.stringify({ ok: true, history }) + '\n');
              break;
            }
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
              if (!hudHardwareActive && currentAnimName !== 'hud') {
                // Stop non-HUD takeovers (audio-eq/gif/scroll) — they don't check frameHeld*
                // flags and would overwrite the preview. The HUD loop checks those flags before
                // each write, so leave it running so the un-held side continues animating.
                stopAnim();
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
            case 'startup-preview': {
              const sp = msg as {
                cmd: string;
                animation?: string;
                scroll_text?: string;
                dmx_path?: string;
                overlay_mode?: 'or' | 'replace' | 'xor' | 'halo';
                transition?: 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
                dmx_duration_ms?: number;
              };
              const spAnim = sp.animation ?? currentConfig.startup.animation;
              if (spAnim === 'dmx') {
                // DMX runs as an overlay so the idle/HUD animation stays visible underneath.
                // Fall back to replace if nothing is running — overlay needs a background loop
                // to composite and push frames, otherwise hardware times out and goes black.
                const rawPath = sp.dmx_path ?? currentConfig.startup.dmx_path;
                if (rawPath) {
                  // Play through once (loopCount: 1, ignoring durationMs) unless
                  // dmx_duration_ms is set — same as the boot path.
                  const customDuration = sp.dmx_duration_ms;
                  const durationMs = customDuration ?? 2000;
                  const composite = stopCurrentAnim !== null ? 'overlay' : 'replace';
                  const intent: DisplayIntent = {
                    id: 'startup-preview',
                    source: 'manual',
                    priority: 50,
                    content: '',
                    durationMs,
                    expiresAt: Date.now() + durationMs,
                    style: 'dmx',
                    assetPath: rawPath,
                    composite,
                    ...(customDuration === undefined ? { loopCount: 1 } : {}),
                    ...(sp.overlay_mode !== undefined ? { overlayMode: sp.overlay_mode } : {}),
                    ...(sp.transition !== undefined ? { transition: sp.transition } : {}),
                  };
                  void startDmxNotification(intent, composite);
                }
              } else {
                stopAnim();
                const onDone = () => { if (!dispatcher.current()) resumeAfterInterrupt(); };
                if (spAnim === 'gol-random') {
                  runOnModules(null, () => createGolAnimation({ frames: 420, loop: false }), onDone);
                } else if (spAnim === 'scroll') {
                  const text = sp.scroll_text ?? currentConfig.startup.scroll_text;
                  runOnModules(createScrollAnimation({ text: text || ' ', loop: false }), undefined, onDone);
                }
              }
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'frame-stop':
              frameHeldLeft = false;
              frameHeldRight = false;
              // If the preview stopped the resting HUD, restart it; if the HUD loop kept
              // running (it honors frameHeld* flags), leave it alone.
              if (!stopCurrentAnim) stopCurrentAnim = runHudOnModules();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            case 'audio-viz': {
              const m = msg as { cmd: string; source?: string; fullBandCount?: number };
              const source: AudioSource = m.source === 'mic' ? 'mic' : 'monitor';
              const fullBandCount = typeof m.fullBandCount === 'number' && Number.isInteger(m.fullBandCount) && m.fullBandCount > 0 && m.fullBandCount <= 512 ? m.fullBandCount : 0;
              socket.write(JSON.stringify({ ok: true }) + '\n');
              if (hudHardwareActive && hudAudioStreaming) {
                // HUD loop is actively streaming audio — subscribe to its shared
                // band stream to avoid a competing pw-record process.
                if (source !== hudAudioSource) {
                  hudAudioSource = source;
                  stopAnim();
                  stopCurrentAnim = runHudOnModules();
                }
                const key = Symbol();
                hudAudioListeners.set(key, (ctx) => {
                  if (!socket.destroyed) socket.write(JSON.stringify({ type: 'audio-bands', ...ctx }) + '\n');
                });
                const unsub = () => hudAudioListeners.delete(key);
                socket.once('close', unsub);
                socket.once('error', unsub);
              } else {
                // HUD is not streaming audio (no audio widget), or HUD is not
                // active — start an independent pw-record for this subscriber.
                if (hudHardwareActive) hudAudioSource = source;
                activeVizStream?.stop();
                activeVizStream = streamAudioBands(source, (ctx) => {
                  if (socket.destroyed) return;
                  socket.write(JSON.stringify({ type: 'audio-bands', ...ctx }) + '\n');
                }, undefined, fullBandCount > 0 ? { fullBandCount } : undefined);
                socket.once('close', () => { activeVizStream?.stop(); activeVizStream = null; });
                socket.once('error', () => { activeVizStream?.stop(); activeVizStream = null; });
              }
              break;
            }
            case 'audio-viz-setbands': {
              const m = msg as { cmd: string; bandCount?: number };
              const n = typeof m.bandCount === 'number' && Number.isInteger(m.bandCount) && m.bandCount > 0 && m.bandCount <= 512 ? m.bandCount : 0;
              activeVizStream?.setFullBandCount(n);
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'audio-hardware-start': {
              const m = msg as { cmd: string; style?: string; source?: string };
              const knownStyles = AUDIO_STYLES.map(s => s.id as string);
              const isAudioStyle = (s: string): s is AudioStyle => knownStyles.includes(s);
              const style: AudioStyle = m.style && isAudioStyle(m.style) ? m.style : 'dark-matter';
              const source: AudioSource = m.source === 'mic' ? 'mic' : 'monitor';
              stopAnim();
              stopCurrentAnim = runAudioEqOnModules(source, style);
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'audio-hardware-stop': {
              startRestingState();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'hud-hardware-start': {
              stopAnim();
              hudHardwareActive = true;
              stopCurrentAnim = runHudOnModules();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'hud-hardware-stop': {
              hudHardwareActive = false;
              hudAudioSource = 'monitor';
              // Drop back to the resting HUD. The hardware HUD loop is already the resting
              // animation, so keep it running if it never stopped.
              if (!stopCurrentAnim) stopCurrentAnim = runHudOnModules();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'life-hardware-stop': {
              hudHardwareActive = false;
              startRestingState();
              socket.write(JSON.stringify({ ok: true }) + '\n');
              break;
            }
            case 'hud-config': {
              const m = msg as HudConfigMessage;
              const biomeNames = new Set((currentConfig.biome_presets ?? []).map(b => b.name));
              const validBiome = (name: string) => name === 'random' || biomeNames.has(name);
              if (m.leftWidget === 'life' && typeof m.leftBiomeName === 'string' && !validBiome(m.leftBiomeName)) {
                socket.write(JSON.stringify({ ok: false, error: `unknown biome: "${m.leftBiomeName}"` }) + '\n');
                break;
              }
              if (m.rightWidget === 'life' && typeof m.rightBiomeName === 'string' && !validBiome(m.rightBiomeName)) {
                socket.write(JSON.stringify({ ok: false, error: `unknown biome: "${m.rightBiomeName}"` }) + '\n');
                break;
              }
              const clockFallback = { widget: 'clock', face: 'elegant' } as const;
              const newHud = { ...currentConfig.hud };
              const leftWidgetType = (typeof m.leftWidget === 'string' && m.leftWidget in DAEMON_WIDGET_REGISTRY)
                ? m.leftWidget as keyof typeof DAEMON_WIDGET_REGISTRY
                : 'clock' as const;
              const rightWidgetType = (typeof m.rightWidget === 'string' && m.rightWidget in DAEMON_WIDGET_REGISTRY)
                ? m.rightWidget as keyof typeof DAEMON_WIDGET_REGISTRY
                : 'clock' as const;
              const newLeft = DAEMON_WIDGET_REGISTRY[leftWidgetType].extractParams(m, 'left', currentConfig)
                ?? clockFallback;
              const newRight = DAEMON_WIDGET_REGISTRY[rightWidgetType].extractParams(m, 'right', currentConfig)
                ?? clockFallback;
              newHud.left = newLeft;
              newHud.right = newRight;
              currentConfig = { ...currentConfig, hud: newHud };
              if ((hudHardwareActive || currentAnimName === 'hud') && !dispatcher.current()) {
                frameHeldLeft = false;
                frameHeldRight = false;
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
                style?: 'text' | 'dmx';
                textSize?: 'tiny' | 'small' | 'medium' | 'large';
                textStyle?: string;
                textSpeed?: string;
                textFlicker?: string;
                textTransition?: string;
                textPosition?: 'top' | 'middle' | 'bottom';
                overlayMode?: 'or' | 'replace' | 'xor' | 'halo';
                transition?: 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
                assetPath?: string;
                composite?: 'replace' | 'overlay';
                durationMsOverride?: number;
                loopCount?: number;
                mirror?: boolean;
                side?: 'left' | 'right';
              };
              const n = { appName: m.appName ?? 'test', summary: m.summary ?? 'test notification', body: m.body ?? '' };
              const base = notificationIntent(n);
              const route = routeNotification(base, currentConfig.notification_rules ?? [], 'text');
              const routeStyle: 'text' | 'dmx' = route.action === 'design' ? 'dmx' : 'text';
              const effectiveStyle = m.style ?? (route.action === 'suppress' ? undefined : routeStyle);
              if (effectiveStyle !== undefined) {
                const intent: DisplayIntent = { ...base };
                intent.style = effectiveStyle;
                intent.composite = m.composite ?? route.composite;
                if (m.textSize !== undefined) intent.textSize = m.textSize as TextSize;
                if (m.textStyle !== undefined && (TEXT_STYLES as readonly string[]).includes(m.textStyle)) intent.textStyle = m.textStyle as TextStyle;
                if (m.textSpeed !== undefined && (TEXT_SPEEDS as readonly string[]).includes(m.textSpeed)) intent.textSpeed = m.textSpeed as TextSpeed;
                if (m.textFlicker !== undefined && (TEXT_FLICKERS as readonly string[]).includes(m.textFlicker)) intent.textFlicker = m.textFlicker as TextFlicker;
                if (m.textTransition !== undefined && (TEXT_TRANSITIONS as readonly string[]).includes(m.textTransition)) intent.textTransition = m.textTransition as TextTransition;
                if (m.textPosition !== undefined) intent.textPosition = m.textPosition;
                if (m.overlayMode !== undefined) intent.overlayMode = m.overlayMode;
                if (m.transition !== undefined) intent.transition = m.transition;
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
                if (m.loopCount !== undefined) intent.loopCount = m.loopCount;
                if (m.mirror !== undefined) intent.mirror = m.mirror;
                if (m.side !== undefined) intent.side = m.side;
                dispatcher.push(intent);
              }
              socket.write(JSON.stringify({ ok: true, action: effectiveStyle ?? 'suppress' }) + '\n');
              break;
            }
            case 'twitch-notify': {
              // The IPC socket is user-private via XDG_RUNTIME_DIR permissions (trusted-local-only).
              // Any process running as this user can send crafted twitch-notify commands.
              const m = msg as { cmd: string; eventType?: string; event?: Record<string, unknown> };
              const eventType = m.eventType ?? '';
              const event = m.event ?? {};
              let content = '';
              let priority = 30;
              let durationMs = 5000;
              const field = (key: string) => String(event[key] ?? '').slice(0, 64);
              switch (eventType) {
                case 'channel.follow':
                  content = `FOLLOW ${field('user_name')}`;
                  priority = 30; durationMs = 5000;
                  break;
                case 'channel.subscribe':
                  content = `SUB ${field('user_name')}`;
                  priority = 60; durationMs = 8000;
                  break;
                case 'channel.cheer':
                  content = `BITS ${field('bits')}`;
                  priority = 60; durationMs = 8000;
                  break;
                case 'channel.raid':
                  content = `RAID ${field('from_broadcaster_user_name')}`;
                  priority = 90; durationMs = 10000;
                  break;
                default:
                  break;
              }
              if (content) {
                const base: DisplayIntent = {
                  id: `twitch-${eventType}-${Date.now()}`,
                  source: 'twitch',
                  priority,
                  content,
                  durationMs,
                  expiresAt: Date.now() + durationMs,
                };
                recordNotificationExample('twitch', content);
                routeAndPush(base);
              }
              socket.write(JSON.stringify({ ok: true }) + '\n');
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
    disposeEcSwitches();
    disposeEcSwitches = startEcSwitches();
    // Restart the resting HUD if it's currently showing so it picks up any
    // changed hud / module settings. Don't clobber a running audio EQ — the cast
    // visualizer writes its selection to config, and that save must not knock the
    // modules back to HUD while the EQ is the active driver.
    if (!hudHardwareActive && !frameHeldLeft && !frameHeldRight && !dispatcher.current() && currentAnimName !== 'audio-eq') {
      startRestingState();
    }
  });

  // Startup animation, then settle on the resting HUD.
  const restAfterStartup = () => { if (!dispatcher.current()) startRestingState(); };
  if (currentConfig.startup.animation !== 'none') {
    if (currentConfig.startup.animation === 'gol-random') {
      runOnModules(null, () => createGolAnimation({ frames: 420, loop: false }), restAfterStartup);
    } else if (currentConfig.startup.animation === 'scroll') {
      const text = currentConfig.startup.scroll_text;
      runOnModules(createScrollAnimation({ text, loop: false }), undefined, restAfterStartup);
    } else if (currentConfig.startup.animation === 'dmx') {
      const rawPath = currentConfig.startup.dmx_path;
      if (rawPath) {
        // Default: play the DMX through exactly once (loopCount: 1, which plays
        // every frame and ignores durationMs). A configured dmx_duration_ms
        // instead time-bounds playback to a fixed window — which may truncate a
        // long animation or repeat a short one.
        const customDuration = currentConfig.startup.dmx_duration_ms;
        const durationMs = customDuration ?? 2000;
        const bootIntent: DisplayIntent = {
          id: 'startup',
          source: 'manual',
          priority: 50,
          content: '',
          durationMs,
          expiresAt: Date.now() + durationMs,
          style: 'dmx',
          assetPath: rawPath,
          composite: 'replace',
          ...(customDuration === undefined ? { loopCount: 1 } : {}),
          ...(currentConfig.startup.overlay_mode !== undefined ? { overlayMode: currentConfig.startup.overlay_mode } : {}),
          ...(currentConfig.startup.transition !== undefined ? { transition: currentConfig.startup.transition } : {}),
        };
        void startDmxNotification(bootIntent, 'replace');
      } else { process.stderr.write('dark-matrix: startup.animation is dmx but dmx_path is not set\n'); restAfterStartup(); }
    } else {
      runOnModules(null, () => createStartupAnimation({ style: 'wipe' }), restAfterStartup);
    }
  } else {
    startRestingState();
  }

  process.stderr.write(`dark-matrix daemon started, socket: ${sockPath}\n`);

  const cleanup = async () => {
    stopAnim();
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
  let exiting = false;
  const uncaught = (err: unknown) => {
    if (exiting) return;
    exiting = true;
    process.stderr.write(`dark-matrix: fatal: ${String(err)}\n`);
    cleanup().catch(() => {}).finally(() => process.exit(1));
  };
  const unhandledRejection = (reason: unknown) => {
    if (exiting) return;
    exiting = true;
    process.stderr.write(`dark-matrix: unhandledRejection: ${String(reason)}\n`);
    cleanup().catch(() => {}).finally(() => process.exit(1));
  };

  process.once('SIGTERM', sigterm);
  process.once('SIGINT', sigint);
  process.once('uncaughtException', uncaught);
  process.once('unhandledRejection', unhandledRejection);

  return async () => {
    process.off('SIGTERM', sigterm);
    process.off('SIGINT', sigint);
    process.off('uncaughtException', uncaught);
    process.off('unhandledRejection', unhandledRejection);
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
