import { useEffect, useRef } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { MODE_ICONS } from '../mode-icons.js';
import { MODES, type AppMode } from '../app-modes.js';

export { MODES, type AppMode };

function leftHalf(pixels: string): string {
  try { return btoa(atob(pixels).slice(0, 9 * 34)); } catch { return pixels; }
}

function ModeCard({ label, active, pixels, dualModule, onSelect }: {
  label: string;
  active: boolean;
  pixels: string;
  dualModule: boolean;
  onSelect: () => void;
}) {
  const c = { position: 'absolute', width: 16, height: 16, pointerEvents: 'none' } as const;
  const b = `1px solid ${active ? 'var(--color-foreground)' : 'color-mix(in srgb, var(--color-foreground) 35%, transparent)'}`;

  return (
    <button
      aria-label={`${label} mode${active ? ' (active)' : ''}`}
      aria-pressed={active}
      className="group relative flex flex-col gap-4 items-center rounded-sm p-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onSelect}
    >
      <div aria-hidden="true" className={`absolute inset-0 pointer-events-none transition-opacity ${active ? '' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
        <span style={{ ...c, top: 0,    left: 0,    borderTop: b, borderLeft: b }} />
        <span style={{ ...c, top: 0,    right: 0,   borderTop: b, borderRight: b }} />
        <span style={{ ...c, bottom: 0, left: 0,    borderBottom: b, borderLeft: b }} />
        <span style={{ ...c, bottom: 0, right: 0,   borderBottom: b, borderRight: b }} />
      </div>
      <div aria-hidden="true">
        <MatrixPreview pixels={dualModule ? pixels : leftHalf(pixels)} width={dualModule ? 18 : 9} />
      </div>
      <span className="font-mono text-xs text-foreground">{label}</span>
    </button>
  );
}

export function ModePicker({ activeMode, dualModule, onSelect, onClose }: {
  activeMode: AppMode | null;
  dualModule: boolean;
  onSelect: (mode: AppMode) => void;
  onClose?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(false);

  useEffect(() => {
    selectedRef.current = false;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    (container?.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
     container?.querySelector<HTMLElement>('button'))?.focus();
    return () => { if (!selectedRef.current) prev?.focus(); };
  }, []);

  useEffect(() => {
    if (!onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose!(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Mode picker"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-background flex flex-col font-mono"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <header className="flex items-center justify-center pl-7 pr-5 py-4 min-h-[58px]">
        <p className="font-mono text-xs text-foreground"><span aria-hidden="true">◫</span> dark matrix</p>
      </header>
      <div
        role="group"
        aria-label="Application mode"
        className="flex-1 flex flex-wrap gap-10 content-center justify-center px-10 pb-10"
      >
        {MODES.map((m, i) => (
          <ModeCard
            key={m.id}
            label={m.label}
            active={m.id === activeMode}
            pixels={MODE_ICONS[i] ?? MODE_ICONS[0]!}
            dualModule={dualModule}
            onSelect={() => { selectedRef.current = true; onSelect(m.id); onClose?.(); }}
          />
        ))}
      </div>
    </div>
  );
}
