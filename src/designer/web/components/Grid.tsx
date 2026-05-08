import { useEffect, useRef } from 'react';
import { useDesignerStore, designerStore } from '../store.js';

const CELL = 20;
const GAP = 1;
const ROWS = 34;
const MODULE_GAP = 8;

function colX(c: number, width: number): number {
  const base = c * (CELL + GAP);
  return width === 18 && c >= 9 ? base + MODULE_GAP : base;
}

export function Grid() {
  const width = useDesignerStore(s => s.width);
  const svgRef = useRef<SVGSVGElement>(null);
  const rectsRef = useRef<SVGRectElement[][]>([]);
  const stateRef = useRef({ painting: false, erasing: false, cols: 0 });

  // Build the SVG grid whenever width changes
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const cols = width;
    stateRef.current.cols = cols;
    const svgW = cols * (CELL + GAP) - GAP + (cols === 18 ? MODULE_GAP : 0);
    const svgH = ROWS * (CELL + GAP) - GAP;
    svg.setAttribute('width', String(svgW));
    svg.setAttribute('height', String(svgH));
    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    svg.innerHTML = '';
    rectsRef.current = [];

    for (let c = 0; c < cols; c++) {
      rectsRef.current[c] = [];
      for (let r = 0; r < ROWS; r++) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(colX(c, cols)));
        rect.setAttribute('y', String(r * (CELL + GAP)));
        rect.setAttribute('width', String(CELL));
        rect.setAttribute('height', String(CELL));
        rect.setAttribute('stroke', '#333');
        rect.setAttribute('stroke-width', '0.5');
        rect.setAttribute('fill', 'rgb(0,0,0)');
        svg.appendChild(rect);
        rectsRef.current[c]![r] = rect;
      }
    }
  }, [width]);

  // Paint pixel values on every store change
  useEffect(() => {
    function paint() {
      const { frames, activeFrameIdx, width: w } = designerStore.getState();
      const frame = frames[activeFrameIdx];
      if (!frame) return;
      const bin = atob(frame.pixels);
      const pixels = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) pixels[i] = bin.charCodeAt(i);
      for (let c = 0; c < w; c++) {
        for (let r = 0; r < ROWS; r++) {
          const v = pixels[c * ROWS + r] ?? 0;
          rectsRef.current[c]?.[r]?.setAttribute('fill', `rgb(${v},${v},${v})`);
        }
      }
    }
    paint();
    return designerStore.subscribe(paint);
  }, []);

  function hitTest(e: MouseEvent): { col: number; row: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const bbox = svg.getBoundingClientRect();
    let x = e.clientX - bbox.left;
    const y = e.clientY - bbox.top;
    const cols = stateRef.current.cols;
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

  function doPaint(e: MouseEvent) {
    const hit = hitTest(e);
    if (!hit) return;
    const { activeFrameIdx, activeColor } = designerStore.getState();
    designerStore.getState().setPixel(activeFrameIdx, hit.col, hit.row, stateRef.current.erasing ? 0 : activeColor);
  }

  return (
    <div className="relative p-2">
      <svg
        ref={svgRef}
        tabIndex={0}
        className="cursor-crosshair outline-none block"
        onMouseDown={e => {
          e.preventDefault();
          stateRef.current.erasing = e.button === 2;
          stateRef.current.painting = true;
          doPaint(e.nativeEvent);
          svgRef.current?.focus();
        }}
        onMouseMove={e => { if (stateRef.current.painting) doPaint(e.nativeEvent); }}
        onMouseUp={() => { stateRef.current.painting = false; stateRef.current.erasing = false; }}
        onMouseLeave={() => { stateRef.current.painting = false; stateRef.current.erasing = false; }}
        onContextMenu={e => e.preventDefault()}
        onKeyDown={e => {
          const ctrl = e.ctrlKey || e.metaKey;
          const { activeFrameIdx } = designerStore.getState();
          if (e.key === 'ArrowLeft') designerStore.getState().setActiveFrame(activeFrameIdx - 1);
          else if (e.key === 'ArrowRight') designerStore.getState().setActiveFrame(activeFrameIdx + 1);
          else if (e.key === 'n' && !ctrl) designerStore.getState().addFrame(activeFrameIdx);
          else if (e.key === 'z' && ctrl && !e.shiftKey) { e.preventDefault(); designerStore.getState().undo(); }
          else if ((e.key === 'y' && ctrl) || (e.key === 'Z' && ctrl && e.shiftKey)) { e.preventDefault(); designerStore.getState().redo(); }
        }}
      />
    </div>
  );
}
