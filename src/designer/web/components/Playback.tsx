import { useEffect, useRef } from 'react';
import { useDesignerStore, designerStore } from '../store.js';

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

  const btn = 'px-2 py-0.5 border border-[hsl(var(--border))] rounded hover:bg-[hsl(var(--accent))] text-sm';

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 border-t border-[hsl(var(--border))]">
      <button className={btn} title="Previous frame" onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(activeFrameIdx - 1); }}>⏮</button>
      <button className={btn} onClick={() => designerStore.getState().setPlaying(!isPlaying)}>{isPlaying ? '⏸' : '▶'}</button>
      <button className={btn} title="Next frame" onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(activeFrameIdx + 1); }}>⏭</button>
      <span className="font-mono text-xs text-[hsl(var(--muted-foreground))] min-w-[60px] text-center">
        {activeFrameIdx + 1} / {frames.length}
      </span>
    </div>
  );
}
