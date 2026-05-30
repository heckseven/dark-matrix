import type { CastColumn as CastColumnType } from '../types/config-types.js';
import { Button } from './ui/button.js';
import { ChatFeed } from './ChatFeed.js';
import { Link } from './ui/link.js';

export function CastColumn({ column, onCollapse, onRemove }: {
  column: CastColumnType;
  onCollapse(): void;
  onRemove(): void;
}) {
  if (column.collapsed) {
    return (
      <div
        role="region"
        className="flex flex-col items-center py-2"
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
        <div className="flex-1 w-px bg-foreground" />
      </div>
    );
  }

  return (
    <div
      className="group flex flex-col min-h-0 flex-1"
      // Frosted card over the cast background visualizer — matches the toolbar
      // treatment so chat stays readable. The blur lives here; the sticky header
      // below uses a more opaque solid tint (no nested backdrop-filter).
      style={{ backdropFilter: 'blur(2px)', backgroundColor: 'color-mix(in srgb, var(--color-background) 65%, transparent)' }}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'color-mix(in srgb, var(--color-background) 82%, transparent)' }}
      >
        <Link href={`https://twitch.tv/${column.channel}`} className="font-mono text-xs truncate">
          {column.channel}
        </Link>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
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
