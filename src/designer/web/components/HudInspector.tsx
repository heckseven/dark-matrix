import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { Tabs } from './ui/tabs.js';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import { DATA_STYLES, createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataStyle, DataMetric, DataRenderer } from '../../../animations/data-renderers.js';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle } from '../../../animations/audio-renderers.js';
import { createHeatmapState, bumpTool, renderHeatmap } from '../../../animations/heatmap.js';
import type { HudWidget } from '../types/hud-preset.js';

const COLS = 9;
const ROWS = 34;

// ── clock thumbnails ──────────────────────────────────────────────────────

const _clockCache: Partial<Record<ClockFace, ClockRenderer>> = {};
if (import.meta.hot) {
  import.meta.hot.dispose(() => { for (const k in _clockCache) delete _clockCache[k as ClockFace]; });
}

function renderClockToB64(face: ClockFace, now: Date): string {
  if (!_clockCache[face]) _clockCache[face] = createClockRenderer(face);
  const frame = _clockCache[face]!({ now, side: 'left' });
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

// ── audio thumbnails ──────────────────────────────────────────────────────

// Mid-level descending spectrum — looks natural across most styles
const MOCK_AUDIO_CTX = { bands: [200, 150, 100, 70, 40, 20, 10, 5, 2], fftSize: 2048, gain: 1.5 };

const _audioThumbCache: Partial<Record<AudioStyle, ReturnType<typeof createAudioRenderer>>> = {};
if (import.meta.hot) {
  import.meta.hot.dispose(() => { for (const k in _audioThumbCache) delete _audioThumbCache[k as AudioStyle]; });
}

function getAudioThumb(style: AudioStyle) {
  if (!_audioThumbCache[style]) _audioThumbCache[style] = createAudioRenderer(style);
  return _audioThumbCache[style]!;
}

function renderAudioStyleToB64(style: AudioStyle): string {
  const frame = getAudioThumb(style)(MOCK_AUDIO_CTX);
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

// ── heatmap thumbnail ─────────────────────────────────────────────────────

const _heatmapThumbState = (() => {
  const s = createHeatmapState();
  for (const t of ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Agent', 'Skill', 'ToolSearch', 'TodoWrite', 'Task', 'WebSearch']) {
    bumpTool(s, t);
  }
  return s;
})();

function renderHeatmapThumbToB64(): string {
  const [left] = renderHeatmap(_heatmapThumbState);
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < out.length; i++) out[i] = (left[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

// ── data thumbnails ───────────────────────────────────────────────────────

const _dataThumbCache: Partial<Record<DataStyle, DataRenderer>> = {};
if (import.meta.hot) {
  import.meta.hot.dispose(() => { for (const k in _dataThumbCache) delete _dataThumbCache[k as DataStyle]; });
}

function getDataThumb(style: DataStyle): DataRenderer {
  if (_dataThumbCache[style] === undefined) {
    const r = createDataRenderer({ style });
    if (style === 'cores') {
      r.update({ cpuPct: 45, ramPct: 70, netRxBps: 1_000_000, netTxBps: 500_000, cpuCores: [80, 45, 30, 60, 70, 20, 50, 40] });
    } else if (style === 'scroll') {
      // Seed 17 frames of animated cpu core groups
      for (let i = 16; i >= 0; i--) {
        const base = i * 0.4;
        r.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, cpuCores: [
          Math.round(50 + 40 * Math.sin(base)),
          Math.round(50 + 40 * Math.sin(base + 1.5)),
          Math.round(50 + 40 * Math.sin(base + 3)),
          Math.round(50 + 40 * Math.sin(base + 4.5)),
          Math.round(50 + 40 * Math.sin(base + 0.7)),
          Math.round(50 + 40 * Math.sin(base + 2.2)),
          Math.round(50 + 40 * Math.sin(base + 3.7)),
          Math.round(50 + 40 * Math.sin(base + 5.2)),
        ]});
      }
    } else {
      // line and fill — seed 17 frames of sine-wave metric history
      for (let i = 16; i >= 0; i--) {
        r.update({
          cpuPct:   35 + 25 * Math.sin(i * 0.4),
          ramPct:   60 + 15 * Math.sin(i * 0.3 + 1),
          netRxBps: 800_000 + 400_000 * Math.sin(i * 0.5 + 2),
          netTxBps: 300_000 + 200_000 * Math.sin(i * 0.35),
        });
      }
    }
    _dataThumbCache[style] = r;
  }
  return _dataThumbCache[style]!;
}

function renderDataStyleToB64(style: DataStyle): string {
  const frame = getDataThumb(style).render();
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

// ── data presets ──────────────────────────────────────────────────────────

const DATA_PRESETS: { id: string; label: string; style: DataStyle; widget: HudWidget }[] = [
  {
    id: 'system',
    label: 'system',
    style: 'line',
    widget: { widget: 'data', style: 'line', top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' },
  },
  {
    id: 'fill-system',
    label: 'fill',
    style: 'fill',
    widget: { widget: 'data', style: 'fill', top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' },
  },
  {
    id: 'cpu-scroll',
    label: 'scroll',
    style: 'scroll',
    widget: { widget: 'data', style: 'scroll' },
  },
  {
    id: 'cpu-cores',
    label: 'cpu cores',
    style: 'cores',
    widget: { widget: 'data', style: 'cores' },
  },
];

// ── helpers ───────────────────────────────────────────────────────────────

const EMPTY_PIXELS = btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));

function categoryOfWidget(w: HudWidget): string {
  if (w.widget === 'clock') return 'clocks';
  if (w.widget === 'heatmap') return 'ai';
  if (w.widget === 'audio') return 'audio';
  return 'data';
}

function widgetToKey(w: HudWidget | null): string | null {
  if (!w) return null;
  if (w.widget === 'clock')  return `clock:${w.face ?? 'elegant'}`;
  if (w.widget === 'audio')  return `audio:${w.style ?? AUDIO_STYLES[0]!.id}`;
  if (w.widget === 'heatmap') return null; // static — never needs live updates
  return null; // data — static
}

function CornerBrackets({ active }: { active: boolean }) {
  const c = { position: 'absolute' as const, width: 16, height: 16, pointerEvents: 'none' as const };
  const b = `1px solid ${active ? 'white' : 'rgba(255,255,255,0.35)'}`;
  return (
    <div aria-hidden="true" className={`absolute inset-0 pointer-events-none transition-opacity ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}>
      <span style={{ ...c, top: 0,    left: 0,    borderTop: b, borderLeft: b }} />
      <span style={{ ...c, top: 0,    right: 0,   borderTop: b, borderRight: b }} />
      <span style={{ ...c, bottom: 0, left: 0,    borderBottom: b, borderLeft: b }} />
      <span style={{ ...c, bottom: 0, right: 0,   borderBottom: b, borderRight: b }} />
    </div>
  );
}

// ── panel picker ──────────────────────────────────────────────────────────

const PLACEHOLDER_CATEGORIES = ['audio', 'image', 'animation'] as const;

type PanelPickerProps = {
  clockPixels: Partial<Record<ClockFace, string>>;
  dataThumbnails: Partial<Record<DataStyle, string>>;
  audioThumbnails: Partial<Record<AudioStyle, string>>;
  heatmapPixels: string;
  currentWidget: HudWidget | null;
  scrollToCategory: string | null;
  onScrolled: () => void;
  onPick: (widget: HudWidget) => void;
  onLiveKey: (key: string | null) => void;
};

function PanelPicker({ clockPixels, dataThumbnails, audioThumbnails, heatmapPixels, currentWidget, scrollToCategory, onScrolled, onPick, onLiveKey }: PanelPickerProps) {
  const catRefs = useRef<Partial<Record<string, HTMLElement>>>({});
  const live = (key: string) => ({
    onMouseEnter: () => onLiveKey(key),
    onMouseLeave: () => onLiveKey(null),
    onFocus: () => onLiveKey(key),
    onBlur: () => onLiveKey(null),
  });

  useEffect(() => {
    if (!scrollToCategory) return;
    catRefs.current[scrollToCategory]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onScrolled();
  }, [scrollToCategory, onScrolled]);

  return (
    <div className="flex flex-col gap-6 py-4 px-2 overflow-y-auto h-full">

      {/* Clocks */}
      <section>
        <h3
          ref={el => { if (el) catRefs.current['clocks'] = el; }}
          className="font-mono text-xs text-foreground/50 mb-3"
        >
          clocks
        </h3>
        <div role="group" aria-label="Clock panels" className="grid grid-cols-3 gap-4">
          {CLOCK_FACES.map(({ id, label }) => {
            const active = currentWidget?.widget === 'clock' && (currentWidget.face ?? 'elegant') === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={active}
                className="group relative flex flex-col gap-2 items-center rounded-sm p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                {...live(`clock:${id}`)}
                onClick={() => onPick({ widget: 'clock', face: id })}
              >
                <CornerBrackets active={active} />
                <MatrixPreview pixels={clockPixels[id] ?? EMPTY_PIXELS} width={9} />
                <span className="font-mono text-xs text-foreground">{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Data */}
      <section>
        <h3
          ref={el => { if (el) catRefs.current['data'] = el; }}
          className="font-mono text-xs text-foreground/50 mb-3"
        >
          data
        </h3>
        <div role="group" aria-label="Data panels" className="grid grid-cols-3 gap-4">
          {DATA_PRESETS.map(preset => {
            const active = currentWidget?.widget === 'data' && (currentWidget.style ?? 'line') === preset.style;
            return (
              <button
                key={preset.id}
                type="button"
                aria-label={preset.label}
                aria-pressed={active}
                className="group relative flex flex-col gap-2 items-center rounded-sm p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                onClick={() => onPick(preset.widget)}
              >
                <CornerBrackets active={active} />
                <MatrixPreview pixels={dataThumbnails[preset.style] ?? EMPTY_PIXELS} width={9} />
                <span className="font-mono text-xs text-foreground">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Audio */}
      <section>
        <h3
          ref={el => { if (el) catRefs.current['audio'] = el; }}
          className="font-mono text-xs text-foreground/50 mb-3"
        >
          audio
        </h3>
        <div role="group" aria-label="Audio panels" className="grid grid-cols-3 gap-4">
          {AUDIO_STYLES.map(({ id, label }) => {
            const active = currentWidget?.widget === 'audio' && (currentWidget.style ?? AUDIO_STYLES[0]!.id) === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={active}
                className="group relative flex flex-col gap-2 items-center rounded-sm p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                {...live(`audio:${id}`)}
                onClick={() => onPick({ widget: 'audio', style: id })}
              >
                <CornerBrackets active={active} />
                <MatrixPreview pixels={audioThumbnails[id] ?? EMPTY_PIXELS} width={9} />
                <span className="font-mono text-xs text-foreground">{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* AI */}
      <section>
        <h3
          ref={el => { if (el) catRefs.current['ai'] = el; }}
          className="font-mono text-xs text-foreground/50 mb-3"
        >
          ai
        </h3>
        <div role="group" aria-label="AI panels" className="grid grid-cols-3 gap-4">
          {(() => {
            const active = currentWidget?.widget === 'heatmap';
            return (
              <button
                type="button"
                aria-label="tool heatmap"
                aria-pressed={active}
                className="group relative flex flex-col gap-2 items-center rounded-sm p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                onClick={() => onPick({ widget: 'heatmap' })}
              >
                <CornerBrackets active={active} />
                <MatrixPreview pixels={heatmapPixels} width={9} />
                <span className="font-mono text-xs text-foreground">tool heatmap</span>
              </button>
            );
          })()}
        </div>
      </section>

      {/* Placeholder categories — non-functional, hidden from assistive tech */}
      {PLACEHOLDER_CATEGORIES.map(cat => (
        <section key={cat} aria-hidden="true">
          <h3
            ref={el => { if (el) catRefs.current[cat] = el; }}
            className="font-mono text-xs text-foreground/50 mb-2"
          >
            {cat}
          </h3>
          <p className="font-mono text-xs text-foreground/25">coming soon</p>
        </section>
      ))}

    </div>
  );
}

// ── data quadrant controls ────────────────────────────────────────────────

const DATA_METRICS: { id: DataMetric | 'none'; label: string }[] = [
  { id: 'cpu',    label: 'cpu'    },
  { id: 'ram',    label: 'ram'    },
  { id: 'net_rx', label: 'net rx' },
  { id: 'net_tx', label: 'net tx' },
  { id: 'none',   label: 'none'   },
];

const DATA_METRIC_IDS = new Set(DATA_METRICS.map(m => m.id));

// ── main component ────────────────────────────────────────────────────────

export type HudInspectorProps = {
  widget: HudWidget | null;
  onChange: (widget: HudWidget) => void;
};

type View = 'picker' | 'settings';

export function HudInspector({ widget, onChange }: HudInspectorProps) {
  const uid = useId();
  // Snapshot on mount — remount via `key` in HudPanel to reset when side/preset changes.
  const [view, setView] = useState<View>(() =>
    widget && !(widget.widget === 'data' && (widget.style === 'cores' || widget.style === 'scroll')) && widget.widget !== 'heatmap' ? 'settings' : 'picker'
  );
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [clockPixels, setClockPixels] = useState<Partial<Record<ClockFace, string>>>({});
  const [dataThumbnails, setDataThumbnails] = useState<Partial<Record<DataStyle, string>>>({});
  const [audioThumbnails, setAudioThumbnails] = useState<Partial<Record<AudioStyle, string>>>({});
  const [heatmapPixels, setHeatmapPixels] = useState<string>(EMPTY_PIXELS);
  const [interactiveKey, setInteractiveKey] = useState<string | null>(null);

  // Live key: hovered/focused item takes priority, else the active widget's key
  const liveKey = interactiveKey ?? widgetToKey(widget);
  const liveKeyRef = useRef(liveKey);
  liveKeyRef.current = liveKey;

  useEffect(() => {
    // One-time static snapshots on mount
    const now = new Date();
    const clocks: Partial<Record<ClockFace, string>> = {};
    for (const { id } of CLOCK_FACES) clocks[id] = renderClockToB64(id, now);
    setClockPixels(clocks);
    const data: Partial<Record<DataStyle, string>> = {};
    for (const { id } of DATA_STYLES) data[id] = renderDataStyleToB64(id);
    setDataThumbnails(data);
    const audio: Partial<Record<AudioStyle, string>> = {};
    for (const { id } of AUDIO_STYLES) audio[id] = renderAudioStyleToB64(id);
    setAudioThumbnails(audio);
    setHeatmapPixels(renderHeatmapThumbToB64());

    // 100ms interval — only re-renders the live (hovered/focused/active) thumbnail
    const iid = setInterval(() => {
      const k = liveKeyRef.current;
      if (!k) return;
      const n = new Date();
      if (k.startsWith('clock:')) {
        const face = k.slice(6) as ClockFace;
        setClockPixels(prev => ({ ...prev, [face]: renderClockToB64(face, n) }));
      } else if (k.startsWith('audio:')) {
        const style = k.slice(6) as AudioStyle;
        setAudioThumbnails(prev => ({ ...prev, [style]: renderAudioStyleToB64(style) }));
      }
    }, 100);
    return () => clearInterval(iid);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScrolled = useCallback(() => setScrollTarget(null), []);

  function handleClose() {
    setScrollTarget(null);
    setView('picker');
  }

  function handleSelectDifferent() {
    if (!widget) return;
    setScrollTarget(categoryOfWidget(widget));
    setView('picker');
  }

  function handlePick(picked: HudWidget) {
    onChange(picked);
    const noSettings = picked.widget === 'heatmap' || (picked.widget === 'data' && (picked.style === 'cores' || picked.style === 'scroll'));
    if (!noSettings) setView('settings');
  }

  // Picker — null widget (no preset selected) or user switching panels
  if (!widget || view === 'picker') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <PanelPicker
          clockPixels={clockPixels}
          dataThumbnails={dataThumbnails}
          audioThumbnails={audioThumbnails}
          heatmapPixels={heatmapPixels}
          currentWidget={widget}
          scrollToCategory={scrollTarget}
          onScrolled={handleScrolled}
          onPick={handlePick}
          onLiveKey={setInteractiveKey}
        />
      </div>
    );
  }

  // Settings view
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center shrink-0 px-2 py-1 border-b border-foreground/10">
        <Button variant="ghost" className="text-foreground/60 text-xs" aria-label="Select different panel" onClick={handleSelectDifferent}>
          <span aria-hidden="true">← select different</span>
        </Button>
        <Button variant="ghost" className="ml-auto text-foreground/60" aria-label="Close inspector" onClick={handleClose}>
          <span aria-hidden="true">✕</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 py-4 px-2">

          {widget.widget === 'clock' && (
            <div role="group" aria-label="Clock face" className="grid grid-cols-3 gap-4">
              {CLOCK_FACES.map(({ id, label }) => {
                const active = (widget.face ?? 'elegant') === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    aria-pressed={active}
                    className="group relative flex flex-col gap-2 items-center rounded-sm p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                    onMouseEnter={() => setInteractiveKey(`clock:${id}`)}
                    onMouseLeave={() => setInteractiveKey(null)}
                    onFocus={() => setInteractiveKey(`clock:${id}`)}
                    onBlur={() => setInteractiveKey(null)}
                    onClick={() => onChange({ widget: 'clock', face: id })}
                  >
                    <CornerBrackets active={active} />
                    <MatrixPreview pixels={clockPixels[id] ?? EMPTY_PIXELS} width={9} />
                    <span className="font-mono text-xs text-foreground">{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {widget.widget === 'audio' && (
            <div role="group" aria-label="Audio style" className="grid grid-cols-3 gap-4">
              {AUDIO_STYLES.map(({ id, label }) => {
                const active = (widget.style ?? AUDIO_STYLES[0]!.id) === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    aria-pressed={active}
                    className="group relative flex flex-col gap-2 items-center rounded-sm p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                    onMouseEnter={() => setInteractiveKey(`audio:${id}`)}
                    onMouseLeave={() => setInteractiveKey(null)}
                    onFocus={() => setInteractiveKey(`audio:${id}`)}
                    onBlur={() => setInteractiveKey(null)}
                    onClick={() => onChange({ widget: 'audio', style: id })}
                  >
                    <CornerBrackets active={active} />
                    <MatrixPreview pixels={audioThumbnails[id] ?? EMPTY_PIXELS} width={9} />
                    <span className="font-mono text-xs text-foreground">{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {widget.widget === 'data' && widget.style !== 'cores' && widget.style !== 'scroll' && (
            <div role="group" aria-label="Data widget settings" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs text-foreground/50">style</span>
                <Tabs
                  options={DATA_STYLES.filter(s => s.id !== 'cores' && s.id !== 'scroll').map(s => ({ value: s.id, label: s.label }))}
                  value={widget.style ?? 'line'}
                  onChange={(v) => {
                    const s = DATA_STYLES.find(d => d.id === v);
                    if (s) onChange({ ...widget, widget: 'data', style: s.id });
                  }}
                  aria-label="Data style"
                />
              </div>

              {(widget.style === 'line' || widget.style === 'fill' || widget.style === undefined) && (
                <div className="flex flex-col gap-3">
                  <span className="font-mono text-xs text-foreground/50">quadrants</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'top_left',     label: 'top left'  },
                        { key: 'top_right',    label: 'top right' },
                        { key: 'bottom_left',  label: 'bot left'  },
                        { key: 'bottom_right', label: 'bot right' },
                      ] as const
                    ).map(({ key, label }) => {
                      const val: DataMetric | 'none' = widget[key] ?? 'none';
                      return (
                        <div key={key} className="flex flex-col gap-1">
                          <label htmlFor={`${uid}-${key}`} className="font-mono text-xs text-foreground/55">{label}</label>
                          <Select
                            id={`${uid}-${key}`}
                            value={val}
                            onChange={e => {
                              const raw = e.target.value;
                              if (!DATA_METRIC_IDS.has(raw as DataMetric | 'none')) return;
                              const metric = raw as DataMetric | 'none';
                              type DataW = { widget: 'data'; style?: DataStyle; top_left?: DataMetric; top_right?: DataMetric; bottom_left?: DataMetric; bottom_right?: DataMetric };
                              const base: DataW = { widget: 'data' };
                              if (widget.style !== undefined) base.style = widget.style;
                              if (widget.top_left !== undefined) base.top_left = widget.top_left;
                              if (widget.top_right !== undefined) base.top_right = widget.top_right;
                              if (widget.bottom_left !== undefined) base.bottom_left = widget.bottom_left;
                              if (widget.bottom_right !== undefined) base.bottom_right = widget.bottom_right;
                              if (metric !== 'none') base[key] = metric;
                              onChange(base);
                            }}
                          >
                            {DATA_METRICS.map(m => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
