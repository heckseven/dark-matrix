import type { Store, PreviewTarget } from './store.js';
import { exportProject } from './files.js';

export function mountToolbar(container: HTMLElement, store: Store): void {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  // Mode toggle
  const bwBtn = document.createElement('button');
  bwBtn.textContent = 'BW';
  bwBtn.addEventListener('click', () => store.setMode('bw'));

  const grayBtn = document.createElement('button');
  grayBtn.textContent = 'Gray';
  grayBtn.addEventListener('click', () => store.setMode('gray'));

  // Width toggle
  const w9Btn = document.createElement('button');
  w9Btn.textContent = '9';
  w9Btn.addEventListener('click', () => store.setWidth(9));

  const w18Btn = document.createElement('button');
  w18Btn.textContent = '18';
  w18Btn.addEventListener('click', () => store.setWidth(18));

  // Separator
  const sep1 = document.createElement('span');
  sep1.textContent = '|';
  sep1.style.opacity = '0.3';

  // Color palette swatches
  const PALETTE = [0, 51, 102, 153, 204, 255];
  const swatches: HTMLElement[] = [];
  for (const v of PALETTE) {
    const swatch = document.createElement('button');
    swatch.className = 'swatch';
    swatch.style.background = `rgb(${v},${v},${v})`;
    swatch.style.width = '20px';
    swatch.style.height = '20px';
    swatch.style.padding = '0';
    swatch.style.border = '1px solid #555';
    swatch.title = `Value ${v}`;
    swatch.addEventListener('click', () => store.setActiveColor(v));
    swatches.push(swatch);
  }

  // Color slider (hidden in BW mode)
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '255';
  slider.addEventListener('input', () => store.setActiveColor(Number(slider.value)));

  // Active color swatch
  const activeSwatch = document.createElement('div');
  activeSwatch.className = 'active-swatch';
  activeSwatch.style.width = '24px';
  activeSwatch.style.height = '24px';
  activeSwatch.style.border = '2px solid #0f0';
  activeSwatch.style.display = 'inline-block';

  const sep2 = document.createElement('span');
  sep2.textContent = '|';
  sep2.style.opacity = '0.3';

  // Undo/redo
  const undoBtn = document.createElement('button');
  undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', () => store.undo());

  const redoBtn = document.createElement('button');
  redoBtn.textContent = 'Redo';
  redoBtn.addEventListener('click', () => store.redo());

  const sep3 = document.createElement('span');
  sep3.textContent = '|';
  sep3.style.opacity = '0.3';

  // Loop toggle
  const loopLabel = document.createElement('label');
  loopLabel.style.display = 'flex';
  loopLabel.style.alignItems = 'center';
  loopLabel.style.gap = '4px';
  const loopCheck = document.createElement('input');
  loopCheck.type = 'checkbox';
  loopCheck.addEventListener('change', () => store.setLoop(loopCheck.checked));
  loopLabel.append(loopCheck, 'Loop');

  // Preview target
  const TARGET_OPTIONS: Array<{ label: string; value: PreviewTarget }> = [
    { label: 'L', value: 'left' },
    { label: 'R', value: 'right' },
    { label: 'Both', value: 'both' },
    { label: 'Mirror', value: 'mirror' },
  ];
  const targetBtns = TARGET_OPTIONS.map(({ label, value }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = `Preview target: ${value}`;
    btn.addEventListener('click', () => store.setPreviewTarget(value));
    return { btn, value };
  });

  const sep4 = document.createElement('span');
  sep4.textContent = '|';
  sep4.style.opacity = '0.3';

  // Clear + Save
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.title = 'Clear active frame';
  clearBtn.addEventListener('click', () => store.clearFrame(store.state.activeFrameIdx));

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.title = 'Download .dmx.json';
  saveBtn.addEventListener('click', () => void exportProject(store));

  bar.append(
    bwBtn, grayBtn, sep1,
    w9Btn, w18Btn,
    sep2,
    ...swatches, slider, activeSwatch,
    sep3,
    undoBtn, redoBtn,
    sep3.cloneNode(true),
    loopLabel,
    sep4,
    ...targetBtns.map(t => t.btn),
    sep4.cloneNode(true),
    clearBtn, saveBtn,
  );

  container.appendChild(bar);

  function render() {
    const { mode, width, activeColor, undoStack, redoStack, loop, previewTarget } = store.state;

    bwBtn.classList.toggle('active', mode === 'bw');
    grayBtn.classList.toggle('active', mode === 'gray');
    w9Btn.classList.toggle('active', width === 9);
    w18Btn.classList.toggle('active', width === 18);

    slider.style.display = mode === 'bw' ? 'none' : '';
    slider.value = String(activeColor);

    activeSwatch.style.background = `rgb(${activeColor},${activeColor},${activeColor})`;

    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;

    loopCheck.checked = loop;

    for (const { btn, value } of targetBtns) {
      btn.classList.toggle('active', previewTarget === value);
    }
  }

  store.subscribe(render);
  render();
}
