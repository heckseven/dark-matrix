import { useState, useEffect, useCallback, useId } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import type { DataStyle, DataMetric } from '../../../animations/data-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';

const COLS = 9;
const ROWS = 34;

const DATA_METRICS: { id: DataMetric | 'none'; label: string }[] = [
  { id: 'cpu',    label: 'cpu' },
  { id: 'ram',    label: 'ram' },
  { id: 'net_rx', label: 'net rx' },
  { id: 'net_tx', label: 'net tx' },
  { id: 'none',   label: 'none' },
];

// ── clock rendering ───────────────────────────────────────────────────────

const _clockCache: Partial<Record<ClockFace, ClockRenderer>> = {};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _clockCache) delete _clockCache[k as ClockFace];
  });
}

function renderClockToB64(face: ClockFace, now: Date): string {
  if (!_clockCache[face]) _clockCache[face] = createClockRenderer(face);
  const frame = _clockCache[face]!({ now, side: 'left' });
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

// ── corner brackets (reused from HudPanel pattern) ────────────────────────

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

// ── main component ────────────────────────────────────────────────────────

export type HudInspectorProps = {
  widget: HudWidget | null;
  onChange: (widget: HudWidget) => void;
};

export function HudInspector({ widget, onChange }: HudInspectorProps) {
  const uid = useId();
  const [clockPixels, setClockPixels] = useState<Partial<Record<ClockFace, string>>>({});

  const renderClocks = useCallback(() => {
    const now = new Date();
    const next: Partial<Record<ClockFace, string>> = {};
    for (const { id } of CLOCK_FACES) next[id] = renderClockToB64(id, now);
    setClockPixels(next);
  }, []);

  useEffect(() => {
    renderClocks();
    const id = setInterval(renderClocks, 100);
    return () => clearInterval(id);
  }, [renderClocks]);

  if (!widget) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <p className="font-mono text-xs text-foreground/40">no preset selected</p>
      </div>
    );
  }

  const widgetType = widget.widget;

  function switchType(type: 'clock' | 'data') {
    if (type === 'clock') {
      onChange({ widget: 'clock', face: 'elegant' });
    } else {
      onChange({ widget: 'data', style: 'line' });
    }
  }

  function updateClockFace(face: ClockFace) {
    onChange({ widget: 'clock', face });
  }

  function updateDataStyle(style: DataStyle) {
    if (widget?.widget !== 'data') return;
    onChange({ ...widget, widget: 'data', style });
  }

  function updateQuadrant(key: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right', metric: DataMetric | 'none') {
    if (widget?.widget !== 'data') return;
    type DataW = { widget: 'data'; style?: DataStyle; top_left?: DataMetric; top_right?: DataMetric; bottom_left?: DataMetric; bottom_right?: DataMetric };
    const base: DataW = { widget: 'data' };
    if (widget.style !== undefined) base.style = widget.style;
    if (widget.top_left !== undefined) base.top_left = widget.top_left;
    if (widget.top_right !== undefined) base.top_right = widget.top_right;
    if (widget.bottom_left !== undefined) base.bottom_left = widget.bottom_left;
    if (widget.bottom_right !== undefined) base.bottom_right = widget.bottom_right;
    if (metric !== 'none') base[key] = metric;
    // else leave key absent (exactOptionalPropertyTypes: don't assign undefined)
    onChange(base);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-6 py-4 px-2">
      {/* Widget type toggle */}
      <div role="group" aria-label="Widget type" className="flex gap-0 font-mono text-xs border border-foreground/30 self-start">
        {(['clock', 'data'] as const).map(type => (
          <button
            key={type}
            type="button"
            aria-pressed={widgetType === type}
            className={`px-4 py-1 transition-colors ${widgetType === type ? 'bg-foreground text-background' : 'text-foreground/60 hover:text-foreground'}`}
            onClick={() => switchType(type)}
          >
            {type}
          </button>
        ))}
      </div>

      {widgetType === 'clock' && (
        <div role="group" aria-label="Clock face" className="grid grid-cols-3 gap-4">
          {CLOCK_FACES.map(({ id, label }) => {
            const pixels = clockPixels[id] ?? btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));
            const active = widget.widget === 'clock' && (widget.face ?? 'elegant') === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={active}
                className="group relative flex flex-col gap-2 items-center rounded-sm p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                onClick={() => updateClockFace(id)}
              >
                <CornerBrackets active={active} />
                <MatrixPreview pixels={pixels} width={9} />
                <span className="font-mono text-xs text-foreground">{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {widgetType === 'data' && widget.widget === 'data' && (
        <div className="flex flex-col gap-4">
          {/* Style toggle */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-foreground/50">style</span>
            <div role="group" aria-label="Data style" className="flex gap-0 font-mono text-xs border border-foreground/30 self-start">
              {(['line', 'bars'] as const satisfies DataStyle[]).map(style => (
                <button
                  key={style}
                  type="button"
                  aria-pressed={(widget.style ?? 'line') === style}
                  className={`px-4 py-1 transition-colors ${(widget.style ?? 'line') === style ? 'bg-foreground text-background' : 'text-foreground/60 hover:text-foreground'}`}
                  onClick={() => updateDataStyle(style)}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Quadrant dropdowns */}
          <div className="flex flex-col gap-3">
            <span className="font-mono text-xs text-foreground/50">quadrants</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: 'top_left',     label: 'top left' },
                  { key: 'top_right',    label: 'top right' },
                  { key: 'bottom_left',  label: 'bot left' },
                  { key: 'bottom_right', label: 'bot right' },
                ] as const
              ).map(({ key, label }) => {
                const value: DataMetric | 'none' = widget[key] ?? 'none';
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <label htmlFor={`${uid}-${key}`} className="font-mono text-xs text-foreground/40">{label}</label>
                    <select
                      id={`${uid}-${key}`}
                      className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-1 rounded-none focus:outline-none focus:border-white"
                      value={value}
                      onChange={e => updateQuadrant(key, e.target.value as DataMetric | 'none')}
                    >
                      {DATA_METRICS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
