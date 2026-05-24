import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand/react';
import type { DmxFrame } from '../format.js';
import { MODES, type AppMode } from './app-modes.js';
import type { AudioStyle } from '../../animations/audio-renderers.js';
import type { ClockFace } from '../../animations/clock-renderers.js';
import type { DataStyle } from '../../animations/data-renderers.js';
import type { HudPresetClient, HudWidget, HudTrigger } from './types/hud-preset.js';
import type { BiomePreset } from './types/life-types.js';
import type { Config } from './types/config-types.js';
import type { AssetMeta } from '../../lib/asset-meta.js';

export type Frame = DmxFrame;
export type PreviewTarget = 'left' | 'right' | 'both' | 'mirror';
export type AudioSource = 'monitor' | 'mic';

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export type { AppMode };
export type { AudioStyle };
export type { ClockFace };
export type { DataStyle };
export type { HudPresetClient, HudWidget, HudTrigger };

export interface DeckState {
  frames: Frame[];
  activeFrameIdx: number;
  width: 9 | 18;
  mode: 'bw' | 'gray';
  loop: boolean;
  activeColor: number;
  isPlaying: boolean;
  previewTarget: PreviewTarget;
  previewBw: boolean;
  zoom: number;
  undoStack: Frame[][];
  redoStack: Frame[][];
  strokeSnapshot: Frame[] | null;
  projectTitle: string;
  activeMode: AppMode | null;
  audioStyle: AudioStyle;
  audioSource: AudioSource;
  micSensitivity: number;
  hudLeftFace: ClockFace;
  hudRightFace: ClockFace;
  hudLeftWidget: 'clock' | 'data' | 'heatmap' | 'audio';
  hudRightWidget: 'clock' | 'data' | 'heatmap' | 'audio';
  hudLeftDataStyle: DataStyle;
  hudRightDataStyle: DataStyle;
  libraryPath: string | null;
  recentFiles: string[];
  hudPresets: HudPresetClient[];
  activePresetName: string | null;
  selectedPresetName: string | null;
  hudSelectedSide: 'left' | 'right';
  configData: Config | null;
  configDirty: boolean;
  assetList: AssetMeta[] | null;
  biomePresets: BiomePreset[];
  selectedBiomeName: string | null;
  lifeIsPlaying: boolean;
  lifeGeneration: number;
  lifeStepForwardCount: number;
  lifeStepBackCount: number;
  lifeStepCount: number;
}

export interface DeckActions {
  setPixel(frameIdx: number, col: number, row: number, value: number): void;
  beginStroke(): void;
  commitStroke(): void;
  addFrame(afterIdx: number): void;
  removeFrame(idx: number): void;
  moveFrame(fromIdx: number, toIdx: number): void;
  cloneFrame(idx: number): void;
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
  setZoom(zoom: number): void;
  floodFill(frameIdx: number, col: number, row: number, color: number): void;
  clearFrame(idx: number): void;
  loadProject(project: unknown): void;
  setProjectTitle(title: string): void;
  setActiveMode(mode: AppMode | null): void;
  setAudioStyle(style: AudioStyle): void;
  setAudioSource(source: AudioSource): void;
  setMicSensitivity(value: number): void;
  setHudLeftFace(face: ClockFace): void;
  setHudRightFace(face: ClockFace): void;
  setHudLeftWidget(widget: 'clock' | 'data' | 'heatmap' | 'audio', dataStyle?: DataStyle): void;
  setHudRightWidget(widget: 'clock' | 'data' | 'heatmap' | 'audio', dataStyle?: DataStyle): void;
  setLibraryPath(path: string | null): void;
  addRecentFile(name: string): void;
  loadPresets(presets: HudPresetClient[], activeName: string | null): void;
  selectPreset(name: string | null): void;
  selectSide(side: 'left' | 'right'): void;
  createPreset(preset: HudPresetClient): void;
  deletePreset(name: string): void;
  renamePreset(oldName: string, newName: string): void;
  updatePresetWidget(presetName: string, side: 'left' | 'right', widget: HudWidget): void;
  updatePresetTriggers(presetName: string, triggers: HudTrigger[]): void;
  updatePresetMatch(presetName: string, match: 'all' | 'any'): void;
  setActivePreset(name: string | null): void;
  movePreset(fromIdx: number, toIdx: number): void;
  insertPreset(preset: HudPresetClient, afterIdx: number): void;
  loadConfigData(config: Config): void;
  patchConfig(patch: DeepPartial<Config>): void;
  saveConfig(): Promise<void>;
  markClean(): void;
  loadAssets(): Promise<void>;
  loadBiomes(presets: BiomePreset[]): void;
  selectBiome(name: string | null): void;
  createBiome(preset: BiomePreset): void;
  deleteBiome(name: string): void;
  renameBiome(oldName: string, newName: string): void;
  updateBiome(name: string, patch: Partial<BiomePreset>): void;
  moveBiome(fromIdx: number, toIdx: number): void;
  insertBiome(preset: BiomePreset, afterIdx: number): void;
  setLifePlaying(v: boolean): void;
  restartLife(): void;
  stepLifeForward(): void;
  stepLifeBack(): void;
  setLifeStepCount(n: number): void;
}

export type DeckStore = DeckState & DeckActions;

// Keep legacy alias for files that still reference StoreState/Store
export type StoreState = DeckState;
export type Store = { state: DeckState; subscribe: (cb: () => void) => () => void } & DeckActions;

const MAX_UNDO = 50;
export const ROWS = 34;
export const DEFAULT_WIDTH: 9 | 18 = 9;
export const ZOOM_STEPS = [0.5, 1, 2, 3, 4] as const;
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const idx = ZOOM_STEPS.indexOf(zoom as typeof ZOOM_STEPS[number]);
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (idx < 0 ? 1 : idx) + dir))]!;
}

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

function bfsFill(arr: Uint8Array, col: number, row: number, fillColor: number, width: number): void {
  const targetColor = arr[col * ROWS + row] ?? 0;
  if (targetColor === fillColor) return;
  const queue: [number, number][] = [[col, row]];
  let head = 0;
  while (head < queue.length) {
    const [c, r] = queue[head++]!;
    const idx = c * ROWS + r;
    if (arr[idx] !== targetColor) continue;
    arr[idx] = fillColor;
    if (c > 0) queue.push([c - 1, r]);
    if (c < width - 1) queue.push([c + 1, r]);
    if (r > 0) queue.push([c, r - 1]);
    if (r < ROWS - 1) queue.push([c, r + 1]);
  }
}

function pushUndo(frames: Frame[], stack: Frame[][]): Frame[][] {
  const next = [...stack, cloneFrames(frames)];
  if (next.length > MAX_UNDO) next.shift();
  return next;
}

export function createDeckStore() {
  return createStore<DeckStore>((set, get) => ({
    frames: [blank(9)],
    activeFrameIdx: 0,
    width: 9,
    mode: 'bw',
    loop: true,
    activeColor: 255,
    isPlaying: false,
    previewTarget: 'left',
    previewBw: false,
    zoom: 1,
    undoStack: [],
    redoStack: [],
    strokeSnapshot: null,
    projectTitle: 'untitled_animation',
    activeMode: null,
    audioStyle: 'dark-matter',
    audioSource: 'monitor',
    micSensitivity: 50,
    hudLeftFace: 'elegant',
    hudRightFace: 'elegant',
    hudLeftWidget: 'clock',
    hudRightWidget: 'clock',
    hudLeftDataStyle: 'line',
    hudRightDataStyle: 'line',
    libraryPath: null,
    recentFiles: [],
    hudPresets: [],
    activePresetName: null,
    selectedPresetName: null,
    hudSelectedSide: 'left',
    configData: null,
    configDirty: false,
    assetList: null,
    biomePresets: [],
    selectedBiomeName: null,
    lifeIsPlaying: false,
    lifeGeneration: 0,
    lifeStepForwardCount: 0,
    lifeStepBackCount: 0,
    lifeStepCount: 0,

    setPixel(frameIdx, col, row, value) {
      const { frames, mode, undoStack, strokeSnapshot, previewTarget, width } = get();
      const frame = frames[frameIdx];
      if (!frame) return;
      const arr = decode(frame);
      const v = mode === 'bw' ? (value >= 128 ? 255 : 0) : Math.max(0, Math.min(255, value));
      arr[col * ROWS + row] = v;
      if (previewTarget === 'mirror') arr[(width - 1 - col) * ROWS + row] = v;
      const next = [...frames];
      next[frameIdx] = { ...frame, pixels: encode(arr) };
      // During a stroke batch, skip individual undo entries — commitStroke pushes one entry.
      if (strokeSnapshot !== null) {
        set({ frames: next });
      } else {
        set({ frames: next, undoStack: pushUndo(frames, undoStack), redoStack: [] });
      }
    },

    beginStroke() {
      const { frames } = get();
      set({ strokeSnapshot: cloneFrames(frames), redoStack: [] });
    },

    commitStroke() {
      const { strokeSnapshot, frames, undoStack } = get();
      if (strokeSnapshot === null) return;
      const changed = frames.some((f, i) => f.pixels !== strokeSnapshot[i]?.pixels);
      if (changed) {
        const next = [...undoStack, strokeSnapshot];
        if (next.length > MAX_UNDO) next.shift();
        set({ strokeSnapshot: null, undoStack: next });
      } else {
        set({ strokeSnapshot: null });
      }
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

    cloneFrame(idx) {
      const { frames, undoStack } = get();
      const frame = frames[idx];
      if (!frame) return;
      const next = [...frames];
      next.splice(idx + 1, 0, { ...frame });
      set({ frames: next, activeFrameIdx: idx + 1, undoStack: pushUndo(frames, undoStack), redoStack: [] });
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
      set({ frames: restored, activeFrameIdx: Math.min(activeFrameIdx, restored.length - 1), undoStack: prev, redoStack: pushUndo(frames, redoStack), strokeSnapshot: null });
    },

    redo() {
      const { redoStack, frames, activeFrameIdx, undoStack } = get();
      if (redoStack.length === 0) return;
      const next = [...redoStack];
      const restored = next.pop()!;
      set({ frames: restored, activeFrameIdx: Math.min(activeFrameIdx, restored.length - 1), undoStack: pushUndo(frames, undoStack), redoStack: next, strokeSnapshot: null });
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
      const newWidth: 9 | 18 = (target === 'both' || target === 'mirror') ? 18 : 9;
      const { frames, width, undoStack } = get();
      if (newWidth !== width) {
        let resized = resize(frames, newWidth);
        if (target === 'mirror' && width === 9) {
          resized = resized.map(f => {
            const arr = decode(f);
            for (let c = 0; c < newWidth / 2; c++)
              for (let r = 0; r < ROWS; r++)
                arr[(newWidth - 1 - c) * ROWS + r] = arr[c * ROWS + r] ?? 0;
            return { ...f, pixels: encode(arr) };
          });
        }
        set({ previewTarget: target, width: newWidth, frames: resized, undoStack: pushUndo(frames, undoStack), redoStack: [] });
      } else {
        set({ previewTarget: target });
      }
    },

    setPreviewBw(value) { set({ previewBw: value }); },
    setZoom(zoom) { set({ zoom: ZOOM_STEPS.reduce((a, b) => Math.abs(b - zoom) < Math.abs(a - zoom) ? b : a) }); },

    floodFill(frameIdx, col, row, color) {
      const { frames, width, mode, undoStack, strokeSnapshot, previewTarget } = get();
      const frame = frames[frameIdx];
      if (!frame) return;
      const arr = decode(frame);
      const fillColor = mode === 'bw' ? (color >= 128 ? 255 : 0) : Math.max(0, Math.min(255, color));
      bfsFill(arr, col, row, fillColor, width);
      if (previewTarget === 'mirror') bfsFill(arr, (width - 1 - col), row, fillColor, width);
      const next = [...frames];
      next[frameIdx] = { ...frame, pixels: encode(arr) };
      if (strokeSnapshot !== null) {
        set({ frames: next });
      } else {
        set({ frames: next, undoStack: pushUndo(frames, undoStack), redoStack: [] });
      }
    },

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
      set({ frames: p.frames, width: p.width ?? 9, mode: p.mode ?? 'gray', loop: p.loop ?? true, activeFrameIdx: 0, undoStack: [], redoStack: [], strokeSnapshot: null });
    },

    setProjectTitle(title) { set({ projectTitle: title.trim() || 'untitled_animation' }); },
    setActiveMode(mode) { set({ activeMode: mode }); },
    setAudioStyle(style) { set({ audioStyle: style }); },
    setAudioSource(source) { set({ audioSource: source }); },
    setMicSensitivity(value) { set({ micSensitivity: Math.min(100, Math.max(0, Math.round(value))) }); },
    setHudLeftFace(face)   { set({ hudLeftFace: face }); },
    setHudRightFace(face)  { set({ hudRightFace: face }); },
    setHudLeftWidget(widget, dataStyle)  { set({ hudLeftWidget: widget,  ...(dataStyle ? { hudLeftDataStyle: dataStyle }  : {}) }); },
    setHudRightWidget(widget, dataStyle) { set({ hudRightWidget: widget, ...(dataStyle ? { hudRightDataStyle: dataStyle } : {}) }); },
    setLibraryPath(p) { set({ libraryPath: p }); },
    addRecentFile(name) {
      const { recentFiles } = get();
      set({ recentFiles: [name, ...recentFiles.filter(f => f !== name)].slice(0, 7) });
    },

    loadPresets(presets, activeName) {
      set({ hudPresets: presets, activePresetName: activeName });
    },
    selectPreset(name) { set({ selectedPresetName: name }); },
    selectSide(side) { set({ hudSelectedSide: side }); },
    createPreset(preset) {
      const { hudPresets } = get();
      set({ hudPresets: [...hudPresets, preset] });
    },
    deletePreset(name) {
      const { hudPresets, selectedPresetName } = get();
      set({
        hudPresets: hudPresets.filter(p => p.name !== name),
        ...(selectedPresetName === name ? { selectedPresetName: null } : {}),
      });
    },
    renamePreset(oldName, newName) {
      const { hudPresets, selectedPresetName } = get();
      set({
        hudPresets: hudPresets.map(p => p.name === oldName ? { ...p, name: newName } : p),
        ...(selectedPresetName === oldName ? { selectedPresetName: newName } : {}),
      });
    },
    updatePresetWidget(presetName, side, widget) {
      const { hudPresets } = get();
      set({
        hudPresets: hudPresets.map(p => {
          if (p.name !== presetName) return p;
          return side === 'left' ? { ...p, left: widget } : { ...p, right: widget };
        }),
      });
    },
    updatePresetTriggers(presetName, triggers) {
      const { hudPresets } = get();
      set({
        hudPresets: hudPresets.map(p =>
          p.name === presetName ? { ...p, triggers } : p
        ),
      });
    },
    updatePresetMatch(presetName, match) {
      const { hudPresets } = get();
      set({
        hudPresets: hudPresets.map(p =>
          p.name === presetName ? { ...p, match } : p
        ),
      });
    },
    setActivePreset(name) { set({ activePresetName: name }); },
    movePreset(fromIdx, toIdx) {
      if (fromIdx === toIdx) return;
      const { hudPresets } = get();
      const next = [...hudPresets];
      const [p] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, p!);
      set({ hudPresets: next });
    },
    insertPreset(preset, afterIdx) {
      const { hudPresets } = get();
      const next = [...hudPresets];
      next.splice(afterIdx + 1, 0, preset);
      set({ hudPresets: next });
    },

    loadConfigData(config) {
      set({ configData: config, configDirty: false });
    },

    patchConfig(patch) {
      const { configData } = get();
      function deepMerge<T>(base: T, p: DeepPartial<T>): T {
        if (base === null || base === undefined || typeof base !== 'object') return p as T;
        const result = { ...base } as Record<string, unknown>;
        for (const key of Object.keys(p as object)) {
          const pVal = (p as Record<string, unknown>)[key];
          const bVal = (base as Record<string, unknown>)[key];
          result[key] = (pVal !== null && typeof pVal === 'object' && !Array.isArray(pVal) && bVal !== null && typeof bVal === 'object')
            ? deepMerge(bVal as object, pVal as DeepPartial<object>)
            : pVal;
        }
        return result as T;
      }
      const next = configData === null ? (patch as Config) : deepMerge(configData, patch);
      set({ configData: next, configDirty: true });
    },

    async saveConfig() {
      const { configData } = get();
      if (!configData) return;
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData),
      });
      if (res.ok) set({ configDirty: false });
    },

    markClean() {
      set({ configDirty: false });
    },

    async loadAssets() {
      try {
        const res = await fetch('/api/assets');
        if (!res.ok) return;
        const data = await res.json() as { ok: boolean; assets: AssetMeta[] };
        set({ assetList: data.assets ?? [] });
      } catch { /* network unavailable */ }
    },

    loadBiomes(presets) {
      set({ biomePresets: presets });
    },

    selectBiome(name) {
      set({ selectedBiomeName: name });
    },

    createBiome(preset) {
      set(s => ({ biomePresets: [...s.biomePresets, preset] }));
    },

    deleteBiome(name) {
      set(s => ({
        biomePresets: s.biomePresets.filter(p => p.name !== name),
        selectedBiomeName: s.selectedBiomeName === name ? null : s.selectedBiomeName,
      }));
    },

    renameBiome(oldName, newName) {
      set(s => ({
        biomePresets: s.biomePresets.map(p => p.name === oldName ? { ...p, name: newName } : p),
        selectedBiomeName: s.selectedBiomeName === oldName ? newName : s.selectedBiomeName,
      }));
    },

    updateBiome(name, patch) {
      set(s => ({ biomePresets: s.biomePresets.map(p => p.name === name ? { ...p, ...patch } : p) }));
    },

    moveBiome(fromIdx, toIdx) {
      set(s => {
        const next = [...s.biomePresets];
        const [item] = next.splice(fromIdx, 1);
        if (item) next.splice(toIdx, 0, item);
        return { biomePresets: next };
      });
    },

    insertBiome(preset, afterIdx) {
      set(s => {
        const next = [...s.biomePresets];
        next.splice(afterIdx + 1, 0, preset);
        return { biomePresets: next };
      });
    },

    setLifePlaying(v) {
      set({ lifeIsPlaying: v });
    },

    restartLife() {
      set(s => ({ lifeGeneration: s.lifeGeneration + 1, lifeStepCount: 0 }));
    },

    stepLifeForward() {
      set(s => ({ lifeStepForwardCount: s.lifeStepForwardCount + 1 }));
    },

    stepLifeBack() {
      set(s => ({ lifeStepBackCount: s.lifeStepBackCount + 1 }));
    },

    setLifeStepCount(n) {
      set({ lifeStepCount: n });
    },
  }));
}

// Singleton for the running app
const _store = createDeckStore();

export const useDeckStore = <T>(selector: (s: DeckStore) => T): T =>
  useStore(_store, selector);

// Expose vanilla store for non-React consumers (preview bridge, etc.)
export const deckStore = _store;

// Session persistence — survives page refresh, not a substitute for saving a file.
const SESSION_KEY = 'dark-matrix';

type SessionSnapshot = Pick<DeckState,
  'frames' | 'width' | 'mode' | 'loop' | 'activeFrameIdx' |
  'zoom' | 'activeColor' | 'previewTarget' | 'projectTitle' |
  'audioStyle' | 'audioSource' | 'micSensitivity' |
  'hudLeftFace' | 'hudRightFace' |
  'hudLeftWidget' | 'hudRightWidget' | 'hudLeftDataStyle' | 'hudRightDataStyle' |
  'libraryPath' | 'recentFiles' |
  'selectedPresetName' | 'hudSelectedSide'
> & { activeMode?: AppMode };

if (typeof localStorage !== 'undefined') {
  // Restore on load
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SessionSnapshot>;
      if (Array.isArray(s.frames) && s.frames.length > 0) {
        _store.setState({
          frames: s.frames,
          width: s.width ?? 9,
          mode: s.mode ?? 'bw',
          loop: s.loop ?? true,
          activeFrameIdx: Math.min(s.activeFrameIdx ?? 0, s.frames.length - 1),
          projectTitle: s.projectTitle ?? 'untitled_animation',
          ...(s.zoom !== undefined ? { zoom: s.zoom } : {}),
          ...(s.activeColor !== undefined ? { activeColor: s.activeColor } : {}),
          ...(s.previewTarget !== undefined ? { previewTarget: s.previewTarget } : {}),
          ...(s.activeMode !== undefined && MODES.some(m => m.id === s.activeMode) ? { activeMode: s.activeMode as AppMode } : {}),
          ...(s.audioStyle !== undefined ? { audioStyle: s.audioStyle } : {}),
          ...(s.audioSource !== undefined ? { audioSource: s.audioSource } : {}),
          ...(s.micSensitivity !== undefined ? { micSensitivity: Math.min(100, Math.max(0, Math.round(Number(s.micSensitivity)))) } : {}),
          ...(s.hudLeftFace !== undefined ? { hudLeftFace: s.hudLeftFace } : {}),
          ...(s.hudRightFace !== undefined ? { hudRightFace: s.hudRightFace } : {}),
          ...(s.hudLeftWidget !== undefined ? { hudLeftWidget: s.hudLeftWidget } : {}),
          ...(s.hudRightWidget !== undefined ? { hudRightWidget: s.hudRightWidget } : {}),
          ...(s.hudLeftDataStyle !== undefined ? { hudLeftDataStyle: s.hudLeftDataStyle } : {}),
          ...(s.hudRightDataStyle !== undefined ? { hudRightDataStyle: s.hudRightDataStyle } : {}),
          ...(s.libraryPath !== undefined ? { libraryPath: s.libraryPath } : {}),
          ...(Array.isArray(s.recentFiles) ? { recentFiles: (s.recentFiles as unknown[]).filter((f): f is string => typeof f === 'string').slice(0, 7) } : {}),
          ...(s.selectedPresetName !== undefined ? { selectedPresetName: s.selectedPresetName } : {}),
          ...(s.hudSelectedSide !== undefined ? { hudSelectedSide: s.hudSelectedSide } : {}),
        });
      }
    }
  } catch { /* corrupt or unavailable */ }

  // Debounced save on every state change
  let _saveTimer: ReturnType<typeof setTimeout> | null = null;
  _store.subscribe((state) => {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      try {
        const { frames, width, mode, loop, activeFrameIdx, zoom, activeColor, previewTarget, projectTitle, activeMode, audioStyle, audioSource, micSensitivity, hudLeftFace, hudRightFace, hudLeftWidget, hudRightWidget, hudLeftDataStyle, hudRightDataStyle, libraryPath, recentFiles, selectedPresetName, hudSelectedSide } = state;
        const snapshot: SessionSnapshot = { frames, width, mode, loop, activeFrameIdx, zoom, activeColor, previewTarget, projectTitle, audioStyle, audioSource, micSensitivity, hudLeftFace, hudRightFace, hudLeftWidget, hudRightWidget, hudLeftDataStyle, hudRightDataStyle, libraryPath, recentFiles, selectedPresetName, hudSelectedSide };
        if (activeMode !== null) snapshot.activeMode = activeMode;
        localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
      } catch { /* storage full or unavailable */ }
    }, 500);
  });
}
