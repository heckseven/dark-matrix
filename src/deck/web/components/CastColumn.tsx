import { useState, type DragEvent } from 'react';
import type { CastColumn as CastColumnType } from '../types/config-types.js';
import { Button } from './ui/button.js';
import { ChatFeed } from './ChatFeed.js';
import { Link } from './ui/link.js';

const DRAG_MIME = 'application/x-cast-col';

export function CastColumn({ column, index, count, onCollapse, onRemove, onReorder }: {
  column: CastColumnType;
  index: number;
  count: number;
  onCollapse(): void;
  onRemove(): void;
  onReorder(from: number, to: number): void;
}) {
  const [dragOver, setDragOver] = useState(false);

  function onDragStart(e: DragEvent) {
    e.dataTransfer.setData(DRAG_MIME, String(index));
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }
  function onDrop(e: DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    setDragOver(false);
    const from = Number(e.dataTransfer.getData(DRAG_MIME));
    if (!Number.isNaN(from)) onReorder(from, index);
  }

  const dropProps = {
    onDragOver,
    onDragLeave: () => setDragOver(false),
    onDrop,
    'data-drag-over': dragOver || undefined,
  };
  const dragOverStyle = dragOver ? { outline: '2px dashed var(--color-primary)', outlineOffset: '-2px' } : undefined;

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
        aria-roledescription="Draggable column"
        {...dropProps}
        className="group flex flex-col items-center py-2 cursor-grab"
        style={{ width: '2rem', minWidth: '2rem', backdropFilter: 'blur(2px)', backgroundColor: 'color-mix(in srgb, var(--color-background) 65%, transparent)', ...dragOverStyle }}
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
      className="group flex flex-col min-h-0 flex-1"
      // Frosted card over the cast background visualizer — matches the toolbar
      // treatment so chat stays readable. The blur lives here; the sticky header
      // below uses a more opaque solid tint (no nested backdrop-filter).
      style={{ backdropFilter: 'blur(2px)', backgroundColor: 'color-mix(in srgb, var(--color-background) 65%, transparent)', ...dragOverStyle }}
    >
      {/* Column header — grab here to drag-reorder */}
      <div
        role="group"
        aria-label={`${column.channel} column header`}
        aria-roledescription="Draggable column header"
        draggable
        onDragStart={onDragStart}
        className="flex items-center justify-between px-2 py-1 cursor-grab"
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
