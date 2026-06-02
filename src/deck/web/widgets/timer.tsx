import { useState, useEffect, useRef } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { renderElegantTimer, renderTwinzTimer, createHourglassTimerRenderer } from '../../../animations/timer-renderers.js';
import type { HourglassTimerRenderer } from '../../../animations/timer-renderers.js';
import { TimeInput } from '../components/ui/time-input.js';
import { Checkbox } from '../components/ui/checkbox.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { BrowserWidgetDescriptor, GridContext } from './types.js';
import { bwToB64, EMPTY_PIXELS } from './utils.js';
import { timerBase } from '../../../lib/widgets/timer.js';
import type { TimerWidget } from '../../../lib/widgets/timer.js';

// ── Demo constants ─────────────────────────────────────────────────────────

const TIMER_DEMO_MS     = 90_000; // 1m30s — stays in mm:ss mode for elegant preview
const HOURGLASS_DEMO_MS = 5 * 60_000;
const TWINZ_DEMO_MS     = 90_061; // offset so centiseconds visibly tick

// ── TimerGrid ──────────────────────────────────────────────────────────────

function TimerGrid({ currentWidget, onSettings }: GridContext) {
  const elegantRemRef   = useRef(TIMER_DEMO_MS);
  const hourglassRemRef = useRef(HOURGLASS_DEMO_MS);
  const twinzRemRef     = useRef(TWINZ_DEMO_MS);
  const hgRendererRef   = useRef<HourglassTimerRenderer | null>(null);
  if (!hgRendererRef.current) hgRendererRef.current = createHourglassTimerRenderer();

  const [pixels, setPixels] = useState<{ elegant: string; hourglass: string; twinz: string }>(() => ({
    elegant:   bwToB64(renderElegantTimer(elegantRemRef.current)),
    hourglass: bwToB64(hgRendererRef.current!.render(hourglassRemRef.current, HOURGLASS_DEMO_MS)),
    twinz:     bwToB64(renderTwinzTimer(twinzRemRef.current)),
  }));

  useEffect(() => {
    const iid = setInterval(() => {
      elegantRemRef.current   = Math.max(0, elegantRemRef.current - 100);
      if (elegantRemRef.current === 0) elegantRemRef.current = TIMER_DEMO_MS;

      hourglassRemRef.current = Math.max(0, hourglassRemRef.current - 100);
      if (hourglassRemRef.current === 0) hourglassRemRef.current = HOURGLASS_DEMO_MS;

      twinzRemRef.current = Math.max(0, twinzRemRef.current - 100);
      if (twinzRemRef.current === 0) twinzRemRef.current = TWINZ_DEMO_MS;

      setPixels({
        elegant:   bwToB64(renderElegantTimer(elegantRemRef.current)),
        hourglass: bwToB64(hgRendererRef.current!.render(hourglassRemRef.current, HOURGLASS_DEMO_MS)),
        twinz:     bwToB64(renderTwinzTimer(twinzRemRef.current)),
      });
    }, 100);
    return () => clearInterval(iid);
  }, []);

  const timerStyle = currentWidget?.widget === 'timer' ? (currentWidget.style ?? 'elegant') : null;
  const baseWidget = (style: 'elegant' | 'hourglass' | 'twinz'): HudWidget => ({
    widget: 'timer',
    style,
    ...(currentWidget?.widget === 'timer' ? { durationMs: currentWidget.durationMs, repeat: currentWidget.repeat } : {}),
  });

  return (
    <div role="group" aria-label="Timer panels" className="flex flex-wrap gap-6">
      <MatrixItem
        name="elegant"
        aria-label="elegant timer"
        width={9}
        pixels={pixels.elegant}
        isSelected={timerStyle === 'elegant'}
        onSelect={() => onSettings(baseWidget('elegant'))}
      />
      <MatrixItem
        name="hourglass"
        aria-label="hourglass timer"
        width={9}
        pixels={pixels.hourglass}
        isSelected={timerStyle === 'hourglass'}
        onSelect={() => onSettings(baseWidget('hourglass'))}
      />
      <MatrixItem
        name="twinz"
        aria-label="twinz timer"
        width={9}
        pixels={pixels.twinz}
        isSelected={timerStyle === 'twinz'}
        onSelect={() => onSettings(baseWidget('twinz'))}
      />
    </div>
  );
}

// ── TimerSettings ──────────────────────────────────────────────────────────

function TimerSettings({ currentWidget, uid, onChange }: GridContext) {
  if (currentWidget?.widget !== 'timer') return null;
  const widget = currentWidget as TimerWidget & { widget: 'timer' };

  const durationMs = widget.durationMs ?? 25 * 60_000;
  const totalSec   = Math.floor(durationMs / 1000);
  const h          = Math.floor(totalSec / 3600);
  const m          = Math.floor((totalSec % 3600) / 60);
  const s          = totalSec % 60;
  const pad        = (n: number) => String(n).padStart(2, '0');
  const timeValue  = `${pad(h)}:${pad(m)}:${pad(s)}`;
  const repeatId   = `${uid}-timer-repeat`;

  function handleTimeChange(val: string) {
    const safe  = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? n : 0);
    const parts = val.split(':').map(p => parseInt(p, 10));
    const newH  = safe(parts[0]);
    const newM  = safe(parts[1]);
    const newS  = safe(parts[2]);
    const newMs = (newH * 3600 + newM * 60 + newS) * 1000;
    onChange({ ...widget, durationMs: Math.max(1000, newMs) });
  }

  return (
    <div role="group" aria-label="Timer widget settings" className="flex flex-col gap-4">
      <TimeInput
        label="duration"
        value={timeValue}
        showSeconds={true}
        onChange={handleTimeChange}
      />
      <label htmlFor={repeatId} className="flex items-center gap-2 cursor-pointer select-none">
        <Checkbox
          id={repeatId}
          checked={widget.repeat ?? false}
          onChange={e => onChange({ ...widget, repeat: (e.target as HTMLInputElement).checked })}
        />
        <span className="font-mono text-xs">repeat</span>
      </label>
    </div>
  );
}

// ── Module-level preview state ────────────────────────────────────────────
// Hourglass preview cycles through a 60s demo timer so the preview matches
// hardware rendering including grain physics.

const HG_PREVIEW_TOTAL_MS = 60_000;
let _hgPreviewRem = HG_PREVIEW_TOTAL_MS;
const _previewHourglass = createHourglassTimerRenderer();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _hgPreviewRem = HG_PREVIEW_TOTAL_MS;
  });
}

// ── Descriptor ────────────────────────────────────────────────────────────

export const timerDescriptor: BrowserWidgetDescriptor<TimerWidget> = {
  ...timerBase,

  GridComponent: TimerGrid,
  SettingsComponent: TimerSettings,

  renderThumbnail(widget, _side) {
    const style = widget.style ?? 'elegant';
    const frame = style === 'twinz'
      ? renderTwinzTimer(90_061)
      : style === 'hourglass'
        ? (() => {
            const r = createHourglassTimerRenderer();
            return r.render(5 * 60_000 / 2, 5 * 60_000);
          })()
        : renderElegantTimer(90_000);
    const out = new Uint8Array(9 * 34);
    for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
    return btoa(String.fromCharCode(...out));
  },

  renderPreview(widget, _side, _now) {
    const style = widget.style ?? 'elegant';
    let frame: Uint8Array;
    if (style === 'hourglass') {
      frame = _previewHourglass.render(_hgPreviewRem, HG_PREVIEW_TOTAL_MS);
      _hgPreviewRem = Math.max(0, _hgPreviewRem - 100);
      if (_hgPreviewRem === 0) _hgPreviewRem = HG_PREVIEW_TOTAL_MS;
    } else if (style === 'twinz') {
      frame = renderTwinzTimer(90_061);
    } else {
      frame = renderElegantTimer(90_000);
    }
    const out = new Uint8Array(9 * 34);
    for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
    return out;
  },

  serializeConfig(widget, side) {
    const s = side;
    return {
      [`${s}Widget`]: 'timer',
      [`${s}TimerStyle`]: widget.style ?? 'elegant',
      ...(widget.durationMs !== undefined ? { [`${s}TimerDurationMs`]: widget.durationMs } : {}),
      ...(widget.repeat !== undefined ? { [`${s}TimerRepeat`]: widget.repeat } : {}),
    };
  },
};
