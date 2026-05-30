import { Fragment, useEffect, useState, type DragEvent } from 'react';
import { useDeckStore } from '../store.js';
import type { CastColumn as CastColumnType } from '../types/config-types.js';
import { Button } from './ui/button.js';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.js';
import { Input } from './ui/input.js';
import { CastColumn, CAST_DRAG_MIME, resolveColumnDrop } from './CastColumn.js';
import { syncCastChannels } from '../twitch-chat.js';

const MAX_COLUMNS = 5;

/**
 * The gap between columns. During a drag it shows a vertical insert line (the
 * green drop indicator, matching the frame strip / HUD preset reorder UI);
 * otherwise it hosts the hover-revealed "+" insert button. Renders nothing when
 * at the column cap and not the active drop target, so idle layout is unchanged.
 */
function ColumnGap({ insertAt, showDrop, atMax, label, onInsert, onDragOver, onDrop }: {
  insertAt: number;
  showDrop: boolean;
  atMax: boolean;
  label: string;
  onInsert(): void;
  onDragOver(insertAt: number | null): void;
  onDrop(e: DragEvent, insertAt: number): void;
}) {
  if (!showDrop && atMax) return null;
  return (
    <div
      className="flex flex-col items-center w-10 flex-shrink-0"
      onDragOver={e => {
        if (!e.dataTransfer.types.includes(CAST_DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(insertAt);
      }}
      onDrop={e => onDrop(e, insertAt)}
    >
      {showDrop ? (
        <div aria-hidden="true" className="w-0.5 flex-1 bg-green-500 rounded-full pointer-events-none" />
      ) : (
        <div className="flex flex-col items-center flex-1 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <div className="flex-1 w-px bg-border" />
          <Button variant="ghost" size="sm" aria-label={label} tooltip={label} onClick={onInsert}>+</Button>
          <div className="flex-1 w-px bg-border" />
        </div>
      )}
    </div>
  );
}

function AddChannelDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onAdd(provider: 'twitch', channel: string): void;
}) {
  const [channel, setChannel] = useState('');

  function submit() {
    const trimmed = channel.trim().replace(/^#/, '').toLowerCase();
    if (!trimmed || !/^[a-zA-Z0-9_]{1,25}$/.test(trimmed)) return;
    onAdd('twitch', trimmed);
    setChannel('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setChannel(''); }}>
      <DialogContent className="flex flex-col gap-4 p-6" style={{ minWidth: '320px' }}>
        <DialogTitle>Add channel</DialogTitle>
        <div className="flex flex-col gap-3">
          <Input
            fluid
            autoFocus
            aria-label="Channel name"
            placeholder="channel name"
            value={channel}
            onChange={e => setChannel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') onOpenChange(false); }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>cancel</Button>
            <Button onClick={submit} disabled={!channel.trim()}>add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CastPanel() {
  const configData = useDeckStore(s => s.configData);
  const patchConfig = useDeckStore(s => s.patchConfig);
  const saveConfig = useDeckStore(s => s.saveConfig);

  const columns: CastColumnType[] = configData?.cast_columns ?? [];

  // Drive the chat connection manager from the configured columns. Runs on
  // mount and whenever the channel set changes — never on unmount — so feeds
  // keep accumulating in the background while the user is in another mode.
  const channelsKey = columns.filter(c => c.provider === 'twitch').map(c => c.channel).join('\n');
  useEffect(() => {
    syncCastChannels(channelsKey ? channelsKey.split('\n') : []);
  }, [channelsKey]);

  const [addDialog, setAddDialog] = useState<{ open: boolean; insertAt: number }>({ open: false, insertAt: 0 });
  const [reorderStatus, setReorderStatus] = useState('');
  // Insert position (0..columns.length) the dragged column would land at, or null.
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  function openAdd(insertAt: number) {
    setAddDialog({ open: true, insertAt });
  }

  function handleAdd(provider: 'twitch', channel: string) {
    const next: CastColumnType[] = [
      ...columns.slice(0, addDialog.insertAt),
      { provider, channel },
      ...columns.slice(addDialog.insertAt),
    ];
    patchConfig({ cast_columns: next });
    void saveConfig();
  }

  function handleCollapse(idx: number) {
    const toggled = columns.map((col, i) => {
      if (i !== idx) return col;
      if (col.collapsed) { const { collapsed: _, ...rest } = col; return rest; }
      return { ...col, collapsed: true as const };
    });
    patchConfig({ cast_columns: toggled });
    void saveConfig();
  }

  function handleRemove(idx: number) {
    const next = columns.filter((_, i) => i !== idx);
    patchConfig({ cast_columns: next });
    void saveConfig();
  }

  function handleReorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= columns.length || to >= columns.length) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    patchConfig({ cast_columns: next });
    void saveConfig();
    setReorderStatus(`${moved.channel} moved to position ${to + 1} of ${next.length}`);
  }

  // Drop onto a column boundary (insertAt in 0..columns.length).
  function handleColumnDrop(e: DragEvent, insertAt: number) {
    setDropTarget(null);
    const r = resolveColumnDrop(e, insertAt);
    if (!r) return;
    e.preventDefault();
    handleReorder(r.from, r.to);
  }

  const atMax = columns.length >= MAX_COLUMNS;

  return (
    <div className="flex-1 flex flex-col font-mono min-h-0">
      <div role="status" aria-live="polite" className="sr-only">{reorderStatus}</div>
      {/* Columns area */}
      <div
        className="flex-1 flex items-stretch overflow-x-auto overflow-y-hidden min-h-0"
        onDragLeave={(e: DragEvent) => {
          const related = e.relatedTarget instanceof Node ? e.relatedTarget : null;
          if (!e.currentTarget.contains(related)) setDropTarget(null);
        }}
      >
        {columns.length > 0 && (
          <ColumnGap
            insertAt={0}
            showDrop={dropTarget === 0}
            atMax={atMax}
            label="Add column at start"
            onInsert={() => openAdd(0)}
            onDragOver={setDropTarget}
            onDrop={handleColumnDrop}
          />
        )}

        {columns.map((col, idx) => (
          <Fragment key={`${col.provider}:${col.channel}`}>
            <CastColumn
              column={col}
              index={idx}
              count={columns.length}
              onCollapse={() => handleCollapse(idx)}
              onRemove={() => handleRemove(idx)}
              onReorder={handleReorder}
              onDragIndicator={setDropTarget}
            />
            <ColumnGap
              insertAt={idx + 1}
              showDrop={dropTarget === idx + 1}
              atMax={atMax}
              label={`Insert column after ${col.channel}`}
              onInsert={() => openAdd(idx + 1)}
              onDragOver={setDropTarget}
              onDrop={handleColumnDrop}
            />
          </Fragment>
        ))}

        {columns.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <Button variant="primary" onClick={() => openAdd(0)}>add channel</Button>
          </div>
        )}
      </div>

      {/* Add channel dialog */}
      <AddChannelDialog
        open={addDialog.open}
        onOpenChange={open => setAddDialog(s => ({ ...s, open }))}
        onAdd={handleAdd}
      />
    </div>
  );
}
