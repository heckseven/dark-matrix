// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createDesignerStore } from './store.js';
import type { StoreApi } from 'zustand';
import type { DesignerStore } from './store.js';

function decodePixels(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)!;
  return arr;
}

function pixelAt(b64: string, col: number, row: number): number {
  return decodePixels(b64)[col * 34 + row] ?? 0;
}

describe('Store', () => {
  let store: StoreApi<DesignerStore>;

  beforeEach(() => {
    store = createDesignerStore();
  });

  it('1. initial state', () => {
    const s = store.getState();
    expect(s.frames).toHaveLength(1);
    expect(s.width).toBe(9);
    expect(s.mode).toBe('bw');
    expect(s.activeFrameIdx).toBe(0);
    expect(s.activeColor).toBe(255);
  });

  it('2. setPixel sets correct pixel in active frame', () => {
    store.getState().setMode('gray');
    store.getState().setPixel(0, 3, 10, 128);
    expect(pixelAt(store.getState().frames[0]!.pixels, 3, 10)).toBe(128);
  });

  it('3. setPixel in BW mode snaps to 0 or 255', () => {
    store.getState().setMode('bw');
    store.getState().setPixel(0, 0, 0, 100);
    expect(pixelAt(store.getState().frames[0]!.pixels, 0, 0)).toBe(0);
    store.getState().setPixel(0, 1, 0, 128);
    expect(pixelAt(store.getState().frames[0]!.pixels, 1, 0)).toBe(255);
    store.getState().setPixel(0, 2, 0, 200);
    expect(pixelAt(store.getState().frames[0]!.pixels, 2, 0)).toBe(255);
    store.getState().setPixel(0, 3, 0, 0);
    expect(pixelAt(store.getState().frames[0]!.pixels, 3, 0)).toBe(0);
  });

  it('4. addFrame appends blank frame and increments activeFrameIdx', () => {
    store.getState().addFrame(0);
    expect(store.getState().frames).toHaveLength(2);
    expect(store.getState().activeFrameIdx).toBe(1);
    const pixels = decodePixels(store.getState().frames[1]!.pixels);
    expect(pixels.every(v => v === 0)).toBe(true);
  });

  it('5. removeFrame removes a frame and refuses if only 1 remains', () => {
    store.getState().addFrame(0);
    expect(store.getState().frames).toHaveLength(2);
    store.getState().removeFrame(0);
    expect(store.getState().frames).toHaveLength(1);
    store.getState().removeFrame(0);
    expect(store.getState().frames).toHaveLength(1);
  });

  it('6. moveFrame reorders correctly', () => {
    store.getState().setMode('gray');
    store.getState().addFrame(0);
    store.getState().addFrame(1);
    store.getState().setPixel(0, 0, 0, 10);
    store.getState().setPixel(1, 0, 0, 20);
    store.getState().setPixel(2, 0, 0, 30);
    store.getState().moveFrame(0, 2);
    expect(pixelAt(store.getState().frames[0]!.pixels, 0, 0)).toBe(20);
    expect(pixelAt(store.getState().frames[1]!.pixels, 0, 0)).toBe(30);
    expect(pixelAt(store.getState().frames[2]!.pixels, 0, 0)).toBe(10);
  });

  it('7. undo restores previous frames state', () => {
    store.getState().setPixel(0, 0, 0, 99);
    const pixelsBefore = store.getState().frames[0]!.pixels;
    store.getState().setPixel(0, 0, 0, 200);
    store.getState().undo();
    expect(store.getState().frames[0]!.pixels).toBe(pixelsBefore);
  });

  it('8. redo re-applies undone change', () => {
    store.getState().setPixel(0, 0, 0, 99);
    store.getState().setPixel(0, 0, 0, 200);
    const pixelsAfter = store.getState().frames[0]!.pixels;
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().frames[0]!.pixels).toBe(pixelsAfter);
  });

  it('9. undo/redo stack depth capped at 50', () => {
    for (let i = 0; i < 60; i++) store.getState().setPixel(0, 0, 0, i % 256);
    expect(store.getState().undoStack.length).toBe(50);
  });

  it('10. setFrameDelay updates delay for a specific frame', () => {
    store.getState().addFrame(0);
    store.getState().setFrameDelay(1, 500);
    expect(store.getState().frames[1]!.delayMs).toBe(500);
    expect(store.getState().frames[0]!.delayMs).toBe(100);
  });

  it('11. initial activeMode is null, setActiveMode updates it', () => {
    expect(store.getState().activeMode).toBe(null);
    store.getState().setActiveMode('hud');
    expect(store.getState().activeMode).toBe('hud');
    store.getState().setActiveMode('games');
    expect(store.getState().activeMode).toBe('games');
  });

  it('12. initial libraryPath is null, setLibraryPath updates and clears it', () => {
    expect(store.getState().libraryPath).toBeNull();
    store.getState().setLibraryPath('my_animation');
    expect(store.getState().libraryPath).toBe('my_animation');
    store.getState().setLibraryPath(null);
    expect(store.getState().libraryPath).toBeNull();
  });
});
