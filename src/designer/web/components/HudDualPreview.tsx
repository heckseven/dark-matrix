import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockFace, ClockRenderer } from '../../../animations/clock-renderers.js';
import { createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataStyle, DataRenderer } from '../../../animations/data-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';

const COLS = 9;
const ROWS = 34;

// ── renderer caches ───────────────────────────────────────────────────────

const _clockCacheL: Partial<Record<ClockFace, ClockRenderer>> = {};
const _clockCacheR: Partial<Record<ClockFace, ClockRenderer>> = {};
const _dataCache: Partial<Record<DataStyle, DataRenderer>> = {};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _clockCacheL) delete _clockCacheL[k as ClockFace];
    for (const k in _clockCacheR) delete _clockCacheR[k as ClockFace];
    for (const k in _dataCache) delete _dataCache[k as DataStyle];
  });
}

function emptyB64(): string {
  return btoa(String.fromCharCode(...new Uint8Array(COLS * ROWS)));
}

function renderWidget(widget: HudWidget | null, side: 'left' | 'right', now: Date): string {
  if (!widget) return emptyB64();
  try {
    if (widget.widget === 'clock') {
      const face: ClockFace = widget.face ?? 'elegant';
      const cache = side === 'left' ? _clockCacheL : _clockCacheR;
      if (!cache[face]) cache[face] = createClockRenderer(face);
      const frame = cache[face]!({ now, side });
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return btoa(String.fromCharCode(...out));
    } else {
      const style: DataStyle = widget.style ?? 'line';
      if (!_dataCache[style]) _dataCache[style] = createDataRenderer({ style });
      const frame = _dataCache[style]!.render();
      const out = new Uint8Array(COLS * ROWS);
      for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
      return btoa(String.fromCharCode(...out));
    }
  } catch {
    return emptyB64();
  }
}

function combinePixels(left: string, right: string): string {
  try { return btoa(atob(left) + atob(right)); } catch { return left; }
}

// ── corner brackets ───────────────────────────────────────────────────────

function SideIndicator({ active, side }: { active: boolean; side: 'left' | 'right' }) {
  if (!active) return null;
  const CELL = 3;
  const GAP = 2;
  const PITCH = CELL + GAP;
  const MODULE_GAP = 4;
  // The 9-col half width in CSS pixels
  const halfW = 9 * PITCH - GAP;
  const fullH = ROWS * PITCH - GAP;
  const bracketSize = 12;
  const borderColor = 'white';
  const b = `1px solid ${borderColor}`;
  const offset = side === 'right' ? halfW + MODULE_GAP : 0;

  const c = (extra: CSSProperties): CSSProperties => ({
    position: 'absolute',
    width: bracketSize,
    height: bracketSize,
    pointerEvents: 'none',
    ...extra,
  });

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: offset,
        width: halfW,
        height: fullH,
        pointerEvents: 'none',
      }}
    >
      <span style={c({ top: 0, left: 0, borderTop: b, borderLeft: b })} />
      <span style={c({ top: 0, right: 0, borderTop: b, borderRight: b })} />
      <span style={c({ bottom: 0, left: 0, borderBottom: b, borderLeft: b })} />
      <span style={c({ bottom: 0, right: 0, borderBottom: b, borderRight: b })} />
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────

export type HudDualPreviewProps = {
  leftWidget: HudWidget | null;
  rightWidget: HudWidget | null;
  selectedSide: 'left' | 'right';
  onSelectSide: (side: 'left' | 'right') => void;
};

export function HudDualPreview({
  leftWidget,
  rightWidget,
  selectedSide,
  onSelectSide,
}: HudDualPreviewProps) {
  const [pixels, setPixels] = useState<string>(() => {
    const now = new Date();
    return combinePixels(renderWidget(leftWidget, 'left', now), renderWidget(rightWidget, 'right', now));
  });

  const refresh = useCallback(() => {
    const now = new Date();
    setPixels(combinePixels(renderWidget(leftWidget, 'left', now), renderWidget(rightWidget, 'right', now)));
  }, [leftWidget, rightWidget]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 100);
    return () => clearInterval(id);
  }, [refresh]);

  // Canvas-relative layout constants (must match MatrixPreview internals)
  const CELL = 3;
  const GAP = 2;
  const PITCH = CELL + GAP;
  const MODULE_GAP = 4;
  const halfW = 9 * PITCH - GAP;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <MatrixPreview pixels={pixels} width={18} />

      <SideIndicator active={selectedSide === 'left'} side="left" />
      <SideIndicator active={selectedSide === 'right'} side="right" />

      {/* Left hit region */}
      <button
        type="button"
        aria-label="select left panel"
        aria-pressed={selectedSide === 'left'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: halfW,
          bottom: 0,
          background: 'transparent',
          cursor: 'pointer',
        }}
        onClick={() => onSelectSide('left')}
      />

      {/* Right hit region */}
      <button
        type="button"
        aria-label="select right panel"
        aria-pressed={selectedSide === 'right'}
        style={{
          position: 'absolute',
          top: 0,
          left: halfW + MODULE_GAP,
          right: 0,
          bottom: 0,
          background: 'transparent',
          cursor: 'pointer',
        }}
        onClick={() => onSelectSide('right')}
      />
    </div>
  );
}
