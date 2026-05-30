import { useRef, type DragEvent } from 'react';
import type { CastColumn as CastColumnType } from '../types/config-types.js';
import { Button } from './ui/button.js';
import { ChatFeed } from './ChatFeed.js';
import { Link } from './ui/link.js';

export const CAST_DRAG_MIME = 'application/x-cast-col';

/**
 * Read a cast-column drag payload and resolve the final array index it should
 * move to, given the boundary (insertAt) the pointer is over. Returns null when
 * the drag is not a cast column. Shared by the column-body and gap drop targets.
 */
export function resolveColumnDrop(e: DragEvent, insertAt: number): { from: number; to: number } | null {
  if (!e.dataTransfer.types.includes(CAST_DRAG_MIME)) return null;
  const from = Number(e.dataTransfer.getData(CAST_DRAG_MIME));
  if (Number.isNaN(from)) return null;
  return { from, to: from < insertAt ? insertAt - 1 : insertAt };
}

/** L-shaped brackets at the four corners of a column card (foreground color). */
function CornerBrackets() {
  const base = 'pointer-events-none absolute w-6 h-6 z-[2]';
  const color = { borderColor: 'var(--color-foreground)' };
  return (
    <>
      <span aria-hidden="true" className={`${base} top-0 left-0 border-t border-l`} style={color} />
      <span aria-hidden="true" className={`${base} top-0 right-0 border-t border-r`} style={color} />
      <span aria-hidden="true" className={`${base} bottom-0 left-0 border-b border-l`} style={color} />
      <span aria-hidden="true" className={`${base} bottom-0 right-0 border-b border-r`} style={color} />
    </>
  );
}

export function CastColumn({ column, index, count, onCollapse, onRemove, onReorder, onDragIndicator }: {
  column: CastColumnType;
  index: number;
  count: number;
  onCollapse(): void;
  onRemove(): void;
  onReorder(from: number, to: number): void;
  /** Report the insert position (column boundary) the pointer is over, or null. */
  onDragIndicator(insertAt: number | null): void;
}) {
  const insertAtRef = useRef<number | null>(null);

  function onDragStart(e: DragEvent) {
    e.dataTransfer.setData(CAST_DRAG_MIME, String(index));
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragEnd() {
    insertAtRef.current = null;
    onDragIndicator(null);
  }
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(CAST_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Left half → insert before this column, right half → after it.
    const rect = e.currentTarget.getBoundingClientRect();
    const insertAt = e.clientX < rect.left + rect.width / 2 ? index : index + 1;
    insertAtRef.current = insertAt;
    onDragIndicator(insertAt);
  }
  function onDrop(e: DragEvent) {
    const insertAt = insertAtRef.current;
    insertAtRef.current = null;
    onDragIndicator(null);
    if (insertAt === null) return;
    const r = resolveColumnDrop(e, insertAt);
    if (!r) return;
    e.preventDefault();
    onReorder(r.from, r.to);
  }

  const dropProps = { onDragOver, onDrop };

  const moveButtons = (
    <>
      <Button
        variant="ghost"
        size="sm"
        tooltip="Move left"
        aria-label={`Move ${column.channel} left`}
        disabled={index === 0}
        onClick={() => onReorder(index, index - 1)}
      >
        ◀
      </Button>
      <Button
        variant="ghost"
        size="sm"
        tooltip="Move right"
        aria-label={`Move ${column.channel} right`}
        disabled={index === count - 1}
        onClick={() => onReorder(index, index + 1)}
      >
        ▶
      </Button>
    </>
  );

  if (column.collapsed) {
    return (
      <div
        role="region"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-roledescription="Draggable column"
        {...dropProps}
        className="group flex flex-col items-center py-2 my-10 cursor-grab"
        style={{ width: '2rem', minWidth: '2rem', backdropFilter: 'blur(2px)', backgroundColor: 'color-mix(in srgb, var(--color-background) 65%, transparent)' }}
        aria-label={`${column.channel} (collapsed)`}
      >
        <div className="flex-1 w-px bg-foreground" />
        <Button
          variant="ghost"
          size="sm"
          tooltip={`Expand ${column.channel}`}
          aria-label={`Expand ${column.channel}`}
          onClick={onCollapse}
          className="my-1 px-1"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          expand
        </Button>
        {/* Keyboard reorder path — also available while collapsed (drag is mouse-only) */}
        <div className="flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {moveButtons}
        </div>
        <div className="flex-1 w-px bg-foreground" />
      </div>
    );
  }

  return (
    <div
      {...dropProps}
      className="group relative flex flex-col min-h-0 flex-1 my-10"
      // Frosted card over the cast background visualizer — matches the toolbar
      // treatment so chat stays readable. The blur lives here; the sticky header
      // below uses a more opaque solid tint (no nested backdrop-filter). The
      // vertical margin matches the inter-column gap so cards float evenly.
      style={{ backdropFilter: 'blur(2px)', backgroundColor: 'color-mix(in srgb, var(--color-background) 65%, transparent)' }}
    >
      <CornerBrackets />
      {/* Column header — grab here to drag-reorder */}
      <div
        role="group"
        aria-label={`${column.channel} column header`}
        aria-roledescription="Draggable column header"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="flex items-center justify-between px-4 py-1.5 cursor-grab"
        style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'color-mix(in srgb, var(--color-background) 82%, transparent)' }}
      >
        <Link href={`https://twitch.tv/${column.channel}`} draggable={false} className="font-mono text-xs truncate">
          {column.channel}
        </Link>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {moveButtons}
          <Button
            variant="ghost"
            size="sm"
            tooltip="Collapse column"
            aria-label={`Collapse ${column.channel}`}
            onClick={onCollapse}
          >
            −
          </Button>
          <Button
            variant="ghost"
            size="sm"
            tooltip="Remove column"
            aria-label={`Remove ${column.channel}`}
            onClick={onRemove}
          >
            ×
          </Button>
        </div>
      </div>

      {/* Chat feed */}
      <ChatFeed column={column} />
    </div>
  );
}
