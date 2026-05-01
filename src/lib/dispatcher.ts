import type { SwitchEvent } from './ec-switches.js';
import type { VmEvent } from './vm-source.js';
import type { ClaudeActivityEvent } from './claude-source.js';

export type DisplaySource = 'ec-switch' | 'vm' | 'claude' | 'manual';

export type DisplayIntent = {
  id: string;
  source: DisplaySource;
  priority: number;
  content: string;
  durationMs: number;
  expiresAt: number;
};

export const PRIORITY = {
  URGENT: 100,
  HIGH: 75,
  NORMAL: 50,
  LOW: 25,
} as const;

let _seq = 0;
function nextId() { return `intent-${++_seq}`; }

export function ecSwitchIntent(e: SwitchEvent): DisplayIntent {
  const label = e.type === 'cam'
    ? (e.value === 0 ? 'CAM OFF' : 'CAM ON')
    : (e.value === 0 ? 'MIC OFF' : 'MIC ON');
  return {
    id: nextId(),
    source: 'ec-switch',
    priority: PRIORITY.URGENT,
    content: label,
    durationMs: 5000,
    expiresAt: Date.now() + 5000,
  };
}

export function vmIntent(e: VmEvent): DisplayIntent {
  const label = e.started.length > 0
    ? `VM UP ${e.started[0]}`
    : `VM DN ${e.stopped[0]}`;
  return {
    id: nextId(),
    source: 'vm',
    priority: PRIORITY.HIGH,
    content: label,
    durationMs: 8000,
    expiresAt: Date.now() + 8000,
  };
}

export function claudeIntent(e: ClaudeActivityEvent): DisplayIntent | null {
  if (e.type === 'unknown') return null;
  const label = e.type === 'agent_spawn'
    ? `AGENT ${e.subagent_type}`
    : `TOOL ${e.tool}`;
  return {
    id: nextId(),
    source: 'claude',
    priority: PRIORITY.NORMAL,
    content: label,
    durationMs: 3000,
    expiresAt: Date.now() + 3000,
  };
}

export class Dispatcher {
  private queue: DisplayIntent[] = [];
  private listeners: Set<(intent: DisplayIntent | null) => void> = new Set();

  push(intent: DisplayIntent): void {
    this.queue.push(intent);
    this.queue.sort((a, b) => b.priority - a.priority);
    this._notify();
  }

  current(): DisplayIntent | null {
    const now = Date.now();
    return this.queue.find(i => i.expiresAt > now) ?? null;
  }

  gc(): void {
    const now = Date.now();
    const before = this.queue.length;
    this.queue = this.queue.filter(i => i.expiresAt > now);
    if (this.queue.length !== before) this._notify();
  }

  onChange(cb: (intent: DisplayIntent | null) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private _notify(): void {
    const curr = this.current();
    for (const cb of this.listeners) cb(curr);
  }
}
