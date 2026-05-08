import type { DmxFrame } from '../format.js';

export type Frame = DmxFrame;

export type PreviewTarget = 'left' | 'right' | 'both' | 'mirror';

export interface StoreState {
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

export interface Store {
  state: StoreState;
  subscribe(listener: () => void): () => void;
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
}

const MAX_UNDO = 50;

function createBlankFrameData(width: number): Frame {
  const pixels = btoa(String.fromCharCode(...new Uint8Array(width * 34)));
  return { delayMs: 100, pixels };
}

function cloneFrames(frames: Frame[]): Frame[] {
  return frames.map(f => ({ ...f }));
}

function pixelIndex(col: number, row: number): number {
  return col * 34 + row;
}

function framePixels(frame: Frame): Uint8Array {
  const bin = atob(frame.pixels);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function pixelsToBase64(arr: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
  return btoa(bin);
}

export function createStore(): Store {
  const state: StoreState = {
    frames: [createBlankFrameData(9)],
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
  };

  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach(l => l());
  }

  function pushUndo() {
    state.undoStack.push(cloneFrames(state.frames));
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
  }

  const store: Store = {
    state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setPixel(frameIdx, col, row, value) {
      const frame = state.frames[frameIdx];
      if (!frame) return;
      pushUndo();
      const arr = framePixels(frame);
      const idx = pixelIndex(col, row);
      const snapped = state.mode === 'bw' ? (value >= 128 ? 255 : 0) : Math.max(0, Math.min(255, value));
      arr[idx] = snapped;
      state.frames[frameIdx] = { ...frame, pixels: pixelsToBase64(arr) };
      notify();
    },

    addFrame(afterIdx) {
      pushUndo();
      const blank = createBlankFrameData(state.width);
      state.frames.splice(afterIdx + 1, 0, blank);
      state.activeFrameIdx = afterIdx + 1;
      notify();
    },

    removeFrame(idx) {
      if (state.frames.length <= 1) return;
      pushUndo();
      state.frames.splice(idx, 1);
      state.activeFrameIdx = Math.min(state.activeFrameIdx, state.frames.length - 1);
      notify();
    },

    moveFrame(fromIdx, toIdx) {
      if (fromIdx === toIdx) return;
      pushUndo();
      const [frame] = state.frames.splice(fromIdx, 1);
      state.frames.splice(toIdx, 0, frame!);
      if (state.activeFrameIdx === fromIdx) {
        state.activeFrameIdx = toIdx;
      } else if (fromIdx < toIdx && state.activeFrameIdx > fromIdx && state.activeFrameIdx <= toIdx) {
        state.activeFrameIdx--;
      } else if (fromIdx > toIdx && state.activeFrameIdx >= toIdx && state.activeFrameIdx < fromIdx) {
        state.activeFrameIdx++;
      }
      notify();
    },

    setFrameDelay(idx, delayMs) {
      const frame = state.frames[idx];
      if (!frame) return;
      pushUndo();
      state.frames[idx] = { ...frame, delayMs };
      notify();
    },

    setActiveFrame(idx) {
      state.activeFrameIdx = Math.max(0, Math.min(idx, state.frames.length - 1));
      notify();
    },

    undo() {
      if (state.undoStack.length === 0) return;
      state.redoStack.push(cloneFrames(state.frames));
      if (state.redoStack.length > MAX_UNDO) state.redoStack.shift();
      state.frames = state.undoStack.pop()!;
      state.activeFrameIdx = Math.min(state.activeFrameIdx, state.frames.length - 1);
      notify();
    },

    redo() {
      if (state.redoStack.length === 0) return;
      state.undoStack.push(cloneFrames(state.frames));
      if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
      state.frames = state.redoStack.pop()!;
      state.activeFrameIdx = Math.min(state.activeFrameIdx, state.frames.length - 1);
      notify();
    },

    setPlaying(playing) {
      state.isPlaying = playing;
      notify();
    },

    setMode(mode) {
      state.mode = mode;
      notify();
    },

    setWidth(width) {
      if (state.width === width) return;
      pushUndo();
      state.width = width;
      // Resize all frames
      state.frames = state.frames.map(f => {
        const old = framePixels(f);
        const next = new Uint8Array(width * 34);
        const cols = Math.min(old.length / 34, width);
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < 34; r++) {
            next[c * 34 + r] = old[c * 34 + r] ?? 0;
          }
        }
        return { ...f, pixels: pixelsToBase64(next) };
      });
      notify();
    },

    setActiveColor(value) {
      state.activeColor = Math.max(0, Math.min(255, value));
      notify();
    },

    setLoop(loop) {
      state.loop = loop;
      notify();
    },

    setPreviewTarget(target) {
      const newWidth: 9 | 18 = target === 'both' ? 18 : 9;
      if (newWidth !== state.width) {
        pushUndo();
        state.width = newWidth;
        state.frames = state.frames.map(f => {
          const old = framePixels(f);
          const next = new Uint8Array(newWidth * 34);
          const cols = Math.min(old.length / 34, newWidth);
          for (let c = 0; c < cols; c++) {
            for (let r = 0; r < 34; r++) {
              next[c * 34 + r] = old[c * 34 + r] ?? 0;
            }
          }
          return { ...f, pixels: pixelsToBase64(next) };
        });
      }
      state.previewTarget = target;
      notify();
    },

    setPreviewBw(value) {
      state.previewBw = value;
      notify();
    },

    clearFrame(idx) {
      const frame = state.frames[idx];
      if (!frame) return;
      pushUndo();
      state.frames[idx] = { ...frame, pixels: createBlankFrameData(state.width).pixels };
      notify();
    },
  };

  return store;
}
