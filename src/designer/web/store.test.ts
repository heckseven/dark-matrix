// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from './store.js';
import type { Store } from './store.js';

function decodePixels(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)!;
  return arr;
}

// column-major: index = col * 34 + row
function pixelAt(b64: string, col: number, row: number): number {
  return decodePixels(b64)[col * 34 + row] ?? 0;
}

describe('Store', () => {
  let store: Store;

  beforeEach(() => {
    store = createStore();
  });

  it('1. initial state', () => {
    const s = store.state;
    expect(s.frames).toHaveLength(1);
    expect(s.width).toBe(9);
    expect(s.mode).toBe('gray');
    expect(s.activeFrameIdx).toBe(0);
    expect(s.activeColor).toBe(255);
  });

  it('2. setPixel sets correct pixel in active frame', () => {
    store.setPixel(0, 3, 10, 128);
    expect(pixelAt(store.state.frames[0]!.pixels, 3, 10)).toBe(128);
  });

  it('3. setPixel in BW mode snaps to 0 or 255', () => {
    store.setMode('bw');
    store.setPixel(0, 0, 0, 100);
    expect(pixelAt(store.state.frames[0]!.pixels, 0, 0)).toBe(0);

    store.setPixel(0, 1, 0, 128);
    expect(pixelAt(store.state.frames[0]!.pixels, 1, 0)).toBe(255);

    store.setPixel(0, 2, 0, 200);
    expect(pixelAt(store.state.frames[0]!.pixels, 2, 0)).toBe(255);

    store.setPixel(0, 3, 0, 0);
    expect(pixelAt(store.state.frames[0]!.pixels, 3, 0)).toBe(0);
  });

  it('4. addFrame appends blank frame and increments activeFrameIdx', () => {
    store.addFrame(0);
    expect(store.state.frames).toHaveLength(2);
    expect(store.state.activeFrameIdx).toBe(1);
    // New frame should be all zeros
    const pixels = decodePixels(store.state.frames[1]!.pixels);
    expect(pixels.every(v => v === 0)).toBe(true);
  });

  it('5. removeFrame removes a frame and refuses if only 1 remains', () => {
    store.addFrame(0);
    expect(store.state.frames).toHaveLength(2);
    store.removeFrame(0);
    expect(store.state.frames).toHaveLength(1);
    // Refuses to remove last frame
    store.removeFrame(0);
    expect(store.state.frames).toHaveLength(1);
  });

  it('6. moveFrame reorders correctly', () => {
    store.addFrame(0); // [0, 1]
    store.addFrame(1); // [0, 1, 2]
    // Tag each frame with a unique pixel value
    store.setPixel(0, 0, 0, 10);
    store.setPixel(1, 0, 0, 20);
    store.setPixel(2, 0, 0, 30);

    store.moveFrame(0, 2); // [1, 2, 0]
    expect(pixelAt(store.state.frames[0]!.pixels, 0, 0)).toBe(20);
    expect(pixelAt(store.state.frames[1]!.pixels, 0, 0)).toBe(30);
    expect(pixelAt(store.state.frames[2]!.pixels, 0, 0)).toBe(10);
  });

  it('7. undo restores previous frames state', () => {
    store.setPixel(0, 0, 0, 99);
    const pixelsBefore = store.state.frames[0]!.pixels;
    store.setPixel(0, 0, 0, 200);
    store.undo();
    expect(store.state.frames[0]!.pixels).toBe(pixelsBefore);
  });

  it('8. redo re-applies undone change', () => {
    store.setPixel(0, 0, 0, 99);
    store.setPixel(0, 0, 0, 200);
    const pixelsAfter = store.state.frames[0]!.pixels;
    store.undo();
    store.redo();
    expect(store.state.frames[0]!.pixels).toBe(pixelsAfter);
  });

  it('9. undo/redo stack depth capped at 50', () => {
    // Push 60 mutations
    for (let i = 0; i < 60; i++) {
      store.setPixel(0, 0, 0, i % 256);
    }
    expect(store.state.undoStack.length).toBe(50);
  });

  it('10. setFrameDelay updates delay for a specific frame', () => {
    store.addFrame(0);
    store.setFrameDelay(1, 500);
    expect(store.state.frames[1]!.delayMs).toBe(500);
    expect(store.state.frames[0]!.delayMs).toBe(100); // unchanged
  });
});
