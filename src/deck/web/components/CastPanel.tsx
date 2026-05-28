import { Fragment, useState } from 'react';
import { useDeckStore } from '../store.js';
import type { CastColumn as CastColumnType } from '../types/config-types.js';
import { Button } from './ui/button.js';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.js';
import { Input } from './ui/input.js';
import { CastColumn } from './CastColumn.js';

const MAX_COLUMNS = 5;

function ColumnInsertButton({ onClick, label, hidden }: { onClick(): void; label: string; hidden: boolean }) {
  if (hidden) return null;
  return (
    <div className="flex flex-col items-center w-10 flex-shrink-0 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <div className="flex-1 w-px bg-border" />
      <Button variant="ghost" size="sm" aria-label={label} tooltip={label} onClick={onClick}>+</Button>
      <div className="flex-1 w-px bg-border" />
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

  const [addDialog, setAddDialog] = useState<{ open: boolean; insertAt: number }>({ open: false, insertAt: 0 });

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

  const atMax = columns.length >= MAX_COLUMNS;

  return (
    <div className="flex-1 flex flex-col bg-background font-mono min-h-0">
      {/* Columns area */}
      <div className="flex-1 flex items-stretch overflow-x-auto overflow-y-hidden min-h-0">
        <ColumnInsertButton
          hidden={atMax || columns.length === 0}
          label="Add column at start"
          onClick={() => openAdd(0)}
        />

        {columns.map((col, idx) => (
          <Fragment key={`${col.provider}:${col.channel}`}>
            <CastColumn
              column={col}
              onCollapse={() => handleCollapse(idx)}
              onRemove={() => handleRemove(idx)}
            />
            <ColumnInsertButton
              hidden={atMax}
              label={`Insert column after ${col.channel}`}
              onClick={() => openAdd(idx + 1)}
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
