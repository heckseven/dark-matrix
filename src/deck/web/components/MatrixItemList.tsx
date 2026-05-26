import { useState, useRef, useEffect, Fragment } from 'react';
import type { Key, ReactNode } from 'react';
import { Button } from './ui/button.js';
import { cn } from '@/lib/utils.js';

export type MatrixItemDragProps = {
  dragIdx: number;
  count: number;
  onDragOver: (insertAt: number | null) => void;
  onDrop: (from: number, to: number) => void;
};

// ── internal pieces ───────────────────────────────────────────────────────────

function DropLine() {
  return <div aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />;
}

function GapZone({ afterIdx, showDrop, onDragOver, count, onInsert, onMove, insertLabel }: {
  afterIdx: number;
  showDrop: boolean;
  onDragOver: (insertAt: number | null) => void;
  count: number;
  onInsert: () => void;
  onMove: (from: number, to: number) => void;
  insertLabel?: (afterIdx: number) => string;
}) {
  const label = insertLabel?.(afterIdx) ?? `Insert after ${afterIdx + 1}`;
  return (
    <div
      className={`h-10 flex items-center gap-1 px-1 transition-opacity ${showDrop ? '' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(afterIdx + 1); }}
      onDrop={e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('application/x-dark-matrix-idx');
        if (!raw) return;
        const from = Number(raw);
        onDragOver(null);
        if (!Number.isInteger(from) || from < 0 || from >= count) return;
        const target = afterIdx + 1;
        const to = from < target ? target - 1 : target;
        if (to !== from) onMove(from, to);
      }}
    >
      {showDrop ? (
        <div className="flex-1 h-0.5 bg-green-500 rounded-full pointer-events-none" />
      ) : (
        <>
          <div className="flex-1 h-px bg-border" />
          <Button variant="ghost" aria-label={label} tooltip={label} onClick={onInsert}>+</Button>
          <div className="flex-1 h-px bg-border" />
        </>
      )}
    </div>
  );
}

// ── auto-scroll constants ─────────────────────────────────────────────────────

const SCROLL_ZONE = 60;
const SCROLL_SPEED = 8;
const SCROLL_TICK = 40;

// ── main component ────────────────────────────────────────────────────────────

export type MatrixItemListProps<T> = {
  items: T[];
  getKey: (item: T, idx: number) => Key;
  renderItem: (item: T, idx: number, dragProps: MatrixItemDragProps) => ReactNode;
  onMove: (from: number, to: number) => void;
  onInsert?: (afterIdx: number) => void;
  insertLabel?: (afterIdx: number) => string;
  onAdd?: () => void;
  addLabel?: string;
  emptyText?: string;
  'aria-label'?: string;
  semantic?: boolean;
  gap?: 'sm';
  topPadding?: number;
  bottomPadding?: number;
  /** Push items toward the panel edge nearest the center preview. Use 'end' for left pane, 'start' for right pane. */
  sideAlign?: 'start' | 'end';
};

export function MatrixItemList<T>({
  items,
  getKey,
  renderItem,
  onMove,
  onInsert,
  insertLabel,
  onAdd,
  addLabel = 'Add',
  emptyText,
  'aria-label': ariaLabel,
  semantic = true,
  gap = 'sm',
  topPadding,
  bottomPadding,
  sideAlign,
}: MatrixItemListProps<T>) {
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let dir: 'up' | 'down' | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function setDir(next: 'up' | 'down' | null) {
      if (next === dir) return;
      dir = next;
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
      if (next !== null) {
        intervalId = setInterval(
          () => el!.scrollBy({ top: next === 'up' ? -SCROLL_SPEED : SCROLL_SPEED }),
          SCROLL_TICK,
        );
      }
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (y < SCROLL_ZONE) setDir('up');
      else if (y > rect.height - SCROLL_ZONE) setDir('down');
      else setDir(null);
    }

    function stop() { setDir(null); }

    el.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragend', stop);
    document.addEventListener('drop', stop);

    return () => {
      stop();
      el.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragend', stop);
      document.removeEventListener('drop', stop);
    };
  }, []);

  const gapClass = 'gap-2';
  const sideAlignClass = sideAlign === 'end' ? 'items-end' : sideAlign === 'start' ? 'items-start' : undefined;
  const As = semantic ? 'ul' : 'div';
  const Item = semantic ? 'li' : 'div';
  const listRole = 'list';
  const itemRole = semantic ? undefined : 'listitem';
  const dragProps = (idx: number): MatrixItemDragProps => ({
    dragIdx: idx,
    count: items.length,
    onDragOver: setDropTarget,
    onDrop: onMove,
  });

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      aria-label={ariaLabel}
      className={cn('flex flex-col overflow-y-auto flex-1 min-h-0 pr-2 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', sideAlignClass)}
      style={{ paddingTop: topPadding, paddingBottom: bottomPadding }}
      onDragLeave={(e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      }}
    >
      <As
        role={listRole}
        className={`flex flex-col ${gapClass} pb-2 pt-2`}
        style={{ listStyle: 'none', padding: 0, margin: 0 }}
      >
        {items.length === 0 && emptyText && (
          <Item className="font-mono text-xs text-muted-foreground px-2 py-4">{emptyText}</Item>
        )}
        {dropTarget === 0 && <DropLine />}
        {items.map((item, idx) => (
          <Fragment key={getKey(item, idx)}>
            <Item role={itemRole}>
              {renderItem(item, idx, dragProps(idx))}
            </Item>
            {idx < items.length - 1 && onInsert && (
              <Item role={itemRole}>
                <GapZone
                  afterIdx={idx}
                  showDrop={dropTarget === idx + 1}
                  onDragOver={setDropTarget}
                  count={items.length}
                  onInsert={() => onInsert(idx)}
                  onMove={onMove}
                  {...(insertLabel !== undefined ? { insertLabel } : {})}
                />
              </Item>
            )}
          </Fragment>
        ))}
        {dropTarget === items.length && <DropLine />}
      </As>
      {onAdd && (
        <div className="h-10 flex items-center justify-center self-stretch px-1">
          <Button variant="ghost" aria-label={addLabel} tooltip={addLabel} onClick={onAdd}>+</Button>
        </div>
      )}
    </div>
  );
}
