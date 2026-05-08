import { useEffect, useRef } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import { Button } from './ui/button.js';

export function Playback() {
  const isPlaying = useDesignerStore(s => s.isPlaying);
  const frames = useDesignerStore(s => s.frames);
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [isPlaying, activeFrameIdx]);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 border-t border-border">
      <Button aria-label="Previous frame" onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(activeFrameIdx - 1); }}>⏮</Button>
      <Button aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => designerStore.getState().setPlaying(!isPlaying)}>{isPlaying ? '⏸' : '▶'}</Button>
      <Button aria-label="Next frame" onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(activeFrameIdx + 1); }}>⏭</Button>
      <span className="font-mono text-xs text-muted-foreground min-w-[60px] text-center">
        {activeFrameIdx + 1} / {frames.length}
      </span>
    </div>
  );
}
