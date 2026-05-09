import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils.js';
import { ROWS } from '../store.js';

const MIN_L = 48;

function pixelLuminance(v: number): number {
  if (v === 0) return 0;
  return Math.round(MIN_L + (v / 255) * (255 - MIN_L));
}

export interface MatrixPreviewProps {
  /** Base64-encoded column-major pixel data (index: col * ROWS + row). */
  pixels: string;
  /** Matrix width — 9 or 18. */
  width: 9 | 18;
  /**
   * Diameter of each LED dot in CSS px. A fixed 1px gap separates adjacent dots.
   * Canvas dimensions are derived: width × (cellSize + 1) by ROWS × (cellSize + 1).
   * Default: 2 → 27 × 102 px for a 9-wide matrix.
   */
  cellSize?: number;
  className?: string;
}

export function MatrixPreview({
  pixels,
  width,
  cellSize = 2,
  className,
}: MatrixPreviewProps) {
  const pitch = cellSize + 1;
  const w = width * pitch;
  const h = ROWS * pitch;
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
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    for (let c = 0; c < width; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = data[c * ROWS + r] ?? 0;
        const l = pixelLuminance(v);
        if (l === 0) continue;
        ctx.fillStyle = `rgb(${l},${l},${l})`;
        ctx.fillRect(c * pitch, r * pitch, cellSize, cellSize);
      }
    }
  }, [pixels, width, cellSize, w, h]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('[image-rendering:pixelated]', className)}
    />
  );
}
