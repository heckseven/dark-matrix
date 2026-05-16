export const MODES = [
  { id: 'hud',    label: 'hud' },
  { id: 'audio',  label: 'audio' },
  { id: 'data',   label: 'data' },
  { id: 'video',  label: 'video' },
  { id: 'runes',  label: 'runes' },
  { id: 'games',  label: 'life' },
  { id: 'design', label: 'design' },
  { id: 'config', label: 'config' },
] as const;

export type AppMode = (typeof MODES)[number]['id'];
