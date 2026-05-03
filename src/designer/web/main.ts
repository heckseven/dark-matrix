import { createStore } from './store.js';
import { mountToolbar } from './toolbar.js';
import { mountGrid } from './grid.js';
import { mountFrameStrip } from './framestrip.js';
import { mountPlayback } from './playback.js';

const store = createStore();
const app = document.getElementById('app')!;
mountToolbar(app, store);
mountGrid(app, store);
mountFrameStrip(app, store);
mountPlayback(app, store);
