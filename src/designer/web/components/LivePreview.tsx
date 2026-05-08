import { useEffect, useRef } from 'react';
import { designerStore } from '../store.js';
import { createPreviewBridge } from '../preview.js';
import type { PreviewBridge } from '../preview.js';

export function usePreviewBridge() {
  const bridgeRef = useRef<PreviewBridge | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  function sendCurrent() {
    const { frames, activeFrameIdx, mode, width, previewTarget, previewBw } = designerStore.getState();
    const frame = frames[activeFrameIdx];
    if (frame && bridgeRef.current) {
      bridgeRef.current.sendFrame(frame.pixels, previewBw ? 'bw' : mode, width, previewTarget);
    }
  }

  function start() {
    if (bridgeRef.current) return;
    bridgeRef.current = createPreviewBridge(`ws://${location.host}/ws`);
    unsubRef.current = designerStore.subscribe(sendCurrent);
    sendCurrent();
  }

  function stop() {
    bridgeRef.current?.stop();
    bridgeRef.current?.dispose();
    bridgeRef.current = null;
    unsubRef.current?.();
    unsubRef.current = null;
  }

  useEffect(() => () => stop(), []);

  return { start, stop, isActive: () => bridgeRef.current !== null };
}
