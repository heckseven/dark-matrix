import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils.js';
import { ROWS, useDeckStore } from '../store.js';

const MIN_L = 48;

function readThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    bg:      cs.getPropertyValue('--color-background').trim() || '#000000',
    primary: cs.getPropertyValue('--color-primary').trim()    || '#0DC45C',
  };
}

function tintPixel(primary: string, l: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(primary)) return `rgb(${l},${l},${l})`;
  const r = parseInt(primary.slice(1, 3), 16);
  const g = parseInt(primary.slice(3, 5), 16);
  const b = parseInt(primary.slice(5, 7), 16);
  const s = l / 255;
  return `rgb(${Math.round(r * s)},${Math.round(g * s)},${Math.round(b * s)})`;
}
const CELL = 3;
const GAP = 2;
const PITCH = CELL + GAP; // 5px per cell
const MODULE_GAP = 4;     // gap between the two 9-column halves (18-wide only)

function pixelLuminance(v: number): number {
  if (v === 0) return 0;
  return Math.round(MIN_L + (v / 255) * (255 - MIN_L));
}

function colX(c: number, wide: boolean): number {
  return c * PITCH + (wide && c >= 9 ? MODULE_GAP : 0);
}

function canvasW(width: 9 | 18): number {
  return width * PITCH - GAP + (width === 18 ? MODULE_GAP : 0);
}

const CANVAS_H = ROWS * PITCH - GAP;

export interface MatrixPreviewProps {
  /** Base64-encoded column-major pixel data (index: col * ROWS + row). */
  pixels: string;
  /** Matrix width — 9 or 18. */
  width: 9 | 18;
  className?: string;
}

export function MatrixPreview({ pixels, width, className }: MatrixPreviewProps) {
  const w = canvasW(width);
  const wide = width === 18;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appearance = useDeckStore(s => s.configData?.appearance);

  // Only resize the canvas when dimensions change. Setting canvas.width on every
  // paint (even to the same value) resets the pixel buffer and can trigger layout
  // reflow, which interferes with range inputs in the same layout context.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${CANVAS_H}px`;
  }, [w]);

  // Redraw pixels without touching canvas dimensions.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bin: string;
    try { bin = atob(pixels); } catch { return; }
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);

    const dpr = window.devicePixelRatio ?? 1;
    const physW = Math.round(w * dpr);
    const physH = Math.round(CANVAS_H * dpr);

    const { bg, primary } = readThemeColors();

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, physW, physH);

    // Dot is Math.round(dpr) physical pixels — always an integer, always crisp.
    // Position snapped to nearest physical pixel, centered in the 3×3 CSS cell.
    const dot = Math.max(1, Math.round(dpr));

    for (let c = 0; c < width; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = data[c * ROWS + r] ?? 0;
        const l = pixelLuminance(v);
        if (l === 0) continue;
        ctx.fillStyle = tintPixel(primary, l);
        const px = Math.round((colX(c, wide) + 1.5) * dpr) - Math.floor(dot / 2);
        const py = Math.round((r * PITCH + 1.5) * dpr) - Math.floor(dot / 2);
        ctx.fillRect(px, py, dot, dot);
      }
    }
  }, [pixels, width, w, wide, appearance]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('[image-rendering:pixelated]', className)}
    />
  );
}
