import sharp from 'sharp';
import { createFrame } from './frame.js';
import type { Frame } from './frame.js';

export type ImageFit = 'fill' | 'contain' | 'cover';
export type ImageMode = 'bw' | 'gray';

export type ConvertOptions = {
  mode?: ImageMode;  // default 'gray'
  fit?: ImageFit;    // default 'contain'
};

export async function convertImage(imagePath: string, opts?: ConvertOptions): Promise<Frame> {
  const mode = opts?.mode ?? 'gray';
  const fit = opts?.fit ?? 'contain';

  const sharpFit = fit === 'fill' ? 'fill' : fit === 'cover' ? 'cover' : 'contain';

  const raw = await sharp(imagePath)
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
