import type { Store } from './store.js';

export function mountPlayback(container: HTMLElement, store: Store): void {
  const row = document.createElement('div');
  row.className = 'playback';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '⏮';
  prevBtn.title = 'Previous frame';
  prevBtn.addEventListener('click', () => {
    store.setPlaying(false);
    store.setActiveFrame(store.state.activeFrameIdx - 1);
  });

  const playBtn = document.createElement('button');
  playBtn.textContent = '▶';
  playBtn.addEventListener('click', () => store.setPlaying(!store.state.isPlaying));

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '⏭';
  nextBtn.title = 'Next frame';
  nextBtn.addEventListener('click', () => {
    store.setPlaying(false);
    store.setActiveFrame(store.state.activeFrameIdx + 1);
  });

  const counter = document.createElement('span');
  counter.style.fontFamily = 'monospace';
  counter.style.minWidth = '60px';
  counter.style.textAlign = 'center';

  row.append(prevBtn, playBtn, nextBtn, counter);
  container.appendChild(row);

  let timerId: ReturnType<typeof setTimeout> | null = null;

  function scheduleNext() {
    if (timerId !== null) clearTimeout(timerId);
    timerId = null;
    const { isPlaying, frames, activeFrameIdx, loop } = store.state;
    if (!isPlaying) return;

    const frame = frames[activeFrameIdx];
    const delay = frame ? frame.delayMs : 100;

    timerId = setTimeout(() => {
      timerId = null;
      const { isPlaying: stillPlaying, frames: f, activeFrameIdx: cur, loop: l } = store.state;
      if (!stillPlaying) return;

      const next = cur + 1;
      if (next >= f.length) {
        if (l) {
          store.setActiveFrame(0);
          scheduleNext();
        } else {
          store.setPlaying(false);
        }
      } else {
        store.setActiveFrame(next);
        scheduleNext();
      }
    }, delay);
  }

  function render() {
    const { isPlaying, frames, activeFrameIdx } = store.state;

    playBtn.textContent = isPlaying ? '⏸' : '▶';
    counter.textContent = `${activeFrameIdx + 1} / ${frames.length}`;

    if (isPlaying) {
      if (timerId === null) scheduleNext();
    } else {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }
  }

  store.subscribe(render);
  render();
}
