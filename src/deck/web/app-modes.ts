export const MODES = [
  { id: 'hud',    label: 'hud' },
  { id: 'audio',  label: 'audio' },
  { id: 'video',  label: 'video' },
  { id: 'data',   label: 'data' },
  { id: 'runes',  label: 'runes' },
  { id: 'life',   label: 'life' },
  { id: 'design', label: 'design' },
  { id: 'config', label: 'config' },
] as const;

export type AppMode = (typeof MODES)[number]['id'];
