import type { Store } from './store.js';

const CELL = 20;
const GAP = 1;
const ROWS = 34;
const MODULE_GAP = 8;

const SVG_NS = 'http://www.w3.org/2000/svg';

function framePixels(frame: { pixels: string }): Uint8Array {
  const bin = atob(frame.pixels);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)!;
  return arr;
}

export function mountGrid(container: HTMLElement, store: Store): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'grid-container';
  wrapper.style.position = 'relative';

  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('tabindex', '0');
  svg.style.cursor = 'crosshair';
  svg.style.outline = 'none';
  svg.style.display = 'block';

  const label = document.createElement('div');
  label.className = 'grid-cursor-label';
  label.style.fontFamily = 'monospace';
  label.style.fontSize = '11px';
  label.style.color = '#888';
  label.style.textAlign = 'center';
  label.textContent = '';

  wrapper.append(svg, label);
  container.appendChild(wrapper);

  let rects: SVGRectElement[][] = [];
  let painting = false;
  let erasing = false;
  let cols = 0;

  function colX(c: number, width: number): number {
    const base = c * (CELL + GAP);
    return width === 18 && c >= 9 ? base + MODULE_GAP : base;
  }

  function buildGrid(width: number) {
    cols = width;
    const svgW = width * (CELL + GAP) - GAP + (width === 18 ? MODULE_GAP : 0);
    const svgH = ROWS * (CELL + GAP) - GAP;
    svg.setAttribute('width', String(svgW));
    svg.setAttribute('height', String(svgH));
    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    svg.innerHTML = '';
    rects = [];

    for (let c = 0; c < width; c++) {
      rects[c] = [];
      for (let r = 0; r < ROWS; r++) {
        const rect = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
        rect.setAttribute('x', String(colX(c, width)));
        rect.setAttribute('y', String(r * (CELL + GAP)));
        rect.setAttribute('width', String(CELL));
        rect.setAttribute('height', String(CELL));
        rect.setAttribute('stroke', '#333');
        rect.setAttribute('stroke-width', '0.5');
        rect.setAttribute('fill', 'rgb(0,0,0)');
        svg.appendChild(rect);
        rects[c]![r] = rect;
      }
    }
  }

  function hitTest(e: MouseEvent): { col: number; row: number } | null {
    const bbox = svg.getBoundingClientRect();
    let x = e.clientX - bbox.left;
    const y = e.clientY - bbox.top;
    if (cols === 18) {
      const gapStart = 9 * (CELL + GAP);
      if (x >= gapStart && x < gapStart + MODULE_GAP) return null;
      if (x >= gapStart + MODULE_GAP) x -= MODULE_GAP;
    }
    const col = Math.floor(x / (CELL + GAP));
    const row = Math.floor(y / (CELL + GAP));
    if (col < 0 || col >= cols || row < 0 || row >= ROWS) return null;
    const cx = x - col * (CELL + GAP);
    const ry = y - row * (CELL + GAP);
    if (cx > CELL || ry > CELL) return null;
    return { col, row };
  }

  function paint(e: MouseEvent) {
    const hit = hitTest(e);
    if (!hit) return;
    const { col, row } = hit;
    const value = erasing ? 0 : store.state.activeColor;
    store.setPixel(store.state.activeFrameIdx, col, row, value);
    label.textContent = `col ${col}  row ${row}`;
  }

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    erasing = e.button === 2;
    painting = true;
    paint(e);
    svg.focus();
  });

  svg.addEventListener('mousemove', (e: MouseEvent) => {
    const hit = hitTest(e);
    if (hit) {
      label.textContent = `col ${hit.col}  row ${hit.row}`;
    }
    if (!painting) return;
    paint(e);
  });

  svg.addEventListener('mouseup', () => { painting = false; erasing = false; });
  svg.addEventListener('mouseleave', () => { painting = false; erasing = false; });
  svg.addEventListener('contextmenu', (e: Event) => e.preventDefault());

  svg.addEventListener('keydown', (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowLeft') {
      store.setActiveFrame(store.state.activeFrameIdx - 1);
    } else if (e.key === 'ArrowRight') {
      store.setActiveFrame(store.state.activeFrameIdx + 1);
    } else if (e.key === 'n' && !ctrl) {
      store.addFrame(store.state.activeFrameIdx);
    } else if (e.key === 'z' && ctrl && !e.shiftKey) {
      e.preventDefault();
      store.undo();
    } else if ((e.key === 'y' && ctrl) || (e.key === 'Z' && ctrl && e.shiftKey)) {
      e.preventDefault();
      store.redo();
    }
  });

  let lastWidth = 0;

  function render() {
    const { frames, activeFrameIdx, width } = store.state;

    if (width !== lastWidth) {
      buildGrid(width);
      lastWidth = width;
    }

    const frame = frames[activeFrameIdx];
    if (!frame) return;
    const pixels = framePixels(frame);

    for (let c = 0; c < width; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = pixels[c * ROWS + r] ?? 0;
        rects[c]![r]!.setAttribute('fill', `rgb(${v},${v},${v})`);
      }
    }
  }

  store.subscribe(render);
  render();
}
