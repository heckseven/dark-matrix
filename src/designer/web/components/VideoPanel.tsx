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
const PITCH = 21;
const HW_COLS = 18;
const HW_ROWS = 34;
const MIN_L = 48;
const FPS = 20;
const FONT = '14px monospace';
const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;

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
      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
      <Select
        options={SOURCE_OPTIONS}
        value={sourceMode}
        onValueChange={v => setSourceMode(v as 'youtube' | 'local')}
        aria-label="Video source"
      />
      {sourceMode === 'youtube' ? (
        <form className="flex items-center gap-2" onSubmit={handleSubmit}>
          <Input className="w-48" placeholder="url" value={inputUrl} onChange={e => setInputUrl(e.target.value)} />
          <Button type="submit" variant="ghost" size="sm" disabled={!inputUrl.trim()}>watch</Button>
        </form>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>choose file</Button>
      )}
    </>
  );
}

// ── VideoSettingsToggle ────────────────────────────────────────────────────

export function VideoSettingsToggle() {
  const settingsOpen = useVStore(s => s.settingsOpen);
  const { setSettingsOpen } = useVStore.getState();
  return (
    <Button
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
}

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

export function VideoPanel({ topPad = 0 }: { topPad?: number }) {
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
  const { setPlaying, setCurrentTime, setDuration, setYtError, updateControls, clearSeek, setBuffering } = useVStore.getState();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const displayCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const bridgeRef = React.useRef<ReturnType<typeof createPreviewBridge> | null>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const captureCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const captureCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const hwCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const hwCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const gridRef = React.useRef({ cols: 0, rows: 0 });
  const controlsRef = React.useRef<Controls>(null!);
  const srcRef = React.useRef(src);
  srcRef.current = src;

  React.useEffect(() => {
    controlsRef.current = useVStore.getState().controls;
    return useVStore.subscribe(s => { controlsRef.current = s.controls; });
  }, []);

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
    const video = videoRef.current;
    if (!container || !video || !video.videoWidth) return;
    const { width: w, height: h } = container.getBoundingClientRect();
    const maxCols = Math.floor(w / PITCH);
    const maxRows = Math.floor(h / PITCH);
    if (maxCols < 1 || maxRows < 1) return;
    const ar = video.videoWidth / video.videoHeight;
    const cols = Math.min(maxCols, Math.floor(maxRows * ar));
    const rows = Math.max(1, Math.floor(cols / ar));
    gridRef.current = { cols, rows };
  }

  function tick() {
    const video = videoRef.current;
    const displayCanvas = displayCanvasRef.current;
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

    if (displayCanvas) {
      const dpr = window.devicePixelRatio || 1;
      const cw = cols * PITCH;
      const ch = rows * PITCH;
      const pw = Math.round(cw * dpr);
      const ph = Math.round(ch * dpr);
      if (displayCanvas.width !== pw) displayCanvas.width = pw;
      if (displayCanvas.height !== ph) displayCanvas.height = ph;
      displayCanvas.style.width = `${cw}px`;
      displayCanvas.style.height = `${ch}px`;
      const ctx = displayCanvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, ch);
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const OFF_COLOR = `rgb(${MIN_L},${MIN_L},${MIN_L})`;
      let curStyle = '';
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = (row * cols + col) * 4;
          const gray = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
          const bw = bwValue(processGray(gray, ctrl), row, col, ctrl.dither);
          const s = bw > 0 ? '#fff' : OFF_COLOR;
          if (s !== curStyle) { ctx.fillStyle = s; curStyle = s; }
          ctx.fillText(bw > 0 ? '∗' : '•', col * PITCH + CELL / 2, row * PITCH + CELL / 2 + 1);
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
    let frameStr = '';
    for (const b of frame) frameStr += String.fromCharCode(b);
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
        <canvas ref={displayCanvasRef} />

        {buffering && playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-muted-foreground text-xs font-mono animate-pulse">···</span>
          </div>
        )}

        {ytError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
            <span className="text-red-400 text-sm font-mono">{ytError}</span>
            {ytError.includes('yt-dlp') && (
              <span className="text-muted-foreground text-xs font-mono">install: sudo apt install yt-dlp</span>
            )}
          </div>
        )}

        {duration > 0 && (
          <div className="absolute bottom-0 inset-x-0 flex items-center gap-2 px-3 py-1 bg-black/70">
            <span className="font-mono text-foreground tabular-nums shrink-0">{formatTime(currentTime)}</span>
            <Slider
              variant="cycling"
              min={0}
              max={duration}
              step="any"
              value={currentTime}
              className="flex-1"
              aria-label="Seek"
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
            if (v) setDuration(v.duration);
            recomputeGrid();
            setPlaying(true);
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
          className="absolute right-0 top-0 h-full w-60 flex flex-col gap-4 overflow-y-auto p-4"
          style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)', paddingTop: (topPad || 0) + 16 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">video settings</span>
            <Button variant="ghost" size="sm" onClick={() => updateControls(DEFAULT_CONTROLS)}>reset</Button>
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
