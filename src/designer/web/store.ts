import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';
import type { DmxFrame } from '../format.js';

export type Frame = DmxFrame;
export type PreviewTarget = 'left' | 'right' | 'both' | 'mirror';

export interface DesignerState {
  frames: Frame[];
  activeFrameIdx: number;
  width: 9 | 18;
  mode: 'bw' | 'gray';
  loop: boolean;
  activeColor: number;
  isPlaying: boolean;
  previewTarget: PreviewTarget;
  previewBw: boolean;
  undoStack: Frame[][];
  redoStack: Frame[][];
}

export interface DesignerActions {
  setPixel(frameIdx: number, col: number, row: number, value: number): void;
  addFrame(afterIdx: number): void;
  removeFrame(idx: number): void;
  moveFrame(fromIdx: number, toIdx: number): void;
  setFrameDelay(idx: number, delayMs: number): void;
  setActiveFrame(idx: number): void;
  undo(): void;
  redo(): void;
  setPlaying(playing: boolean): void;
  setMode(mode: 'bw' | 'gray'): void;
  setWidth(width: 9 | 18): void;
  setActiveColor(value: number): void;
  setLoop(loop: boolean): void;
  setPreviewTarget(target: PreviewTarget): void;
  setPreviewBw(value: boolean): void;
  clearFrame(idx: number): void;
  loadProject(project: unknown): void;
}

export type DesignerStore = DesignerState & DesignerActions;

// Keep legacy alias for files that still reference StoreState/Store
export type StoreState = DesignerState;
export type Store = { state: DesignerState; subscribe: (cb: () => void) => () => void } & DesignerActions;

const MAX_UNDO = 50;
const ROWS = 34;

function blank(width: number): Frame {
  return { delayMs: 100, pixels: btoa(String.fromCharCode(...new Uint8Array(width * ROWS))) };
}

function cloneFrames(frames: Frame[]): Frame[] {
  return frames.map(f => ({ ...f }));
}

function decode(frame: Frame): Uint8Array {
  const bin = atob(frame.pixels);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function encode(arr: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
  return btoa(bin);
}

function resize(frames: Frame[], w: 9 | 18): Frame[] {
  return frames.map(f => {
    const old = decode(f);
    const next = new Uint8Array(w * ROWS);
    const cols = Math.min(old.length / ROWS, w);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < ROWS; r++) next[c * ROWS + r] = old[c * ROWS + r] ?? 0;
    }
    return { ...f, pixels: encode(next) };
  });
}

function pushUndo(frames: Frame[], stack: Frame[][]): Frame[][] {
  const next = [...stack, cloneFrames(frames)];
  if (next.length > MAX_UNDO) next.shift();
  return next;
}

export function createDesignerStore() {
  return createStore<DesignerStore>((set, get) => ({
    frames: [blank(9)],
    activeFrameIdx: 0,
    width: 9,
    mode: 'gray',
    loop: true,
    activeColor: 255,
    isPlaying: false,
    previewTarget: 'left',
    previewBw: false,
    undoStack: [],
    redoStack: [],

    setPixel(frameIdx, col, row, value) {
      const { frames, mode, undoStack } = get();
      const frame = frames[frameIdx];
      if (!frame) return;
      const arr = decode(frame);
      arr[col * ROWS + row] = mode === 'bw' ? (value >= 128 ? 255 : 0) : Math.max(0, Math.min(255, value));
      const next = [...frames];
      next[frameIdx] = { ...frame, pixels: encode(arr) };
      set({ frames: next, undoStack: pushUndo(frames, undoStack), redoStack: [] });
    },

    addFrame(afterIdx) {
      const { frames, width, undoStack } = get();
      const next = [...frames];
      next.splice(afterIdx + 1, 0, blank(width));
      set({ frames: next, activeFrameIdx: afterIdx + 1, undoStack: pushUndo(frames, undoStack), redoStack: [] });
    },

    removeFrame(idx) {
      const { frames, activeFrameIdx, undoStack } = get();
      if (frames.length <= 1) return;
      const next = [...frames];
      next.splice(idx, 1);
      set({ frames: next, activeFrameIdx: Math.min(activeFrameIdx, next.length - 1), undoStack: pushUndo(frames, undoStack), redoStack: [] });
    },

    moveFrame(fromIdx, toIdx) {
      if (fromIdx === toIdx) return;
      const { frames, activeFrameIdx, undoStack } = get();
      const next = [...frames];
      const [f] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, f!);
      let ai = activeFrameIdx;
      if (ai === fromIdx) ai = toIdx;
      else if (fromIdx < toIdx && ai > fromIdx && ai <= toIdx) ai--;
      else if (fromIdx > toIdx && ai >= toIdx && ai < fromIdx) ai++;
      set({ frames: next, activeFrameIdx: ai, undoStack: pushUndo(frames, undoStack), redoStack: [] });
    },

    setFrameDelay(idx, delayMs) {
      const { frames, undoStack } = get();
      const frame = frames[idx];
      if (!frame) return;
      const next = [...frames];
      next[idx] = { ...frame, delayMs };
      set({ frames: next, undoStack: pushUndo(frames, undoStack), redoStack: [] });
    },

    setActiveFrame(idx) {
      const { frames } = get();
      set({ activeFrameIdx: Math.max(0, Math.min(idx, frames.length - 1)) });
    },

    undo() {
      const { undoStack, frames, activeFrameIdx, redoStack } = get();
      if (undoStack.length === 0) return;
      const prev = [...undoStack];
      const restored = prev.pop()!;
      set({ frames: restored, activeFrameIdx: Math.min(activeFrameIdx, restored.length - 1), undoStack: prev, redoStack: pushUndo(frames, redoStack) });
    },

    redo() {
      const { redoStack, frames, activeFrameIdx, undoStack } = get();
      if (redoStack.length === 0) return;
      const next = [...redoStack];
      const restored = next.pop()!;
      set({ frames: restored, activeFrameIdx: Math.min(activeFrameIdx, restored.length - 1), undoStack: pushUndo(frames, undoStack), redoStack: next });
    },

    setPlaying(playing) { set({ isPlaying: playing }); },
    setMode(mode) { set({ mode }); },

    setWidth(width) {
      const { frames, width: cur, undoStack } = get();
      if (cur === width) return;
      set({ width, frames: resize(frames, width), undoStack: pushUndo(frames, undoStack), redoStack: [] });
    },

    setActiveColor(value) { set({ activeColor: Math.max(0, Math.min(255, value)) }); },
    setLoop(loop) { set({ loop }); },

    setPreviewTarget(target) {
      const newWidth: 9 | 18 = target === 'both' ? 18 : 9;
      const { frames, width, undoStack } = get();
      if (newWidth !== width) {
        set({ previewTarget: target, width: newWidth, frames: resize(frames, newWidth), undoStack: pushUndo(frames, undoStack), redoStack: [] });
      } else {
        set({ previewTarget: target });
      }
    },

    setPreviewBw(value) { set({ previewBw: value }); },

    clearFrame(idx) {
      const { frames, width, undoStack } = get();
      const frame = frames[idx];
      if (!frame) return;
      const next = [...frames];
      next[idx] = { ...frame, pixels: blank(width).pixels };
      set({ frames: next, undoStack: pushUndo(frames, undoStack), redoStack: [] });
    },

    loadProject(project) {
      const p = project as { frames?: Frame[]; width?: 9 | 18; mode?: 'bw' | 'gray'; loop?: boolean };
      if (!p?.frames?.length) return;
      set({ frames: p.frames, width: p.width ?? 9, mode: p.mode ?? 'gray', loop: p.loop ?? true, activeFrameIdx: 0, undoStack: [], redoStack: [] });
    },
  }));
}

// Singleton for the running app
const _store = createDesignerStore();

export const useDesignerStore = <T>(selector: (s: DesignerStore) => T): T =>
  useStore(_store, selector);

// Expose vanilla store for non-React consumers (preview bridge, etc.)
export const designerStore = _store;
