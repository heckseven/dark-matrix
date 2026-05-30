import type { CastColumn as CastColumnType } from '../types/config-types.js';
import { Button } from './ui/button.js';
import { ChatFeed } from './ChatFeed.js';
import { Link } from './ui/link.js';

/** Muted L-shaped brackets at the four corners of a column card. */
function CornerBrackets() {
  const base = 'pointer-events-none absolute w-3 h-3 z-[2]';
  const color = { borderColor: 'var(--color-border)' };
  return (
    <>
      <span aria-hidden="true" className={`${base} top-0 left-0 border-t border-l`} style={color} />
      <span aria-hidden="true" className={`${base} top-0 right-0 border-t border-r`} style={color} />
      <span aria-hidden="true" className={`${base} bottom-0 left-0 border-b border-l`} style={color} />
      <span aria-hidden="true" className={`${base} bottom-0 right-0 border-b border-r`} style={color} />
    </>
  );
}

export function CastColumn({ column, onCollapse, onRemove }: {
  column: CastColumnType;
  onCollapse(): void;
  onRemove(): void;
}) {
  if (column.collapsed) {
    return (
      <div
        role="region"
        className="flex flex-col items-center py-2 my-10"
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
      className="group relative flex flex-col min-h-0 flex-1 my-10"
      // Frosted card over the cast background visualizer — matches the toolbar
      // treatment so chat stays readable. The blur lives here; the sticky header
      // below uses a more opaque solid tint (no nested backdrop-filter). The
      // vertical margin matches the inter-column gap so cards float evenly.
      style={{ backdropFilter: 'blur(2px)', backgroundColor: 'color-mix(in srgb, var(--color-background) 65%, transparent)' }}
    >
      <CornerBrackets />
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
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
