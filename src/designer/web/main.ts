import { createStore } from './store.js';
import { mountToolbar } from './toolbar.js';
import { mountGrid } from './grid.js';
import { mountFrameStrip } from './framestrip.js';
import { mountPlayback } from './playback.js';
import { createPreviewBridge } from './preview.js';
import type { PreviewBridge } from './preview.js';

const store = createStore();
const app = document.getElementById('app')!;
mountToolbar(app, store);

// Live preview toggle
const previewRow = document.createElement('div');
previewRow.className = 'toolbar';
const previewBtn = document.createElement('button');
previewBtn.textContent = 'Live Preview: OFF';
previewRow.appendChild(previewBtn);
app.appendChild(previewRow);

let bridge: PreviewBridge | null = null;
let unsub: (() => void) | null = null;

previewBtn.addEventListener('click', () => {
  if (bridge) {
    bridge.stop();
    bridge.dispose();
    bridge = null;
    unsub?.();
    unsub = null;
    previewBtn.textContent = 'Live Preview: OFF';
    previewBtn.classList.remove('active');
  } else {
    bridge = createPreviewBridge(`ws://${location.host}/ws`);
    unsub = store.subscribe(() => {
      const { frames, activeFrameIdx, mode, width } = store.state;
      const frame = frames[activeFrameIdx];
      if (frame && bridge) bridge.sendFrame(frame.pixels, mode, width);
    });
    previewBtn.textContent = 'Live Preview: ON';
    previewBtn.classList.add('active');
  }
});

mountGrid(app, store);
mountFrameStrip(app, store);
mountPlayback(app, store);
