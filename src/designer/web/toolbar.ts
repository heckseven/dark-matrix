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

  // Color palette swatches
  function makeSwatch(v: number): HTMLButtonElement {
    const swatch = document.createElement('button');
    swatch.className = 'swatch';
    swatch.style.background = `rgb(${v},${v},${v})`;
    swatch.style.width = '20px';
    swatch.style.height = '20px';
    swatch.style.padding = '0';
    swatch.style.border = '1px solid #555';
    swatch.title = `Value ${v}`;
    swatch.addEventListener('click', () => store.setActiveColor(v));
    return swatch;
  }
  const bwSwatches = [0, 255].map(makeSwatch);
  const graySwatches = [51, 102, 153, 204].map(makeSwatch);

  // Color slider
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

  // Grey swatches + slider + active swatch — hidden in BW mode
  const colorPicker = document.createElement('span');
  colorPicker.style.display = 'contents';
  colorPicker.append(...graySwatches, slider, activeSwatch);

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

  // Preview BW toggle
  const previewBwBtn = document.createElement('button');
  previewBwBtn.textContent = 'Preview BW';
  previewBwBtn.title = 'Send frames as BW for faster hardware preview';
  previewBwBtn.addEventListener('click', () => store.setPreviewBw(!store.state.previewBw));

  const sep5 = document.createElement('span');
  sep5.textContent = '|';
  sep5.style.opacity = '0.3';

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
    bwBtn, grayBtn,
    sep2,
    ...bwSwatches, colorPicker,
    sep3,
    undoBtn, redoBtn,
    sep3.cloneNode(true),
    loopLabel,
    sep4,
    ...targetBtns.map(t => t.btn),
    sep4.cloneNode(true),
    previewBwBtn,
    sep5,
    clearBtn, saveBtn,
  );

  container.appendChild(bar);

  function render() {
    const { mode, activeColor, undoStack, redoStack, loop, previewTarget, previewBw } = store.state;

    bwBtn.classList.toggle('active', mode === 'bw');
    grayBtn.classList.toggle('active', mode === 'gray');

    colorPicker.style.display = mode === 'bw' ? 'none' : 'contents';
    slider.value = String(activeColor);

    activeSwatch.style.background = `rgb(${activeColor},${activeColor},${activeColor})`;

    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;

    loopCheck.checked = loop;

    for (const { btn, value } of targetBtns) {
      btn.classList.toggle('active', previewTarget === value);
    }

    previewBwBtn.classList.toggle('active', previewBw);
    previewBwBtn.style.display = mode === 'bw' ? 'none' : '';
  }

  store.subscribe(render);
  render();
}
