import type { Store } from './store.js';

const THUMB_W = 36;
const THUMB_H = 68;
const ROWS = 34;

function framePixels(frame: { pixels: string }): Uint8Array {
  const bin = atob(frame.pixels);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)!;
  return arr;
}

function renderThumb(canvas: HTMLCanvasElement, frame: { pixels: string }, width: number) {
  const ctx = canvas.getContext('2d')!;
  const pixels = framePixels(frame);
  const scaleX = THUMB_W / width;
  const scaleY = THUMB_H / ROWS;

  ctx.clearRect(0, 0, THUMB_W, THUMB_H);
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = pixels[c * ROWS + r] ?? 0;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(
        Math.round(c * scaleX),
        Math.round(r * scaleY),
        Math.max(1, Math.round(scaleX)),
        Math.max(1, Math.round(scaleY)),
      );
    }
  }
}

export function mountFrameStrip(container: HTMLElement, store: Store): void {
  const strip = document.createElement('div');
  strip.className = 'frame-strip';

  const addBtn = document.createElement('button');
  addBtn.textContent = '+';
  addBtn.title = 'Add frame';
  addBtn.style.alignSelf = 'center';
  addBtn.addEventListener('click', () => store.addFrame(store.state.activeFrameIdx));

  container.appendChild(strip);

  let dragFromIdx: number | null = null;

  function buildStrip() {
    strip.innerHTML = '';
    const { frames, activeFrameIdx, width } = store.state;

    frames.forEach((frame, idx) => {
      const cell = document.createElement('div');
      cell.className = 'frame-cell';
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems = 'center';
      cell.style.gap = '4px';
      cell.style.cursor = 'pointer';
      cell.style.padding = '4px';
      cell.style.border = idx === activeFrameIdx ? '2px solid #0f0' : '2px solid transparent';
      cell.draggable = true;

      const canvas = document.createElement('canvas');
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      canvas.style.imageRendering = 'pixelated';
      renderThumb(canvas, frame, width);

      const delayInput = document.createElement('input');
      delayInput.type = 'number';
      delayInput.min = '0';
      delayInput.step = '10';
      delayInput.value = String(frame.delayMs);
      delayInput.style.width = '50px';
      delayInput.style.background = '#222';
      delayInput.style.color = '#eee';
      delayInput.style.border = '1px solid #444';
      delayInput.style.textAlign = 'center';
      delayInput.style.fontFamily = 'monospace';
      delayInput.addEventListener('change', () => {
        store.setFrameDelay(idx, Math.max(0, Number(delayInput.value)));
      });

      const delRow = document.createElement('div');
      delRow.style.display = 'flex';
      delRow.style.gap = '4px';
      delRow.style.alignItems = 'center';

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete frame';
      deleteBtn.style.padding = '0 4px';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        store.removeFrame(idx);
      });

      delRow.append(delayInput, deleteBtn);

      cell.append(canvas, delRow);

      cell.addEventListener('click', () => store.setActiveFrame(idx));

      cell.addEventListener('dragstart', e => {
        dragFromIdx = idx;
        e.dataTransfer!.effectAllowed = 'move';
      });

      cell.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
      });

      cell.addEventListener('drop', e => {
        e.preventDefault();
        if (dragFromIdx !== null && dragFromIdx !== idx) {
          store.moveFrame(dragFromIdx, idx);
        }
        dragFromIdx = null;
      });

      cell.addEventListener('dragend', () => { dragFromIdx = null; });

      strip.appendChild(cell);
    });

    strip.appendChild(addBtn);
  }

  store.subscribe(buildStrip);
  buildStrip();
}
