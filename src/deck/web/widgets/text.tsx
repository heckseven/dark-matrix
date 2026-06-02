import { useState, useEffect } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { Input } from '../components/ui/input.js';
import { Radio } from '../components/ui/radio.js';
import { ScrubInput } from '../components/ui/scrub-input.js';
import { Checkbox } from '../components/ui/checkbox.js';
import {
  TEXT_STYLES,
  TEXT_SIZES,
  TEXT_SPEEDS,
  TEXT_FLICKERS,
  TEXT_TRANSITIONS,
  TEXT_SIZE_PX,
  SPEED_PXPS,
  SPEED_DWELL_MS,
  createTextRenderer,
  textRendererCacheKey,
} from '../../../animations/text-renderers.js';
import type {
  TextStyle as TextStyleImport,
  TextSize as TextSizeImport,
  TextSpeed as TextSpeedImport,
  TextFlicker as TextFlickerImport,
  TextTransition as TextTransitionImport,
  TextRenderer,
} from '../../../animations/text-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { BrowserWidgetDescriptor, GridContext } from './types.js';
import { bwToB64, EMPTY_PIXELS } from './utils.js';
import { textBase } from '../../../lib/widgets/text.js';
import type { TextWidget } from '../../../lib/widgets/text.js';

// ── Display names ─────────────────────────────────────────────────────────────

// Display names only — the internal style keys (columnar/bigglyph) stay the same
// so existing saved presets keep working.
export const STRINGS_STYLE_LABELS: Record<TextStyleImport, string> = {
  marquee: 'marquee', columnar: 'tokyo', spine: 'spine', bigglyph: 'byte', neon: 'neon', vegas: 'vegas',
};

// ── Size / speed constraints ──────────────────────────────────────────────────

// spine/neon/bigglyph/vegas only read well at the two smallest sizes on the 9-wide panel.
const SIZE_RESTRICTED: readonly TextStyleImport[] = ['spine', 'neon', 'bigglyph', 'vegas'];
const sizeOptionsFor = (style: TextStyleImport): readonly TextSizeImport[] =>
  SIZE_RESTRICTED.includes(style) ? (['tiny', 'small'] as const) : TEXT_SIZES;
// The two fastest tiers (fast2/fast3) are bigglyph-only; scrolling stops at 'fast'.
// vegas chase reads best slow — 40px/s ('fast') runs the bulbs too fast, so it
// tops out at 20px/s ('normal').
const speedOptionsFor = (style: TextStyleImport): readonly TextSpeedImport[] =>
  style === 'bigglyph' ? TEXT_SPEEDS
    : style === 'vegas' ? TEXT_SPEEDS.filter(s => s !== 'fast' && s !== 'fast2' && s !== 'fast3')
    : TEXT_SPEEDS.filter(s => s !== 'fast2' && s !== 'fast3');

// ── widgetForStyle ────────────────────────────────────────────────────────────

// Build the text widget for a chosen style, enforcing per-style constraints:
// only marquee spans, and restricted styles cap at 'small'.
function widgetForStyle(base: (HudWidget & { widget: 'text' }) | null, style: TextStyleImport): HudWidget & { widget: 'text' } {
  const next: HudWidget & { widget: 'text' } = base
    ? { ...base, style }
    : { widget: 'text', text: 'HACK', style, size: 'small', speed: style === 'vegas' ? 'slow' : 'normal' };
  if (style !== 'marquee') delete next.span;
  if (SIZE_RESTRICTED.includes(style) && (next.size === 'medium' || next.size === 'large')) next.size = 'small';
  // vegas tops out at 20px/s — clamp a faster tier (e.g. 'fast') carried over
  // from another style down to the 10px/s default.
  if (style === 'vegas' && next.speed !== undefined && !speedOptionsFor('vegas').includes(next.speed)) next.speed = 'slow';
  return next;
}

// ── Preview renderer cache ────────────────────────────────────────────────────

// One preview renderer per style, each rendering its OWN name as the text so a
// tile shows what its style looks like. Recreated once (module-level).
const _stringPreviewRenderers = TEXT_STYLES.map(style =>
  createTextRenderer({ text: STRINGS_STYLE_LABELS[style].toUpperCase().replace(/\s/g, ''), style, size: 'tiny', speed: 'normal' }, 'left'),
);

// ── Thumbnail / preview renderer cache ───────────────────────────────────────

const _textThumbCache: Record<string, TextRenderer> = {};
const _textPreviewCache: Record<string, TextRenderer> = {};

function getTextPreviewRenderer(w: Extract<HudWidget, { widget: 'text' }>, side: 'left' | 'right'): TextRenderer {
  const key = textRendererCacheKey(w, side);
  if (!_textPreviewCache[key]) _textPreviewCache[key] = createTextRenderer(w, side);
  return _textPreviewCache[key]!;
}

// ── StringsGrid ───────────────────────────────────────────────────────────────

function StringsGrid({ currentWidget, onSettings }: {
  currentWidget: HudWidget | null;
  onSettings: (w: HudWidget) => void;
}) {
  const [pixels, setPixels] = useState<string[]>(() => _stringPreviewRenderers.map(r => bwToB64(r.render(new Date()))));
  useEffect(() => {
    const iid = setInterval(() => {
      const now = new Date();
      setPixels(_stringPreviewRenderers.map(r => bwToB64(r.render(now))));
    }, 100);
    return () => clearInterval(iid);
  }, []);
  return (
    <div role="group" aria-label="String widgets" className="flex flex-wrap gap-6">
      {TEXT_STYLES.map((style, i) => {
        const selected = currentWidget?.widget === 'text' && (currentWidget.style ?? 'marquee') === style;
        return (
          <MatrixItem
            key={style}
            name={STRINGS_STYLE_LABELS[style]}
            aria-label={`${STRINGS_STYLE_LABELS[style]} text widget`}
            width={9}
            pixels={pixels[i] ?? EMPTY_PIXELS}
            isSelected={selected}
            onSelect={() => onSettings(widgetForStyle(currentWidget?.widget === 'text' ? currentWidget : null, style))}
          />
        );
      })}
    </div>
  );
}

// ── StringsSettings ───────────────────────────────────────────────────────────

function StringsSettings({ widget, uid, onChange, onChangeBoth }: {
  widget: HudWidget & { widget: 'text' };
  uid: string;
  onChange: (w: HudWidget) => void;
  onChangeBoth?: (w: HudWidget) => void;
}) {
  const style = widget.style ?? 'marquee';
  // Route to both module slots whenever span is involved on either the current
  // or next state, so entering/leaving span never leaves a stale opposite side.
  const apply = (next: HudWidget & { widget: 'text' }) => {
    ((widget.span || next.span) && onChangeBoth ? onChangeBoth : onChange)(next);
  };
  // Label shows only the value (no tier name) — bigglyph speed = per-letter
  // dwell; everything else that moves = scroll px/s.
  const speedLabel = (s: TextSpeedImport): string => {
    if (style === 'bigglyph') {
      const ms = SPEED_DWELL_MS[s];
      return `${ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}/letter`;
    }
    return `${SPEED_PXPS[s]}px/s`;
  };
  // Style isn't a setting here — it's chosen by picking a widget tile in the grid.
  const fields: { key: string; label: string; value: string; options: { value: string; label: string }[]; set: (v: string) => void }[] = [
    { key: 'size',  label: 'size',  value: widget.size  ?? 'small',  options: sizeOptionsFor(style).map(o => ({ value: o, label: `${TEXT_SIZE_PX[o]}px` })), set: v => apply({ ...widget, size: v as TextSizeImport }) },
    // neon is static — speed doesn't apply, so it has no speed group.
    ...(style !== 'neon'
      ? [{ key: 'speed', label: 'speed', value: widget.speed ?? 'normal', options: speedOptionsFor(style).map(o => ({ value: o, label: speedLabel(o) })), set: (v: string) => apply({ ...widget, speed: v as TextSpeedImport }) }]
      : []),
    ...(style === 'neon'
      ? [{ key: 'flicker', label: 'flicker', value: widget.flicker ?? 'medium', options: TEXT_FLICKERS.map(o => ({ value: o, label: o })), set: (v: string) => apply({ ...widget, flicker: v as TextFlickerImport }) }]
      : []),
    ...(style === 'bigglyph'
      ? [{ key: 'transition', label: 'transition', value: widget.transition ?? 'slide', options: TEXT_TRANSITIONS.map(o => ({ value: o, label: o })), set: (v: string) => apply({ ...widget, transition: v as TextTransitionImport }) }]
      : []),
  ];
  return (
    <div role="group" aria-label="Text widget settings" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-text`} className="font-mono text-xs text-muted-foreground">text</label>
        <Input
          id={`${uid}-text`}
          fluid
          maxLength={128}
          value={widget.text}
          placeholder="enter text…"
          onChange={e => apply({ ...widget, text: e.currentTarget.value })}
        />
      </div>
      {fields.map(({ key, label, value, options, set }) => (
        <div key={key} className="flex flex-col gap-1.5">
          <span id={`${uid}-${key}-label`} className="font-mono text-xs text-muted-foreground">{label}</span>
          <div role="radiogroup" aria-labelledby={`${uid}-${key}-label`} className="flex flex-col gap-1">
            {options.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none">
                <Radio name={`${uid}-${key}`} value={opt.value} checked={value === opt.value} onChange={() => set(opt.value)} />
                <span className="font-mono text-xs">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {style !== 'neon' && style !== 'vegas' && (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">loop delay</span>
          <ScrubInput
            aria-label="loop delay"
            suffix="ms"
            min={0}
            max={10000}
            pixelsPerUnit={0.1}
            value={widget.loopDelayMs ?? 0}
            onChange={v => apply({ ...widget, loopDelayMs: v })}
          />
        </div>
      )}
      {style === 'marquee' && (
        <label htmlFor={`${uid}-span`} className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            id={`${uid}-span`}
            checked={widget.span ?? false}
            onChange={e => apply({ ...widget, span: (e.target as HTMLInputElement).checked })}
          />
          <span className="font-mono text-xs">span both modules</span>
        </label>
      )}
    </div>
  );
}

// ── GridComponent ─────────────────────────────────────────────────────────────

function TextGridComponent(ctx: GridContext) {
  return <StringsGrid currentWidget={ctx.currentWidget} onSettings={ctx.onSettings} />;
}

// ── SettingsComponent ─────────────────────────────────────────────────────────

function TextSettingsComponent(ctx: GridContext) {
  const w = ctx.currentWidget;
  if (!w || w.widget !== 'text') return null;
  return (
    <StringsSettings
      widget={w as HudWidget & { widget: 'text' }}
      uid={ctx.uid}
      onChange={ctx.onChange}
      onChangeBoth={ctx.onChangeBoth}
    />
  );
}

// ── Descriptor ───────────────────────────────────────────────────────────────

export const textDescriptor: BrowserWidgetDescriptor<TextWidget> = {
  ...textBase,

  GridComponent: TextGridComponent,
  SettingsComponent: TextSettingsComponent,

  renderThumbnail(widget, side) {
    const key = textRendererCacheKey(widget, side);
    if (!_textThumbCache[key]) _textThumbCache[key] = createTextRenderer(widget, side);
    const frame = _textThumbCache[key]!.render(new Date());
    return bwToB64(frame);
  },

  renderPreview(widget, side, now) {
    const frame = getTextPreviewRenderer(widget as Extract<HudWidget, { widget: 'text' }>, side).render(now);
    const out = new Uint8Array(9 * 34);
    for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
    return out;
  },

  serializeConfig(widget, side) {
    return {
      [`${side}Widget`]: 'text',
      [`${side}Text`]: widget.text,
      ...(widget.style !== undefined ? { [`${side}TextStyle`]: widget.style } : {}),
      ...(widget.size !== undefined ? { [`${side}TextSize`]: widget.size } : {}),
      ...(widget.speed !== undefined ? { [`${side}TextSpeed`]: widget.speed } : {}),
      ...(widget.span !== undefined ? { [`${side}TextSpan`]: widget.span } : {}),
      ...(widget.flicker !== undefined ? { [`${side}TextFlicker`]: widget.flicker } : {}),
      ...(widget.transition !== undefined ? { [`${side}TextTransition`]: widget.transition } : {}),
      ...(widget.loopDelayMs !== undefined ? { [`${side}TextLoopDelayMs`]: widget.loopDelayMs } : {}),
    };
  },
};
