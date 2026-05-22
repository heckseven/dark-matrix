import { useEffect, useRef } from 'react';
import { useDeckStore, deckStore } from '../store.js';
import { Button } from './ui/button.js';
import { Text } from './ui/text.js';

export function Playback() {
  const isPlaying = useDeckStore(s => s.isPlaying);
  const frames = useDeckStore(s => s.frames);
  const activeFrameIdx = useDeckStore(s => s.activeFrameIdx);
  const loop = useDeckStore(s => s.loop);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // frames intentionally omitted from deps — effect reads store snapshot inside the timer
  useEffect(() => {
    function scheduleNext() {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      const { isPlaying: playing, frames: f, activeFrameIdx: cur, loop } = deckStore.getState();
      if (!playing) return;
      const delay = f[cur]?.delayMs ?? 100;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const { isPlaying: still, frames: ff, activeFrameIdx: c, loop: l } = deckStore.getState();
        if (!still) return;
        const next = c + 1;
        if (next >= ff.length) {
          if (l) { deckStore.getState().setActiveFrame(0); scheduleNext(); }
          else deckStore.getState().setPlaying(false);
        } else {
          deckStore.getState().setActiveFrame(next);
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
      <Button aria-label="Previous frame" disabled={atStart} onClick={() => { deckStore.getState().setPlaying(false); deckStore.getState().setActiveFrame(activeFrameIdx - 1); }}>⏮</Button>
      <Button aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => deckStore.getState().setPlaying(!isPlaying)}>{isPlaying ? '⏸' : '▶'}</Button>
      <Button aria-label="Next frame" disabled={atEnd} onClick={() => { deckStore.getState().setPlaying(false); deckStore.getState().setActiveFrame(activeFrameIdx + 1); }}>⏭</Button>
      <Text as="span" size="xs" variant="muted" aria-live="polite" aria-atomic="true" className="font-mono min-w-[60px] text-center">
        {activeFrameIdx + 1} / {frames.length}
      </Text>
    </div>
  );
}
