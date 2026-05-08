import { useEffect, useRef } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import { Button } from './ui/button.js';
import { Text } from './ui/text.js';

export function Playback() {
  const isPlaying = useDesignerStore(s => s.isPlaying);
  const frames = useDesignerStore(s => s.frames);
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);
  const loop = useDesignerStore(s => s.loop);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // frames intentionally omitted from deps — effect reads store snapshot inside the timer
  useEffect(() => {
    function scheduleNext() {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      const { isPlaying: playing, frames: f, activeFrameIdx: cur, loop } = designerStore.getState();
      if (!playing) return;
      const delay = f[cur]?.delayMs ?? 100;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const { isPlaying: still, frames: ff, activeFrameIdx: c, loop: l } = designerStore.getState();
        if (!still) return;
        const next = c + 1;
        if (next >= ff.length) {
          if (l) { designerStore.getState().setActiveFrame(0); scheduleNext(); }
          else designerStore.getState().setPlaying(false);
        } else {
          designerStore.getState().setActiveFrame(next);
          scheduleNext();
        }
      }, delay);
    }

    if (isPlaying) {
      if (timerRef.current === null) scheduleNext();
    } else {
      if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
  }, [isPlaying, activeFrameIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const atStart = activeFrameIdx === 0;
  const atEnd = !loop && activeFrameIdx === frames.length - 1;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 border-t border-border">
      <Button aria-label="Previous frame" disabled={atStart} onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(activeFrameIdx - 1); }}>⏮</Button>
      <Button aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => designerStore.getState().setPlaying(!isPlaying)}>{isPlaying ? '⏸' : '▶'}</Button>
      <Button aria-label="Next frame" disabled={atEnd} onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(activeFrameIdx + 1); }}>⏭</Button>
      <Text as="span" size="xs" variant="muted" aria-live="polite" aria-atomic="true" className="font-mono min-w-[60px] text-center">
        {activeFrameIdx + 1} / {frames.length}
      </Text>
    </div>
  );
}
