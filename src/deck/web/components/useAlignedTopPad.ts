import { useState, useEffect } from 'react';
import type { DependencyList } from 'react';

/**
 * Measures the pixel distance from the center panel's top edge to the preview
 * component's inner content so a side-column's first MatrixItem bracket lines
 * up with the preview's corner brackets.
 *
 * Pass extraDeps whenever conditional content (e.g. a canvas that mounts on
 * item selection) should trigger re-measurement beyond a topPad change.
 */
export function useAlignedTopPad(
  mainRef:    { current: Element | null },
  previewRef: { current: Element | null },
  topPad:     number,
  offset:     number,
  extraDeps:  DependencyList = [],
): number {
  const [pad, setPad] = useState(0);

  useEffect(() => {
    const update = () => {
      const main    = mainRef.current;
      const preview = previewRef.current;
      if (!main || !preview) return;
      const mainRect    = main.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      setPad(Math.max(0, previewRect.top - mainRect.top - topPad + offset));
    };
    update();
    const ro = new ResizeObserver(update);
    if (mainRef.current)    ro.observe(mainRef.current);
    if (previewRef.current) ro.observe(previewRef.current);
    return () => ro.disconnect();
    // extraDeps intentionally spread — triggers re-measurement when conditional
    // content (canvas, inspector) mounts or unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topPad, offset, ...extraDeps]);

  return pad;
}
