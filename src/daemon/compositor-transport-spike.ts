/**
 * CompositorTransport — throwaway spike for notify-compositing.
 *
 * Wraps SerialTransport and applies pixel-level overlay blending before
 * passing frames to the underlying transport:
 *   - frameBw / liveFrameBw:   unpack → bitwise OR with overlay → repack
 *   - frameGray / liveFrameGray: additive clamp (each pixel clamped to 255) with overlay
 *
 * When overlay is null all methods delegate directly with no extra work.
 */

import { SerialTransport } from '../lib/transport.js';
import type { Frame } from '../lib/frame.js';
import { packBW, FRAME_COLS, FRAME_ROWS, FRAME_SIZE, createFrame } from '../lib/frame.js';

const BITS_PER_BYTE = 8;

/**
 * Unpack 39 BW-packed bytes back into a 306-pixel Frame (0 or 255 per pixel).
 * Bit index i = col + FRAME_COLS * row; Frame storage is col-major.
 */
function unpackBW(packed: Uint8Array): Frame {
  const f = createFrame();
  for (let i = 0; i < FRAME_SIZE; i++) {
    const byteIdx = Math.floor(i / BITS_PER_BYTE);
    const bitIdx  = i % BITS_PER_BYTE;
    if (((packed[byteIdx] ?? 0) >> bitIdx) & 1) {
      const col = i % FRAME_COLS;
      const row = Math.floor(i / FRAME_COLS);
      f[col * FRAME_ROWS + row] = 255;
    }
  }
  return f;
}

function blendBw(packed: Uint8Array, overlayFrame: Frame): Uint8Array {
  const base   = unpackBW(packed);
  const result = createFrame();
  for (let idx = 0; idx < FRAME_SIZE; idx++) {
    result[idx] = ((base[idx] ?? 0) | (overlayFrame[idx] ?? 0)) > 0 ? 255 : 0;
  }
  return packBW(result);
}

function blendGray(frame: Frame, overlayFrame: Frame): Frame {
  const result = createFrame();
  for (let idx = 0; idx < FRAME_SIZE; idx++) {
    result[idx] = Math.min(255, (frame[idx] ?? 0) + (overlayFrame[idx] ?? 0));
  }
  return result;
}

export class CompositorTransport {
  private overlay: [Frame, Frame] | null = null;

  constructor(
    private readonly inner: SerialTransport,
    private readonly leftPath: string,
    private readonly rightPath: string,
  ) {}

  setOverlay(overlay: [Frame, Frame] | null): void {
    this.overlay = overlay;
  }

  private overlayFor(devicePath: string): Frame | null {
    if (!this.overlay) return null;
    return devicePath === this.rightPath ? this.overlay[1] : this.overlay[0];
  }

  async frameBw(packed: Uint8Array, devicePath: string): Promise<void> {
    const ov = this.overlayFor(devicePath);
    if (!ov) return this.inner.frameBw(packed, devicePath);

    const t0 = performance.now();
    const blended = blendBw(packed, ov);
    const blendUs = (performance.now() - t0) * 1000;
    process.stderr.write(`[compositor] blend took ${blendUs.toFixed(1)}μs (bw)\n`);

    return this.inner.frameBw(blended, devicePath);
  }

  async frameGray(frame: Frame, devicePath: string): Promise<void> {
    const ov = this.overlayFor(devicePath);
    if (!ov) return this.inner.frameGray(frame, devicePath);

    const t0 = performance.now();
    const blended = blendGray(frame, ov);
    const blendUs = (performance.now() - t0) * 1000;
    process.stderr.write(`[compositor] blend took ${blendUs.toFixed(1)}μs (gray)\n`);

    return this.inner.frameGray(blended, devicePath);
  }

  async liveFrameBw(packed: Uint8Array, devicePath: string): Promise<void> {
    const ov = this.overlayFor(devicePath);
    if (!ov) return this.inner.liveFrameBw(packed, devicePath);

    const t0 = performance.now();
    const blended = blendBw(packed, ov);
    const blendUs = (performance.now() - t0) * 1000;
    process.stderr.write(`[compositor] blend took ${blendUs.toFixed(1)}μs (bw-live)\n`);

    return this.inner.liveFrameBw(blended, devicePath);
  }

  async liveFrameGray(frame: Frame, devicePath: string): Promise<void> {
    const ov = this.overlayFor(devicePath);
    if (!ov) return this.inner.liveFrameGray(frame, devicePath);

    const t0 = performance.now();
    const blended = blendGray(frame, ov);
    const blendUs = (performance.now() - t0) * 1000;
    process.stderr.write(`[compositor] blend took ${blendUs.toFixed(1)}μs (gray-live)\n`);

    return this.inner.liveFrameGray(blended, devicePath);
  }

  command(devicePath: string, subcommand: string, args: string[]): Promise<void> {
    return this.inner.command(devicePath, subcommand, args);
  }

  brightness(devicePath: string, pct: number): Promise<void> {
    return this.inner.brightness(devicePath, pct);
  }

  release(devicePath: string): Promise<void> {
    return this.inner.release(devicePath);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

/**
 * Build a border frame: pixels at row 0, row 33, col 0, col 8 are lit (255).
 * All interior pixels are 0. Used as the test-overlay border pattern.
 */
export function buildBorderFrame(): [Frame, Frame] {
  function makeBorder(): Frame {
    const f = createFrame();
    for (let col = 0; col < FRAME_COLS; col++) {
      for (let row = 0; row < FRAME_ROWS; row++) {
        const isBorder = row === 0 || row === FRAME_ROWS - 1 || col === 0 || col === FRAME_COLS - 1;
        if (isBorder) f[col * FRAME_ROWS + row] = 255;
      }
    }
    return f;
  }
  return [makeBorder(), makeBorder()];
}
