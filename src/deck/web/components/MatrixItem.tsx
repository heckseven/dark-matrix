import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { Stack } from './ui/stack.js';

function CornerBrackets({ active }: { active: boolean }) {
  const c = { position: 'absolute' as const, width: 16, height: 16, pointerEvents: 'none' as const };
  const b = `1px solid ${active ? 'white' : 'rgba(255,255,255,0.35)'}`;
  return (
    <div aria-hidden="true" className={`absolute inset-0 pointer-events-none transition-opacity ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}>
      <span style={{ ...c, top: 0,    left: 0,    borderTop: b, borderLeft: b }} />
      <span style={{ ...c, top: 0,    right: 0,   borderTop: b, borderRight: b }} />
      <span style={{ ...c, bottom: 0, left: 0,    borderBottom: b, borderLeft: b }} />
      <span style={{ ...c, bottom: 0, right: 0,   borderBottom: b, borderRight: b }} />
    </div>
  );
}

export type MatrixItemProps = {
  name?: string;
  'aria-label': string;
  width: 9 | 18;
  pixels: string;
  isActive?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onPreviewClick?: () => void;
  onRename?: (name: string) => void;
  controlsTop?: ReactNode;
  controlsBottom?: ReactNode;
  dragIdx?: number;
  onDragOver?: (insertAt: number | null) => void;
  onDrop?: (from: number, to: number) => void;
};

export function MatrixItem({
  name,
  'aria-label': ariaLabel,
  width,
  pixels,
  isActive = false,
  isSelected = false,
  onSelect,
  onPreviewClick,
  onRename,
  controlsTop,
  controlsBottom,
  dragIdx,
  onDragOver,
  onDrop,
}: MatrixItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const insertAtRef = useRef<number | null>(null);

  const draggable = dragIdx !== undefined;
  const hasControls = controlsTop != null || controlsBottom != null;
  const highlighted = isActive || isSelected;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitRename() {
    const next = draft.trim() || (name ?? '');
    setDraft(next);
    setEditing(false);
    if (next !== name) onRename?.(next);
  }

  const previewEl = draggable ? (
    <div
      draggable
      aria-hidden="true"
      tabIndex={-1}
      onDragStart={e => {
        setDragging(true);
        e.dataTransfer.setData('text/plain', String(dragIdx));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setDragging(false);
        insertAtRef.current = null;
        onDragOver?.(null);
      }}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <MatrixPreview pixels={pixels} width={width} />
    </div>
  ) : onPreviewClick ? (
    <button
      type="button"
      aria-label={`Open ${name ?? 'item'}`}
      className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 rounded-sm"
      onClick={e => { e.stopPropagation(); onPreviewClick(); }}
    >
      <MatrixPreview pixels={pixels} width={width} />
    </button>
  ) : (
    <MatrixPreview pixels={pixels} width={width} />
  );

  return (
    <div
      aria-label={ariaLabel}
      tabIndex={onSelect ? 0 : undefined}
      className="group relative flex flex-col gap-2 p-2 rounded-sm w-fit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onSelect}
      onKeyDown={onSelect ? e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      } : undefined}
      onDragOver={draggable ? e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const insertAt = e.clientY < rect.top + rect.height / 2 ? dragIdx! : dragIdx! + 1;
        insertAtRef.current = insertAt;
        onDragOver?.(insertAt);
      } : undefined}
      onDrop={draggable ? e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const from = Number(raw);
        const insertAt = insertAtRef.current;
        insertAtRef.current = null;
        onDragOver?.(null);
        if (!Number.isInteger(from) || from < 0 || insertAt === null) return;
        const to = from < insertAt ? insertAt - 1 : insertAt;
        if (to !== from) onDrop?.(from, to);
      } : undefined}
    >
      <CornerBrackets active={highlighted} />

      <div className="flex flex-row gap-1">
        {previewEl}
        {hasControls && (
          <Stack justify="between" align="start" className="flex-1 min-w-0">
            {controlsTop != null && (
              <Stack direction="col" gap="none" align="start">
                {controlsTop}
              </Stack>
            )}
            {controlsBottom != null && (
              <Stack direction="col" gap="none" align="start">
                {controlsBottom}
              </Stack>
            )}
          </Stack>
        )}
      </div>

      {name != null && (
        onRename ? (
          editing ? (
            <input
              ref={inputRef}
              aria-label={`Rename: ${name}`}
              className="font-mono text-xs bg-transparent border-b border-white text-foreground outline-none w-full"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { setDraft(name); setEditing(false); }
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="font-mono text-xs text-foreground pl-1 block truncate"
              onDoubleClick={e => { e.stopPropagation(); setDraft(name); setEditing(true); }}
            >
              {name}
            </span>
          )
        ) : (
          <span className="font-mono text-xs text-foreground pl-1 block truncate">{name}</span>
        )
      )}
    </div>
  );
}
