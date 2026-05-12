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

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^\w\s\-]/g, '_').slice(0, 100) || 'untitled_animation';
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

function buildProject(store: FileStoreCompat): DmxProject {
  return {
    format: 'dark-matrix-designer',
    version: 1,
    width: store.state.width,
    height: 34,
    mode: store.state.mode,
    loop: store.state.loop,
    frames: store.state.frames,
  };
}

export function exportProject(store: FileStoreCompat, name = 'project'): void {
  const safe = sanitizeFilename(name);
  const blob = new Blob([serializeProject(buildProject(store))], { type: 'application/json' });
  triggerDownload(blob, `${safe}.dmx.json`);
}

export async function saveProjectAs(store: FileStoreCompat, name = 'project'): Promise<void> {
  const safe = sanitizeFilename(name);
  const json = serializeProject(buildProject(store));
  if ('showSaveFilePicker' in window) {
    try {
      const fh = await (window as Window & { showSaveFilePicker: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName: `${safe}.dmx.json`,
        types: [{ description: 'Dark Matrix project', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await fh.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      throw e;
    }
  }
  triggerDownload(new Blob([json], { type: 'application/json' }), `${safe}.dmx.json`);
}

export async function saveToLibrary(store: FileStoreCompat, name = 'untitled_animation'): Promise<string> {
  const safe = sanitizeFilename(name);
  const resp = await fetch('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safe, project: buildProject(store) }),
  });
  if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);
  const data = await resp.json() as { ok: boolean; name: string };
  if (!data.ok) throw new Error('Save failed');
  return data.name;
}

export async function saveLibraryCopy(store: FileStoreCompat, name = 'untitled_animation'): Promise<string> {
  const safe = sanitizeFilename(name);
  const resp = await fetch('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safe, project: buildProject(store), copy: true }),
  });
  if (!resp.ok) throw new Error(`Save copy failed: ${resp.status}`);
  const data = await resp.json() as { ok: boolean; name: string };
  if (!data.ok || typeof data.name !== 'string') throw new Error('Save copy failed');
  return data.name;
}

export async function openFromLibrary(name: string): Promise<DmxProject> {
  const safe = sanitizeFilename(name);
  const resp = await fetch(`/api/library/${encodeURIComponent(safe)}`);
  if (!resp.ok) throw new Error(`Open failed: ${resp.status}`);
  return resp.json() as Promise<DmxProject>;
}

export async function renameLibraryFile(oldName: string, newName: string): Promise<string> {
  const safe = sanitizeFilename(newName);
  const resp = await fetch(`/api/library/${encodeURIComponent(oldName)}/rename`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName: safe }),
  });
  if (!resp.ok) throw new Error(`Rename failed: ${resp.status}`);
  const data = await resp.json() as { ok: boolean; name: string };
  if (!data.ok) throw new Error('Rename failed');
  return data.name;
}

export async function exportGif(store: FileStoreCompat): Promise<void> {
  const resp = await fetch('/api/export/gif', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: buildProject(store) }),
  });
  if (!resp.ok) throw new Error(`Export GIF failed: ${resp.status}`);

  const buf = await resp.arrayBuffer();
  const blob = new Blob([buf], { type: 'image/gif' });
  triggerDownload(blob, 'animation.gif');
}

export async function exportPng(store: FileStoreCompat, frameIdx: number): Promise<void> {
  const resp = await fetch('/api/export/png', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: buildProject(store), frameIdx }),
  });
  if (!resp.ok) throw new Error(`Export PNG failed: ${resp.status}`);

  const buf = await resp.arrayBuffer();
  const blob = new Blob([buf], { type: 'image/png' });
  triggerDownload(blob, `frame-${frameIdx}.png`);
}
