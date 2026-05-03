import type { DmxProject } from '../format.js';
import { serializeProject } from '../format.js';

// Minimal store interface for file operations (compatible with designer-ui's Store)
interface FileStoreCompat {
  state: {
    frames: Array<{ delayMs: number; pixels: string }>;
    width: 9 | 18;
    mode: 'bw' | 'gray';
    loop: boolean;
  };
  loadProject?: (project: unknown) => void;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFile(file: File, store: FileStoreCompat): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);

  const resp = await fetch('/api/import', { method: 'POST', body: formData });
  if (!resp.ok) throw new Error(`Import failed: ${resp.status}`);

  const json = await resp.json() as { ok: boolean; project: DmxProject };
  if (!json.ok) throw new Error('Import failed');

  if (store.loadProject) {
    store.loadProject(json.project);
  }
}

export async function exportProject(store: FileStoreCompat): Promise<void> {
  const project: DmxProject = {
    format: 'dark-matrix-designer',
    version: 1,
    width: store.state.width,
    height: 34,
    mode: store.state.mode,
    loop: store.state.loop,
    frames: store.state.frames,
  };
  const json = serializeProject(project);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(blob, 'project.dmx.json');
}

export async function exportGif(store: FileStoreCompat): Promise<void> {
  const project: DmxProject = {
    format: 'dark-matrix-designer',
    version: 1,
    width: store.state.width,
    height: 34,
    mode: store.state.mode,
    loop: store.state.loop,
    frames: store.state.frames,
  };

  const resp = await fetch('/api/export/gif', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
  if (!resp.ok) throw new Error(`Export GIF failed: ${resp.status}`);

  const buf = await resp.arrayBuffer();
  const blob = new Blob([buf], { type: 'image/gif' });
  triggerDownload(blob, 'animation.gif');
}

export async function exportPng(store: FileStoreCompat, frameIdx: number): Promise<void> {
  const project: DmxProject = {
    format: 'dark-matrix-designer',
    version: 1,
    width: store.state.width,
    height: 34,
    mode: store.state.mode,
    loop: store.state.loop,
    frames: store.state.frames,
  };

  const resp = await fetch('/api/export/png', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, frameIdx }),
  });
  if (!resp.ok) throw new Error(`Export PNG failed: ${resp.status}`);

  const buf = await resp.arrayBuffer();
  const blob = new Blob([buf], { type: 'image/png' });
  triggerDownload(blob, `frame-${frameIdx}.png`);
}
