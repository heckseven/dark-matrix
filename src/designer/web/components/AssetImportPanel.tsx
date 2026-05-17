import { useState, useEffect, useRef, useCallback } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { Slider } from './ui/slider.js';
import { Button } from './ui/button.js';

export interface AssetImportPanelProps {
  onSaved: (filename: string) => void;
  onCancel?: () => void;
}

const ALLOWED_FILENAME_RE = /^[a-zA-Z0-9_\-]+$/;

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, '')       // strip extension
    .replace(/[^a-zA-Z0-9_\-]/g, '-') // replace disallowed chars
    .replace(/^-+|-+$/g, '')        // trim leading/trailing dashes
    || 'asset';
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>" — strip prefix
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AssetImportPanel({ onSaved, onCancel }: AssetImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [width, setWidth] = useState<9 | 18>(9);
  const [mode, setMode] = useState<'bw' | 'gray'>('gray');
  const [fit, setFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<{ frames: string[]; width: 9 | 18 } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileBase64Ref = useRef<string | null>(null);

  const fetchPreview = useCallback(async (f: File, opts: {
    width: 9 | 18; mode: 'bw' | 'gray'; fit: 'contain' | 'cover' | 'fill';
    brightness: number; contrast: number;
  }) => {
    try {
      const b64 = fileBase64Ref.current ?? await fileToBase64(f);
      fileBase64Ref.current = b64;
      setPreviewLoading(true);
      setError(null);
      const res = await fetch('/api/assets/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceBase64: b64,
          width: opts.width,
          mode: opts.mode,
          fit: opts.fit,
          brightness: opts.brightness,
          contrast: opts.contrast,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'preview failed');
        setError(text);
        return;
      }
      const data = await res.json() as { ok: boolean; frames: string[]; width: 9 | 18 };
      setPreview({ frames: data.frames, width: data.width });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const schedulePreview = useCallback((f: File, opts: Parameters<typeof fetchPreview>[1]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPreview(f, opts), 300);
  }, [fetchPreview]);

  // Re-run preview whenever any control changes (file already set)
  useEffect(() => {
    if (!file) return;
    schedulePreview(file, { width, mode, fit, brightness, contrast });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, width, mode, fit, brightness, contrast]);

  function handleFileChange(f: File) {
    fileBase64Ref.current = null;
    setFile(f);
    setFilename(sanitizeFilename(f.name));
    setPreview(null);
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
        body: JSON.stringify({
          filename,
          sourceBase64: b64,
          width,
          mode,
          fit,
          brightness,
          contrast,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'save failed');
        setError(text);
        return;
      }
      onSaved(`${filename}.dmx.json`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  const previewWidth = preview?.width ?? width;
  const previewPixels = preview?.frames[0] ?? null;

  return (
    <div className="flex flex-col gap-4 p-2">
      {/* Drop zone */}
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
        {file ? (
          <span className="font-mono text-xs text-foreground/70">{file.name}</span>
        ) : (
          <>
            <span className="font-mono text-xs text-foreground/55">drop image or click to select</span>
            <span className="font-mono text-xs text-foreground/30">.png .jpg .gif .dmx.json</span>
          </>
        )}
      </label>

      {/* Controls — only when file selected */}
      {file && (
        <>
          {/* Preview */}
          <div className="flex justify-center">
            {previewLoading && (
              <span className="font-mono text-xs text-foreground/40">loading…</span>
            )}
            {!previewLoading && previewPixels && (
              <MatrixPreview
                pixels={previewPixels}
                width={previewWidth}
              />
            )}
            {!previewLoading && !previewPixels && (
              <span className="font-mono text-xs text-foreground/30">no preview yet</span>
            )}
          </div>

          {/* Width toggle */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-foreground/50">width</span>
            <div className="flex gap-2">
              {([9, 18] as const).map(w => (
                <button
                  key={w}
                  type="button"
                  className={`font-mono text-xs px-2 py-1 border ${width === w ? 'border-foreground/60 text-foreground' : 'border-foreground/20 text-foreground/45 hover:border-foreground/40'}`}
                  onClick={() => setWidth(w)}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-foreground/50">mode</span>
            <div className="flex gap-2">
              {(['bw', 'gray'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  className={`font-mono text-xs px-2 py-1 border ${mode === m ? 'border-foreground/60 text-foreground' : 'border-foreground/20 text-foreground/45 hover:border-foreground/40'}`}
                  onClick={() => setMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Fit toggle */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-foreground/50">fit</span>
            <div className="flex gap-2">
              {(['contain', 'cover', 'fill'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  className={`font-mono text-xs px-2 py-1 border ${fit === f ? 'border-foreground/60 text-foreground' : 'border-foreground/20 text-foreground/45 hover:border-foreground/40'}`}
                  onClick={() => setFit(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Brightness slider */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-foreground/50">brightness</span>
            <Slider
              variant="value"
              min={-100}
              max={100}
              value={Math.round(brightness * 100)}
              onChange={(e) => setBrightness(Number(e.target.value) / 100)}
            />
          </div>

          {/* Contrast slider */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-foreground/50">contrast</span>
            <Slider
              variant="value"
              min={50}
              max={200}
              value={Math.round(contrast * 100)}
              onChange={(e) => setContrast(Number(e.target.value) / 100)}
            />
          </div>

          {/* Filename */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-foreground/50">filename</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="font-mono text-xs bg-transparent border border-foreground/25 px-2 py-1 text-foreground focus:outline-none focus:border-foreground/60"
              placeholder="asset-name"
            />
          </div>

          {error && (
            <span className="font-mono text-xs text-red-400">{error}</span>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="default"
              className="font-mono text-xs"
              onClick={handleSave}
              disabled={saving || !filename.trim()}
            >
              {saving ? 'saving…' : 'save'}
            </Button>
            {onCancel && (
              <Button
                variant="ghost"
                className="font-mono text-xs text-foreground/55"
                onClick={onCancel}
              >
                cancel
              </Button>
            )}
          </div>
        </>
      )}

      {/* Cancel with no file */}
      {!file && onCancel && (
        <Button
          variant="ghost"
          className="font-mono text-xs text-foreground/55 self-start"
          onClick={onCancel}
        >
          cancel
        </Button>
      )}
    </div>
  );
}
