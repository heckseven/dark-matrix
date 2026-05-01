import { realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createFrame } from './frame.js';
import type { Frame } from './frame.js';

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
