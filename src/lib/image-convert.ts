import { realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createFrame } from './frame.js';
import type { Frame } from './frame.js';
import type { DmxProject } from '../designer/format.js';

export type ImageFit = 'fill' | 'contain' | 'cover';
export type ImageMode = 'bw' | 'gray';

export type ConvertOptions = {
  mode?: ImageMode;  // default 'gray'
  fit?: ImageFit;    // default 'contain'
};

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif']);

export async function convertImage(imagePath: string, opts?: ConvertOptions): Promise<Frame> {
  const resolved = await realpath(imagePath);
  const home = os.homedir();
  if (resolved !== home && !resolved.startsWith(home + '/')) {
    throw new Error(`Image path must be under home directory: ${resolved}`);
  }
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported image format "${ext}". Allowed: png, jpg, gif`);
  }

  const mode = opts?.mode ?? 'gray';
  const fit = opts?.fit ?? 'contain';
  const sharpFit = fit === 'fill' ? 'fill' : fit === 'cover' ? 'cover' : 'contain';

  const raw = await sharp(resolved)
    .resize(9, 34, {
      fit: sharpFit,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .grayscale()
    .raw()
    .toBuffer();

  const frame = createFrame();
  for (let col = 0; col < 9; col++) {
    for (let row = 0; row < 34; row++) {
      const v = raw[col + row * 9] ?? 0;
      frame[col * 34 + row] = mode === 'bw' ? (v >= 128 ? 255 : 0) : v;
    }
  }
  return frame;
}

const GIF_MAX_FRAMES = 240;

export async function convertGifToDmx(buf: Buffer, opts: {
  width: 9 | 18;
  mode: 'bw' | 'gray';
  fit: 'contain' | 'cover' | 'fill';
  brightness: number;
  contrast: number;
}): Promise<DmxProject> {
  const { width, mode, fit, brightness, contrast } = opts;
  const FRAME_H = 34;

  const meta = await sharp(buf, { animated: true }).metadata();
  const totalPages = meta.pages ?? 1;
  const pages = Math.min(totalPages, GIF_MAX_FRAMES);
  const delays: number[] = (meta.delay ?? Array.from({ length: totalPages }, () => 100)).slice(0, pages);

  const stacked = await sharp(buf, { animated: true })
    .resize(width, FRAME_H, { fit, background: { r: 0, g: 0, b: 0 } })
    .grayscale()
    .modulate({ brightness: 1 + brightness })
    .linear(contrast, 0)
    .raw()
    .toBuffer();

  const bytesPerFrame = width * FRAME_H;
  const frames = [];
  for (let i = 0; i < pages; i++) {
    const slice = stacked.subarray(i * bytesPerFrame, (i + 1) * bytesPerFrame);
    const pixels = new Uint8Array(bytesPerFrame);
    for (let col = 0; col < width; col++) {
      for (let row = 0; row < FRAME_H; row++) {
        const v = slice[row * width + col] ?? 0;
        pixels[col * FRAME_H + row] = mode === 'bw' ? (v >= 128 ? 255 : 0) : v;
      }
    }
    frames.push({ delayMs: delays[i] ?? 100, pixels: Buffer.from(pixels).toString('base64') });
  }

  return {
    format: 'dark-matrix',
    version: 1,
    width,
    height: 34,
    mode,
    loop: false,
    frames,
  };
}

// Render a Frame as a unicode half-block string for terminal preview.
// Output: 9 chars wide × 17 lines tall (2 rows per line via ▀▄█).
export function renderPreview(frame: Frame): string {
  const lines: string[] = [];
  for (let r = 0; r < 17; r++) {
    let line = '';
    for (let col = 0; col < 9; col++) {
      const top = (frame[col * 34 + r * 2] ?? 0) >= 128;
      const bot = (frame[col * 34 + r * 2 + 1] ?? 0) >= 128;
      line += top && bot ? '█' : top ? '▀' : bot ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}
