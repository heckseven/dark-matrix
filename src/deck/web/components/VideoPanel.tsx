import * as React from 'react';
import { create } from 'zustand';
import { createPreviewBridge } from '../preview.js';
import { Button } from './ui/button.js';
import { Checkbox } from './ui/checkbox.js';
import { Input } from './ui/input.js';
import { Select } from './ui/select.js';
import { Slider } from './ui/slider.js';
import { Toggle } from './ui/toggle.js';

// ── constants ──────────────────────────────────────────────────────────────
const CELL = 20;
const HW_COLS = 18;
const HW_ROWS = 34;
const FPS = 20;
const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;
const SVG_DOT = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><circle cx="${CELL / 2}" cy="${CELL / 2}" r="1.5" fill="#303030"/></svg>`)}")`;

// ── shared store ───────────────────────────────────────────────────────────
type Controls = { brightness: number; contrast: number; invert: boolean; dither: boolean };
type VState = {
  src: string | null;
  inputUrl: string;
  playing: boolean;
  loop: boolean;
  controls: Controls;
  currentTime: number;
  duration: number;
  settingsOpen: boolean;
  ytError: string | null;
  seekRequest: number | null;
  buffering: boolean;
  idle: boolean;
  setSrc(s: string | null): void;
  setInputUrl(s: string): void;
  setPlaying(b: boolean): void;
  setLoop(b: boolean): void;
  updateControls(p: Partial<Controls>): void;
  setCurrentTime(t: number): void;
  setDuration(d: number): void;
  setSettingsOpen(b: boolean): void;
  setYtError(e: string | null): void;
  seek(t: number): void;
  clearSeek(): void;
  setBuffering(b: boolean): void;
  setIdle(b: boolean): void;
};

const DEFAULT_CONTROLS: Controls = { brightness: 0, contrast: 1, invert: false, dither: false };

const INITIAL_DATA = {
  src: null as string | null,
  inputUrl: '',
  playing: false,
  loop: false,
  controls: { ...DEFAULT_CONTROLS },
  currentTime: 0,
  duration: 0,
  settingsOpen: false,
  ytError: null as string | null,
  seekRequest: null as number | null,
  buffering: false,
  idle: false,
};

export const useVStore = create<VState>((set) => ({
  ...INITIAL_DATA,
  setSrc: (src) => set({ src, ytError: null, currentTime: 0, duration: 0, seekRequest: null }),
  setInputUrl: (inputUrl) => set({ inputUrl }),
  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  updateControls: (p) => set(s => ({ controls: { ...s.controls, ...p } })),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setYtError: (ytError) => set({ ytError }),
  seek: (seekRequest) => set({ seekRequest }),
  clearSeek: () => set({ seekRequest: null }),
  setBuffering: (buffering) => set({ buffering }),
  setIdle: (idle) => set({ idle }),
}));

export function resetVStore() {
  useVStore.setState(INITIAL_DATA);
}

// ── helpers ────────────────────────────────────────────────────────────────
function processGray(v: number, c: Controls): number {
  const g = (v - 128) * c.contrast + 128 + c.brightness;
  return Math.max(0, Math.min(255, c.invert ? 255 - g : g));
}

function bwValue(g: number, row: number, col: number, dither: boolean): number {
  const threshold = dither ? (BAYER4[row % 4]![col % 4]! + 0.5) / 16 * 255 : 128;
  return g >= threshold ? 255 : 0;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── VideoHeader ────────────────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  { value: 'youtube', label: 'youtube' },
  { value: 'local', label: 'local video' },
];

export function VideoHeader() {
  const { inputUrl, setSrc, setInputUrl } = useVStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const blobRef = React.useRef<string | null>(null);
  const [sourceMode, setSourceMode] = React.useState<'youtube' | 'local'>('youtube');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    setSrc(`/api/youtube-stream?url=${encodeURIComponent(trimmed)}`);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    const url = URL.createObjectURL(file);
    blobRef.current = url;
    setSrc(url);
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="video/*" aria-label="Choose video file" className="hidden" onChange={handleFile} />
      <Select
        options={SOURCE_OPTIONS}
        value={sourceMode}
        onValueChange={v => setSourceMode(v as 'youtube' | 'local')}
        aria-label="Video source"
      />
      {sourceMode === 'youtube' ? (
        <form className="flex items-center gap-2" onSubmit={handleSubmit}>
          <Input className="w-48" placeholder="url" aria-label="YouTube URL" value={inputUrl} onChange={e => setInputUrl(e.target.value)} />
          <Button type="submit" variant="ghost" size="sm" disabled={!inputUrl.trim()}>watch</Button>
        </form>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>choose file</Button>
      )}
    </>
  );
}

// ── VideoSettingsToggle ────────────────────────────────────────────────────

export const VideoSettingsToggle = React.forwardRef<HTMLButtonElement>(function VideoSettingsToggle(_, ref) {
  const settingsOpen = useVStore(s => s.settingsOpen);
  const { setSettingsOpen } = useVStore.getState();
  return (
    <Button
      ref={ref}
      variant="ghost"
      aria-label="Video settings"
      tooltip="video settings"
      aria-pressed={settingsOpen}
      className={settingsOpen ? 'bg-accent text-accent-foreground' : ''}
      onClick={() => setSettingsOpen(!settingsOpen)}
    >
      ⚙
    </Button>
  );
});

// ── VideoTransportControls ─────────────────────────────────────────────────

export function VideoTransportControls() {
  const src = useVStore(s => s.src);
  const playing = useVStore(s => s.playing);
  const loop = useVStore(s => s.loop);
  const currentTime = useVStore(s => s.currentTime);
  const duration = useVStore(s => s.duration);
  const { setPlaying, setLoop, seek } = useVStore.getState();
  const disabled = !src;

  return (
    <div className="flex items-center">
      <Button variant="ghost" aria-label="Restart" tooltip="Restart" disabled={disabled}
        onClick={() => seek(0)}>
        {'|◁'}
      </Button>
      <Button variant="ghost" aria-label="Back 28 seconds" tooltip="Back 28 seconds" disabled={disabled}
        onClick={() => seek(Math.max(0, currentTime - 28))}>
        {'«28'}
      </Button>
      <Button variant="ghost" aria-label="Back 14 seconds" tooltip="Back 14 seconds" disabled={disabled}
        onClick={() => seek(Math.max(0, currentTime - 14))}>
        {'«14'}
      </Button>
      <Button variant="ghost" aria-label={playing ? 'Pause' : 'Play'} tooltip={playing ? 'Pause' : 'Play'}
        disabled={disabled}
        onClick={() => setPlaying(!playing)}>
        <span className="inline-block w-[1em] text-center">{playing ? '⏸' : '▶'}</span>
      </Button>
      <Button variant="ghost" aria-label="Forward 14 seconds" tooltip="Forward 14 seconds" disabled={disabled}
        onClick={() => seek(Math.min(duration || 0, currentTime + 14))}>
        {'14»'}
      </Button>
      <Button variant="ghost" aria-label="Forward 28 seconds" tooltip="Forward 28 seconds" disabled={disabled}
        onClick={() => seek(Math.min(duration || 0, currentTime + 28))}>
        {'28»'}
      </Button>
      <Toggle
        aria-label="Loop"
        pressed={loop}
        onPressedChange={setLoop}
      >
        ⟲
      </Toggle>
    </div>
  );
}

// ── VideoPanel ─────────────────────────────────────────────────────────────

export function VideoPanel({ topPad = 0, settingsToggleRef }: { topPad?: number; settingsToggleRef?: React.RefObject<HTMLButtonElement | null> }) {
  const src = useVStore(s => s.src);
  const playing = useVStore(s => s.playing);
  const controls = useVStore(s => s.controls);
  const settingsOpen = useVStore(s => s.settingsOpen);
  const currentTime = useVStore(s => s.currentTime);
  const duration = useVStore(s => s.duration);
  const ytError = useVStore(s => s.ytError);
  const seekRequest = useVStore(s => s.seekRequest);
  const buffering = useVStore(s => s.buffering);
  const loop = useVStore(s => s.loop);
  const idle = useVStore(s => s.idle);
  const { setPlaying, setCurrentTime, setDuration, setYtError, updateControls, clearSeek, setBuffering } = useVStore.getState();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const displayDivRef = React.useRef<HTMLDivElement>(null);
  const settingsPanelRef = React.useRef<HTMLElement>(null);
  const cellsRef = React.useRef<HTMLSpanElement[]>([]);
  const cellStatesRef = React.useRef<boolean[]>([]);
  const bridgeRef = React.useRef<ReturnType<typeof createPreviewBridge> | null>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const captureCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const captureCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const hwCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const hwCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const gridRef = React.useRef({ cols: 0, rows: 0 });
  const controlsRef = React.useRef<Controls>(useVStore.getState().controls);
  const srcRef = React.useRef(src);
  srcRef.current = src;
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return useVStore.subscribe(s => { controlsRef.current = s.controls; });
  }, []);

  React.useEffect(() => {
    if (!settingsOpen) return;
    settingsPanelRef.current?.focus();
    return () => { settingsToggleRef?.current?.focus(); };
  }, [settingsOpen, settingsToggleRef]);

  React.useEffect(() => {
    bridgeRef.current = createPreviewBridge(`ws://${location.host}/ws`);
    const cap = document.createElement('canvas');
    captureCanvasRef.current = cap;
    captureCtxRef.current = cap.getContext('2d', { willReadFrequently: true });
    const hw = document.createElement('canvas');
    hw.width = HW_COLS;
    hw.height = HW_ROWS;
    hwCanvasRef.current = hw;
    hwCtxRef.current = hw.getContext('2d', { willReadFrequently: true });
    return () => {
      bridgeRef.current?.stop();
      bridgeRef.current?.dispose();
      useVStore.getState().setPlaying(false);
    };
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recomputeGrid());
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name !== 'AbortError') setPlaying(false);
    });
    else video.pause();
  }, [playing]);

  React.useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(tick, 1000 / FPS);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [playing]);

  React.useEffect(() => {
    if (seekRequest === null) return;
    const v = videoRef.current;
    if (v) v.currentTime = seekRequest;
    clearSeek();
  }, [seekRequest, clearSeek]);

  React.useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = 'html.video-idle * { cursor: none !important; } html.video-idle *:focus, html.video-idle *:focus-visible { cursor: default !important; }';
    document.head.appendChild(styleEl);

    function resetIdle() {
      useVStore.getState().setIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => { if (useVStore.getState().src) useVStore.getState().setIdle(true); }, 3000);
    }

    resetIdle();
    document.addEventListener('mousemove', resetIdle);
    document.addEventListener('mousedown', resetIdle);
    document.addEventListener('keydown', resetIdle);

    return () => {
      styleEl.remove();
      document.removeEventListener('mousemove', resetIdle);
      document.removeEventListener('mousedown', resetIdle);
      document.removeEventListener('keydown', resetIdle);
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      useVStore.getState().setIdle(false);
      document.documentElement.classList.remove('video-idle');
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle('video-idle', idle);
  }, [idle]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (!el) return;
      const tag = el.tagName.toLowerCase();
      if (['input', 'textarea', 'select', 'button', 'a'].includes(tag)) return;
      if ((el as HTMLElement).isContentEditable) return;
      const role = el.getAttribute('role') ?? '';
      if (['button', 'link', 'menuitem', 'option', 'textbox', 'combobox', 'slider'].includes(role)) return;
      const state = useVStore.getState();
      if (!state.src) return;
      if (e.key === ' ') {
        e.preventDefault();
        state.setPlaying(!state.playing);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        state.seek(Math.max(0, state.currentTime - 14));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        state.seek(Math.min(state.duration || 0, state.currentTime + 14));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function recomputeGrid() {
    const container = containerRef.current;
    const displayDiv = displayDivRef.current;
    const video = videoRef.current;
    if (!container || !displayDiv || !video || !video.videoWidth) return;
    const { width: w, height: h } = container.getBoundingClientRect();
    const maxCols = Math.floor(w / CELL);
    const maxRows = Math.floor(h / CELL);
    if (maxCols < 1 || maxRows < 1) return;
    const ar = video.videoWidth / video.videoHeight;
    const cols = Math.min(maxCols, Math.floor(maxRows * ar));
    const rows = Math.max(1, Math.floor(cols / ar));
    gridRef.current = { cols, rows };

    const totalCells = cols * rows;
    const cells = cellsRef.current;
    displayDiv.style.gridTemplateColumns = `repeat(${cols}, ${CELL}px)`;
    displayDiv.style.width = `${cols * CELL}px`;
    displayDiv.style.height = `${rows * CELL}px`;

    while (cells.length < totalCells) {
      const span = document.createElement('span');
      span.textContent = '∗';
      span.style.cssText = 'display:flex;align-items:center;justify-content:center;overflow:hidden;';
      span.style.color = 'transparent';
      span.style.background = 'transparent';
      span.setAttribute('aria-hidden', 'true');
      displayDiv.appendChild(span);
      cells.push(span);
    }
    while (cells.length > totalCells) {
      const span = cells.pop();
      if (span && span.parentNode === displayDiv) displayDiv.removeChild(span);
    }

    cellStatesRef.current = new Array(totalCells).fill(false);
    for (const span of cells) {
      span.style.color = 'transparent';
      span.style.background = 'transparent';
    }
  }

  function tick() {
    const video = videoRef.current;
    const capCanvas = captureCanvasRef.current;
    const capCtx = captureCtxRef.current;
    const hwCanvas = hwCanvasRef.current;
    const hwCtx = hwCtxRef.current;
    if (!video || video.readyState < 2 || !capCanvas || !capCtx || !hwCanvas || !hwCtx) return;
    const { cols, rows } = gridRef.current;
    if (!cols || !rows) return;
    const ctrl = controlsRef.current;

    if (capCanvas.width !== cols) capCanvas.width = cols;
    if (capCanvas.height !== rows) capCanvas.height = rows;
    capCtx.drawImage(video, 0, 0, cols, rows);
    const { data } = capCtx.getImageData(0, 0, cols, rows);

    const cells = cellsRef.current;
    const states = cellStatesRef.current;
    if (cells.length !== cols * rows || states.length !== cols * rows) return;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const ci = row * cols + col;
        const i = ci * 4;
        const gray = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
        const lit = bwValue(processGray(gray, ctrl), row, col, ctrl.dither) > 0;
        if (states[ci] !== lit) {
          states[ci] = lit;
          const cell = cells[ci];
          if (cell) {
            cell.style.color = lit ? '#fff' : 'transparent';
            // '#000' covers the SVG dot background on the parent; transparent reveals it
            cell.style.background = lit ? '#000' : 'transparent';
          }
        }
      }
    }

    hwCtx.drawImage(video, 0, 0, HW_COLS, HW_ROWS);
    const { data: hw } = hwCtx.getImageData(0, 0, HW_COLS, HW_ROWS);
    const frame = new Uint8Array(HW_COLS * HW_ROWS);
    for (let row = 0; row < HW_ROWS; row++) {
      for (let col = 0; col < HW_COLS; col++) {
        const i = (row * HW_COLS + col) * 4;
        const gray = hw[i]! * 0.299 + hw[i + 1]! * 0.587 + hw[i + 2]! * 0.114;
        frame[col * HW_ROWS + row] = bwValue(processGray(gray, ctrl), row, col, ctrl.dither);
      }
    }
    const frameStr = Array.from(frame, b => String.fromCharCode(b)).join('');
    bridgeRef.current?.sendFrame(btoa(frameStr), 'bw', 18, 'both');
  }

  async function handleVideoError() {
    const currentSrc = srcRef.current;
    if (currentSrc?.startsWith('/api/youtube-stream')) {
      try {
        const ytUrl = new URL(currentSrc, location.href).searchParams.get('url') ?? '';
        const r = await fetch(`/api/youtube-stream-error?url=${encodeURIComponent(ytUrl)}`);
        const body = await r.json() as { error?: string | null };
        setYtError(body.error ?? 'Failed to load YouTube stream');
      } catch {
        setYtError('Failed to load YouTube stream');
      }
    }
    setPlaying(false);
  }

  return (
    <div className="relative flex h-full w-full">
      {/* ── video canvas area ─────────────────────────────── */}
      <div ref={containerRef} className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        <div
          ref={displayDivRef}
          role="img"
          aria-label={src ? 'Video output' : 'No source loaded'}
          style={{
            display: 'grid',
            backgroundImage: SVG_DOT,
            backgroundSize: `${CELL}px ${CELL}px`,
            backgroundRepeat: 'repeat',
            fontSize: '7px',
            fontFamily: 'monospace',
            userSelect: 'none',
          }}
        />

        <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {buffering && playing && (
            <>
              <span aria-hidden="true" className="text-muted-foreground text-xs font-mono animate-pulse">···</span>
              <span className="sr-only">Buffering</span>
            </>
          )}
          {idle && <span className="sr-only">Video controls hidden</span>}
        </div>

        {ytError && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
            <span className="text-red-400 text-sm font-mono">{ytError}</span>
            {ytError.includes('yt-dlp') && (
              <span className="text-muted-foreground text-xs font-mono">install: sudo apt install yt-dlp</span>
            )}
          </div>
        )}

        {duration > 0 && (
          <div
            className="absolute bottom-0 inset-x-0 flex items-center gap-2 px-3 py-1 bg-black/70"
            style={{ opacity: idle ? 0 : 1, transition: idle ? 'opacity 300ms' : 'opacity 0ms', pointerEvents: idle ? 'none' : undefined }}
            {...(idle ? { inert: true } : {})}
          >
            <span className="font-mono text-foreground tabular-nums shrink-0">{formatTime(currentTime)}</span>
            <Slider
              variant="cycling"
              min={0}
              max={duration}
              step="any"
              value={currentTime}
              className="flex-1"
              aria-label="Seek"
              aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
              onChange={e => { const v = videoRef.current; if (v) v.currentTime = Number(e.target.value); }}
            />
            <span className="font-mono text-foreground tabular-nums shrink-0">{formatTime(duration)}</span>
          </div>
        )}

        <video
          ref={videoRef}
          src={src ?? undefined}
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (!v) return;
            if (Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
            recomputeGrid();
            setPlaying(true);
          }}
          onDurationChange={() => {
            const v = videoRef.current;
            if (v && Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
          }}
          onTimeUpdate={() => { const v = videoRef.current; if (v) setCurrentTime(v.currentTime); }}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => setBuffering(false)}
          loop={loop}
          onEnded={() => { if (!loop) setPlaying(false); }}
          onError={() => { void handleVideoError(); }}
          playsInline
          style={{ display: 'none' }}
        />
      </div>

      {/* ── settings panel — in-flow, never covers toolbar ── */}
      {settingsOpen && (
        <aside
          ref={settingsPanelRef}
          aria-label="Video settings"
          tabIndex={-1}
          className="absolute right-0 top-0 h-full w-60 flex flex-col gap-4 overflow-y-auto p-4"
          style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)', paddingTop: (topPad || 0) + 16, opacity: idle ? 0 : 1, transition: idle ? 'opacity 300ms' : 'opacity 0ms', pointerEvents: idle ? 'none' : undefined }}
          {...(idle ? { inert: true } : {})}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">video settings</span>
            <Button variant="ghost" size="sm" aria-label="Reset video settings" onClick={() => updateControls(DEFAULT_CONTROLS)}>reset</Button>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">brightness</span>
            <Slider min={-50} max={50} value={controls.brightness} onChange={e => updateControls({ brightness: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">contrast</span>
            <Slider min={50} max={200} value={Math.round(controls.contrast * 100)} onChange={e => updateControls({ contrast: Number(e.target.value) / 100 })} />
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={controls.invert} onChange={e => updateControls({ invert: e.target.checked })} />
              <span className="text-xs text-foreground">invert</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={controls.dither} onChange={e => updateControls({ dither: e.target.checked })} />
              <span className="text-xs text-foreground">dither</span>
            </label>
          </div>
        </aside>
      )}
    </div>
  );
}
