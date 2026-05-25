import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo, type MutableRefObject } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { Slider } from './ui/slider.js';
import { Button } from './ui/button.js';
import { Checkbox } from './ui/checkbox.js';
import { Select } from './ui/select.js';
import { Input } from './ui/input.js';

// ── animated preview ───────────────────────────────────────────────────────

const AnimatedPreview = memo(function AnimatedPreview({
  frames,
  delays,
  width,
  playing,
  onPlayingChange,
}: {
  frames: string[];
  delays: number[];
  width: 9 | 18;
  playing: boolean;
  onPlayingChange: (p: boolean) => void;
}) {
  const [frameIdx, setFrameIdx] = useState(0);
  const isAnimated = frames.length > 1;
  const prevFramesRef = useRef(frames);

  // When new frames arrive: if playing reset to 0; if paused clamp to new length.
  useEffect(() => {
    if (frames !== prevFramesRef.current) {
      prevFramesRef.current = frames;
      if (playing) {
        setFrameIdx(0);
      } else {
        setFrameIdx(i => Math.min(i, frames.length - 1));
      }
    }
  }, [frames, playing]);

  useEffect(() => {
    if (!playing || !isAnimated) return;
    const delay = delays[frameIdx] ?? 100;
    const t = setTimeout(() => setFrameIdx(i => (i + 1) % frames.length), delay);
    return () => clearTimeout(t);
  }, [playing, isAnimated, frames, delays, frameIdx]);

  return (
    <div className="flex flex-col items-center gap-2">
      <MatrixPreview pixels={frames[frameIdx] ?? ''} width={width} />
      {isAnimated && (
        <div className="flex items-center gap-0">
          <Button
            variant="ghost"
            aria-label="Previous frame"
            disabled={playing}
            onClick={() => setFrameIdx(i => i === 0 ? frames.length - 1 : i - 1)}
          >
            ‹
          </Button>
          <Button
            variant="ghost"
            aria-label={playing ? 'Pause animation' : 'Play animation'}
            onClick={() => onPlayingChange(!playing)}
          >
            {playing ? '⏸' : '▶'}
          </Button>
          <Button
            variant="ghost"
            aria-label="Next frame"
            disabled={playing}
            onClick={() => setFrameIdx(i => (i + 1) % frames.length)}
          >
            ›
          </Button>
        </div>
      )}
    </div>
  );
});

// ── panel ──────────────────────────────────────────────────────────────────

export interface AssetImportPanelProps {
  onSaved: (filename: string) => void;
  onHasFileChange?: (hasFile: boolean) => void;
  saveRef?: MutableRefObject<(() => void) | null>;
}

const ALLOWED_FILENAME_RE = /^[a-zA-Z0-9_\-]+$/;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'asset';
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AssetImportPanel({ onSaved, onHasFileChange, saveRef }: AssetImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [width, setWidth] = useState<9 | 18>(18);
  const [fit, setFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [invert, setInvert] = useState(false);
  const [filename, setFilename] = useState('');
  const [playing, setPlaying] = useState(true);
  const [preview, setPreview] = useState<{ frames: string[]; delays: number[]; width: 9 | 18 } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileBase64Ref = useRef<string | null>(null);
  const previewRef = useRef<typeof preview>(null);
  previewRef.current = preview;

  const handlePlayingChange = useCallback((p: boolean) => setPlaying(p), []);

  const fetchPreview = useCallback(async (f: File, opts: {
    width: 9 | 18; fit: 'contain' | 'cover' | 'fill';
    brightness: number; contrast: number; invert: boolean;
  }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const isFirstLoad = previewRef.current === null;
    if (isFirstLoad) setPreviewLoading(true);
    setError(null);
    try {
      const b64 = fileBase64Ref.current ?? await fileToBase64(f);
      if (controller.signal.aborted) return;
      fileBase64Ref.current = b64;
      const res = await fetch('/api/assets/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sourceBase64: b64,
          width: opts.width,
          mode: 'bw',
          fit: opts.fit,
          brightness: opts.brightness,
          contrast: opts.contrast,
          invert: opts.invert,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'preview failed');
        setError(text.slice(0, 200));
        return;
      }
      const data = await res.json() as { ok: boolean; frames: string[]; delays: number[]; width: 9 | 18 };
      const frameWidth = data.width === 9 || data.width === 18 ? data.width : opts.width;
      setPreview({ frames: data.frames, delays: data.delays, width: frameWidth });
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message.slice(0, 200) : 'preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const schedulePreview = useCallback((f: File, opts: Parameters<typeof fetchPreview>[1]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPreview(f, opts), 50);
  }, [fetchPreview]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { onHasFileChange?.(false); }, []);

  useEffect(() => {
    if (!file) return;
    schedulePreview(file, { width, fit, brightness, contrast, invert });
  }, [file, width, fit, brightness, contrast, invert, schedulePreview]);

  function handleFileChange(f: File) {
    if (f.size > MAX_FILE_BYTES) {
      setError('file too large (max 20 MB)');
      return;
    }
    fileBase64Ref.current = null;
    setFile(f);
    setFilename(sanitizeFilename(f.name));
    setPreview(null);
    setError(null);
    onHasFileChange?.(true);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFileChange(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileChange(f);
  }

  async function handleSave() {
    if (!file || !filename.trim()) return;
    if (!ALLOWED_FILENAME_RE.test(filename)) {
      setError('filename may only contain letters, numbers, hyphens and underscores');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const b64 = fileBase64Ref.current ?? await fileToBase64(file);
      fileBase64Ref.current = b64;
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, sourceBase64: b64, width, mode: 'bw', fit, brightness, contrast, invert }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'save failed');
        setError(text.slice(0, 200));
        return;
      }
      onSaved(`${filename}.dmx.json`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  useLayoutEffect(() => { if (saveRef) saveRef.current = file ? handleSave : null; });

  // ── no file: show drop zone ────────────────────────────────────────────
  if (!file) {
    return (
      <div className="flex flex-col gap-4 p-2">
        <label
          className={`flex flex-col items-center justify-center border border-dashed cursor-pointer px-4 py-6 gap-1 transition-colors ${
            dragOver
              ? 'border-foreground/60 bg-foreground/5'
              : 'border-foreground/25 hover:border-foreground/45'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.dmx.json"
            className="sr-only"
            onChange={handleInputChange}
          />
          <span className="font-mono text-xs text-muted-foreground">drop image or click to select</span>
          <span className="font-mono text-xs text-muted-foreground">.png .jpg .gif .dmx.json</span>
        </label>
        {error && <span role="alert" className="font-mono text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  // ── file selected: show controls ───────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-2">
      {/* Preview */}
      <div className="flex justify-center" aria-live="polite" aria-busy={previewLoading && !preview}>
        {previewLoading && !preview && (
          <span className="font-mono text-xs text-muted-foreground">loading…</span>
        )}
        {preview && (
          <AnimatedPreview
            frames={preview.frames}
            delays={preview.delays}
            width={preview.width}
            playing={playing}
            onPlayingChange={handlePlayingChange}
          />
        )}
        {!previewLoading && !preview && (
          <span className="font-mono text-xs text-muted-foreground">no preview yet</span>
        )}
      </div>

      {/* Width */}
      <label className="flex items-center gap-3 cursor-pointer">
        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">wide</span>
        <Checkbox checked={width === 18} onChange={e => setWidth(e.target.checked ? 18 : 9)} />
      </label>

      {/* Fit */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">fit</span>
        <Select
          value={fit}
          aria-label="Fit mode"
          options={[{ value: 'contain', label: 'contain' }, { value: 'cover', label: 'cover' }, { value: 'fill', label: 'fill' }]}
          onValueChange={v => setFit(v as 'contain' | 'cover' | 'fill')}
        />
      </div>

      {/* Brightness */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">brightness</span>
        <Slider
          aria-label="brightness"
          variant="value"
          min={-100}
          max={100}
          value={Math.round(brightness * 100)}
          onChange={(e) => setBrightness(Number(e.target.value) / 100)}
        />
      </div>

      {/* Contrast */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">contrast</span>
        <Slider
          aria-label="contrast"
          variant="value"
          min={50}
          max={200}
          value={Math.round(contrast * 100)}
          onChange={(e) => setContrast(Number(e.target.value) / 100)}
        />
      </div>

      {/* Invert */}
      <label className="flex items-center gap-3 cursor-pointer">
        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">invert</span>
        <Checkbox aria-label="Invert" checked={invert} onChange={e => setInvert(e.target.checked)} />
      </label>

      {/* Filename */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">filename</span>
        <Input
          type="text"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="asset-name"
          expandedClassName="w-40"
        />
      </div>

      {error && <span role="alert" className="font-mono text-xs text-red-400">{error}</span>}
    </div>
  );
}
