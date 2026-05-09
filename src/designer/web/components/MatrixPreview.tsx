import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils.js';
import { ROWS } from '../store.js';

const MIN_L = 48;
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
    canvas.width = w * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${CANVAS_H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, CANVAS_H);

    for (let c = 0; c < width; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = data[c * ROWS + r] ?? 0;
        const l = pixelLuminance(v);
        if (l === 0) continue;
        ctx.fillStyle = `rgb(${l},${l},${l})`;
        ctx.fillRect(colX(c, wide) + 1, r * PITCH + 1, 1, 1);
      }
    }
  }, [pixels, width, w, wide]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('[image-rendering:pixelated]', className)}
    />
  );
}
