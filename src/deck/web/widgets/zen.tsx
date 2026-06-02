import { useState, useEffect, useRef } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { ZEN_STYLES, createZenRenderer, zenThumbFrame } from '../../../animations/zen-renderers.js';
import type { ZenStyle as ZenStyleImport } from '../../../animations/zen-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { BrowserWidgetDescriptor, GridContext } from './types.js';
import { bayerToB64, EMPTY_PIXELS } from './utils.js';
import { zenBase } from '../../../lib/widgets/zen.js';
import type { ZenWidget } from '../../../lib/widgets/zen.js';

// ── module-level renderer caches ──────────────────────────────────────────────

const _zenThumbs: Partial<Record<ZenStyleImport, string>> = {};
for (const { id } of ZEN_STYLES) {
  _zenThumbs[id] = bayerToB64(zenThumbFrame(id));
}

const _zenRenderers: Partial<Record<ZenStyleImport, ReturnType<typeof createZenRenderer>>> = {};

// ── ZenItem ───────────────────────────────────────────────────────────────────

// Animates a single zen style only while hovered or focused.
// Renderer is created lazily on first activation and stopped on deactivation.

/** Combine two 9-wide base64 pixel strings into one 18-wide string. */
function combinePx(left: string, right: string): string {
  return btoa(atob(left) + atob(right));
}

function ZenItem({ id, label, isSelected, dual, onSelect }: {
  id: ZenStyleImport;
  label: string;
  isSelected: boolean;
  dual: boolean;
  onSelect: () => void;
}) {
  const [pixels, setPixels] = useState(EMPTY_PIXELS);
  const width: 9 | 18 = dual ? 18 : 9;
  const rendererLRef  = useRef<ReturnType<typeof createZenRenderer> | null>(null);
  const rendererRRef  = useRef<ReturnType<typeof createZenRenderer> | null>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  function stopAnimation() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }

  function teardownRenderers() {
    rendererLRef.current?.stop(); rendererLRef.current = null;
    rendererRRef.current?.stop(); rendererRRef.current = null;
  }

  function startAnimation() {
    if (reducedMotion.current || intervalRef.current) return;
    if (dual) {
      if (!rendererLRef.current) rendererLRef.current = createZenRenderer(id, 'left');
      if (!rendererRRef.current) rendererRRef.current = createZenRenderer(id, 'right');
      const lR = rendererLRef.current, rR = rendererRRef.current;
      intervalRef.current = setInterval(() => {
        setPixels(combinePx(bayerToB64(lR.render()), bayerToB64(rR.render())));
      }, 100);
    } else {
      if (!rendererLRef.current) rendererLRef.current = createZenRenderer(id);
      const r = rendererLRef.current;
      intervalRef.current = setInterval(() => setPixels(bayerToB64(r.render())), 100);
    }
  }

  // On mount and when dual changes: generate static thumbnail
  useEffect(() => {
    stopAnimation();
    teardownRenderers();
    if (reducedMotion.current) return;
    if (dual) {
      setPixels(combinePx(bayerToB64(zenThumbFrame(id)), bayerToB64(zenThumbFrame(id))));
    } else {
      setPixels(bayerToB64(zenThumbFrame(id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dual]);

  useEffect(() => () => {
    stopAnimation();
    teardownRenderers();
  }, []);

  return (
    <div
      onMouseEnter={startAnimation}
      onMouseLeave={stopAnimation}
      onFocus={startAnimation}
      onBlur={stopAnimation}
    >
      <MatrixItem
        name={label}
        aria-label={label}
        width={width}
        pixels={pixels}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    </div>
  );
}

// ── ZenGrid ───────────────────────────────────────────────────────────────────

function ZenGrid({ currentWidget, onPick, dualModule }: GridContext) {
  const zenStyle = currentWidget?.widget === 'zen' ? (currentWidget.style ?? 'waves') : null;
  return (
    <div role="group" aria-label="Zen panels" className="flex flex-wrap gap-6">
      {ZEN_STYLES.map(({ id, label }) => (
        <ZenItem
          key={id}
          id={id}
          label={label}
          isSelected={zenStyle === id}
          dual={dualModule}
          onSelect={() => onPick({ widget: 'zen', style: id })}
        />
      ))}
    </div>
  );
}

// ── BrowserWidgetDescriptor ───────────────────────────────────────────────────

export const zenWidget: BrowserWidgetDescriptor<ZenWidget> = {
  ...zenBase,

  GridComponent: ZenGrid,

  renderThumbnail(widget, _side) {
    const style = (widget.style ?? 'waves') as ZenStyleImport;
    return _zenThumbs[style] ?? EMPTY_PIXELS;
  },

  renderPreview(widget, _side, _now) {
    const style = (widget.style ?? 'waves') as ZenStyleImport;
    if (!_zenRenderers[style]) _zenRenderers[style] = createZenRenderer(style);
    const frame = _zenRenderers[style]!.render();
    // bayer dither
    const out = new Uint8Array(9 * 34);
    const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;
    for (let col = 0; col < 9; col++) {
      for (let row = 0; row < 34; row++) {
        const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
        out[col * 34 + row] = (frame[col * 34 + row] ?? 0) > threshold ? 255 : 0;
      }
    }
    return out;
  },

  serializeConfig(widget, side) {
    return {
      [`${side}Widget`]: 'zen',
      ...(widget.style !== undefined ? { [`${side}ZenStyle`]: widget.style } : {}),
    };
  },
};
