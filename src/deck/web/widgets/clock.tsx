import { useState, useEffect } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace as ClockFaceImport, ClockRenderer } from '../../../animations/clock-renderers.js';
import type { BrowserWidgetDescriptor, GridContext } from './types.js';
import { bwToB64, EMPTY_PIXELS } from './utils.js';
import { clockBase } from '../../../lib/widgets/clock.js';
import type { ClockWidget } from '../../../lib/widgets/clock.js';

// Module-level cache
const _renderers: Partial<Record<ClockFaceImport, ClockRenderer>> = {};
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _renderers) delete _renderers[k as ClockFaceImport];
  });
}

function renderClock(face: ClockFaceImport, now: Date): string {
  if (!_renderers[face]) _renderers[face] = createClockRenderer(face);
  return bwToB64(_renderers[face]!({ now, side: 'left' }));
}

function ClockGrid({ currentWidget, onPick }: GridContext) {
  const [pixels, setPixels] = useState<Partial<Record<ClockFaceImport, string>>>(() => {
    const now = new Date();
    return Object.fromEntries(CLOCK_FACES.map(({ id }) => [id, renderClock(id, now)]));
  });
  useEffect(() => {
    const iid = setInterval(() => {
      const now = new Date();
      setPixels(Object.fromEntries(CLOCK_FACES.map(({ id }) => [id, renderClock(id, now)])));
    }, 100);
    return () => clearInterval(iid);
  }, []);
  return (
    <div role="group" aria-label="Clock panels" className="flex flex-wrap gap-6">
      {CLOCK_FACES.map(({ id, label }) => (
        <MatrixItem
          key={id}
          name={label}
          aria-label={label}
          width={9}
          pixels={pixels[id] ?? EMPTY_PIXELS}
          isSelected={currentWidget?.widget === 'clock' && (currentWidget.face ?? 'elegant') === id}
          onSelect={() => onPick({ widget: 'clock', face: id })}
        />
      ))}
    </div>
  );
}

// Thumbnail/preview cache (separate from the Grid's cache to avoid React lifecycle issues)
const _thumbCache: Partial<Record<ClockFaceImport, ClockRenderer>> = {};

function bwToB64Frame(frame: Uint8Array): Uint8Array {
  const out = new Uint8Array(9 * 34);
  for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return out;
}

export const clockDescriptor: BrowserWidgetDescriptor<ClockWidget> = {
  ...clockBase,

  GridComponent: ClockGrid,

  renderThumbnail(widget, side) {
    const face = widget.face ?? 'elegant';
    if (!_thumbCache[face]) _thumbCache[face] = createClockRenderer(face);
    const frame = _thumbCache[face]!({ now: new Date(), side });
    return bwToB64(frame);
  },

  renderPreview(widget, side, now) {
    const face = widget.face ?? 'elegant';
    if (!_thumbCache[face]) _thumbCache[face] = createClockRenderer(face);
    const frame = _thumbCache[face]!({ now, side });
    return bwToB64Frame(frame);
  },

  serializeConfig(widget, side) {
    const s = side === 'left' ? 'left' : 'right';
    return {
      [`${s}Widget`]: 'clock',
      ...(widget.face !== undefined ? { [`${s}Face`]: widget.face } : {}),
    };
  },
};
