import { useState, useEffect, useRef } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { Select } from '../components/ui/select.js';
import { createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataStyle as DataStyleImport, DataRenderer } from '../../../animations/data-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { BrowserWidgetDescriptor, GridContext } from './types.js';
import { bwToB64, EMPTY_PIXELS } from './utils.js';
import { dataBase } from '../../../lib/widgets/data.js';
import type { DataWidget, DataMetric } from '../../../lib/widgets/data.js';

// ── Seeded renderer cache for thumbnails/previews ─────────────────────────

const _thumbCache: Partial<Record<DataStyleImport, DataRenderer>> = {};

function makeSeededDataRenderer(style: DataStyleImport): DataRenderer {
  const r = createDataRenderer({ style });
  if (style === 'cores') {
    r.update({ cpuPct: 45, ramPct: 70, netRxBps: 1_000_000, netTxBps: 500_000,
      cpuCores: [80, 45, 30, 60, 70, 20, 50, 40] });
  } else if (style === 'heatcore') {
    r.update({ cpuPct: 45, ramPct: 0, netRxBps: 0, netTxBps: 0,
      cpuCores: [80, 45, 30, 60, 70, 20, 50, 40, 55], cpuTempC: 42 });
  } else if (style === 'gpuburn') {
    r.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, gpuPct: 60, gpuTempC: 72 });
  } else {
    // line, fill, scroll — feed metric history
    for (let i = 16; i >= 0; i--) {
      r.update({ cpuPct: 35 + 25 * Math.sin(i * 0.4), ramPct: 60 + 15 * Math.sin(i * 0.3 + 1),
        netRxBps: 800_000 + 400_000 * Math.sin(i * 0.5 + 2),
        netTxBps: 300_000 + 200_000 * Math.sin(i * 0.35) });
    }
  }
  return r;
}

function getDataRenderer(style: DataStyleImport): DataRenderer {
  if (!_thumbCache[style]) _thumbCache[style] = makeSeededDataRenderer(style);
  return _thumbCache[style]!;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _thumbCache) delete _thumbCache[k as DataStyleImport];
  });
}

// ── Data presets ──────────────────────────────────────────────────────────

const DATA_PRESETS: { id: string; label: string; style: DataStyleImport; widget: HudWidget }[] = [
  { id: 'heatcore',    label: 'heatcore',  style: 'heatcore', widget: { widget: 'data', style: 'heatcore' } },
  { id: 'gpuburn',     label: 'gpuburn',   style: 'gpuburn',  widget: { widget: 'data', style: 'gpuburn'  } },
  { id: 'system',      label: 'system',    style: 'line',     widget: { widget: 'data', style: 'line',     top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' } },
  { id: 'fill-system', label: 'fill',      style: 'fill',     widget: { widget: 'data', style: 'fill',     top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' } },
  { id: 'cpu-scroll',  label: 'scroll',    style: 'scroll',   widget: { widget: 'data', style: 'scroll',   top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' } },
  { id: 'cpu-cores',   label: 'cores',     style: 'cores',    widget: { widget: 'data', style: 'cores'    } },
];

// ── initDataRenderers ─────────────────────────────────────────────────────

function initDataRenderers(): Record<DataStyleImport, DataRenderer> {
  const make = (style: DataStyleImport): DataRenderer => {
    const r = createDataRenderer({ style });
    if (style === 'cores') {
      r.update({ cpuPct: 45, ramPct: 70, netRxBps: 1_000_000, netTxBps: 500_000,
        cpuCores: [80, 45, 30, 60, 70, 20, 50, 40] });
    } else if (style === 'heatcore') {
      r.update({ cpuPct: 45, ramPct: 0, netRxBps: 0, netTxBps: 0,
        cpuCores: [80, 45, 30, 60, 70, 20, 50, 40, 55], cpuTempC: 42 });
    } else if (style === 'gpuburn') {
      r.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, gpuPct: 60, gpuTempC: 72 });
    } else {
      for (let i = 16; i >= 0; i--) {
        r.update({ cpuPct: 35 + 25 * Math.sin(i * 0.4), ramPct: 60 + 15 * Math.sin(i * 0.3 + 1),
          netRxBps: 800_000 + 400_000 * Math.sin(i * 0.5 + 2),
          netTxBps: 300_000 + 200_000 * Math.sin(i * 0.35) });
      }
    }
    return r;
  };
  return { line: make('line'), fill: make('fill'), scroll: make('scroll'), cores: make('cores'), heatcore: make('heatcore'), gpuburn: make('gpuburn') };
}

// ── DataGrid ──────────────────────────────────────────────────────────────

function DataGrid({ currentWidget, onPick, onSettings }: GridContext) {
  const renderersRef = useRef<Record<DataStyleImport, DataRenderer> | null>(null);
  if (!renderersRef.current) renderersRef.current = initDataRenderers();

  const [pixels, setPixels] = useState<Record<DataStyleImport, string>>(() => {
    const r = renderersRef.current!;
    return { line: bwToB64(r.line.render()), fill: bwToB64(r.fill.render()), scroll: bwToB64(r.scroll.render()), cores: bwToB64(r.cores.render()), heatcore: bwToB64(r.heatcore.render()), gpuburn: bwToB64(r.gpuburn.render()) };
  });
  const frameRef = useRef(0);

  useEffect(() => {
    const iid = setInterval(() => {
      frameRef.current++;
      const f = frameRef.current;
      const r = renderersRef.current!;
      const base = f * 0.04;
      const metrics = {
        cpuPct:   35 + 25 * Math.sin(base),
        ramPct:   60 + 15 * Math.sin(base * 0.75 + 1),
        netRxBps: 800_000 + 400_000 * Math.sin(base * 1.25 + 2),
        netTxBps: 300_000 + 200_000 * Math.sin(base * 0.875),
      };
      r.line.update(metrics);
      r.fill.update(metrics);
      r.scroll.update(metrics);
      const cores = [
        Math.round(50 + 40 * Math.sin(base * 1.1)),       Math.round(30 + 30 * Math.sin(base * 0.9 + 1)),
        Math.round(70 + 25 * Math.sin(base * 1.3 + 2)),   Math.round(45 + 35 * Math.sin(base * 0.7 + 3)),
        Math.round(60 + 30 * Math.sin(base * 1.2)),        Math.round(40 + 40 * Math.sin(base * 0.8 + 1.5)),
        Math.round(55 + 35 * Math.sin(base * 1.4 + 0.5)), Math.round(65 + 25 * Math.sin(base * 1.1 + 2.5)),
      ];
      r.cores.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, cpuCores: cores });
      r.heatcore.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0,
        cpuCores: [...cores, Math.round(50 + 35 * Math.sin(base * 0.95))],
        cpuTempC: Math.round(42 + 8 * Math.sin(base * 0.2)) });
      r.gpuburn.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0,
        gpuPct: Math.round(50 + 40 * Math.sin(base * 0.3)),
        gpuTempC: Math.round(65 + 15 * Math.sin(base * 0.15)) });
      setPixels({ line: bwToB64(r.line.render()), fill: bwToB64(r.fill.render()), scroll: bwToB64(r.scroll.render()), cores: bwToB64(r.cores.render()), heatcore: bwToB64(r.heatcore.render()), gpuburn: bwToB64(r.gpuburn.render()) });
    }, 100);
    return () => clearInterval(iid);
  }, []);

  return (
    <div role="group" aria-label="Data panels" className="flex flex-wrap gap-6">
      {DATA_PRESETS.map(preset => {
        const hasSettings = preset.style === 'line' || preset.style === 'fill' || preset.style === 'scroll';
        return (
          <MatrixItem
            key={preset.id}
            name={preset.label}
            aria-label={preset.label}
            width={9}
            pixels={pixels[preset.style]}
            isSelected={currentWidget?.widget === 'data' && (currentWidget.style ?? 'line') === preset.style}
            onSelect={() => hasSettings ? onSettings(preset.widget) : onPick(preset.widget)}
          />
        );
      })}
    </div>
  );
}

// ── DataSettings ──────────────────────────────────────────────────────────

const DATA_METRICS: { id: DataMetric | 'none'; label: string }[] = [
  { id: 'cpu',    label: 'cpu'    },
  { id: 'ram',    label: 'ram'    },
  { id: 'net_rx', label: 'net rx' },
  { id: 'net_tx', label: 'net tx' },
  { id: 'none',   label: 'none'   },
];
const DATA_METRIC_IDS = new Set<string>(DATA_METRICS.map(m => m.id));

function DataSettings(ctx: GridContext) {
  const widget = ctx.currentWidget as DataWidget | null;
  if (!widget || widget.widget !== 'data') return null;
  const { uid, onChange } = ctx;
  return (
    <div role="group" aria-label="Data widget settings" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs text-muted-foreground">quadrants</span>
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
                <label htmlFor={`${uid}-${key}`} className="font-mono text-xs text-muted-foreground">{label}</label>
                <Select
                  id={`${uid}-${key}`}
                  value={val}
                  options={DATA_METRICS.map(m => ({ value: m.id, label: m.label }))}
                  onValueChange={raw => {
                    if (!DATA_METRIC_IDS.has(raw)) return;
                    const metric = raw as DataMetric | 'none';
                    const next = { ...widget };
                    if (metric !== 'none') next[key] = metric;
                    else delete next[key];
                    onChange(next);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Descriptor ────────────────────────────────────────────────────────────

export const dataDescriptor: BrowserWidgetDescriptor<DataWidget> = {
  ...dataBase,

  GridComponent: DataGrid,
  SettingsComponent: DataSettings,

  renderThumbnail(widget, _side) {
    const style: DataStyleImport = widget.style ?? 'line';
    const frame = getDataRenderer(style).render();
    return bwToB64(frame);
  },

  renderPreview(widget, _side, _now) {
    const frame = getDataRenderer(widget.style ?? 'line').render();
    const out = new Uint8Array(9 * 34);
    for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
    return out;
  },

  serializeConfig(widget, side) {
    return {
      [`${side}Widget`]: 'data',
      ...(widget.style !== undefined ? { [`${side}DataStyle`]: widget.style } : {}),
    };
  },
};
