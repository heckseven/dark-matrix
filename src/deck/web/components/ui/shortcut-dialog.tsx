import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils.js';

const overlay =
  'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

const content =
  'fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ' +
  'font-mono text-xs text-foreground bg-background border border-foreground rounded p-5 w-[480px] max-w-[calc(100vw-2rem)] ' +
  'outline-none ' +
  'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
  'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

interface Row {
  label: string;
  keys: string;
}

const CANVAS: Row[] = [
  { label: 'draw / erase',  keys: 'space' },
  { label: 'flood fill',    keys: 'dbl / F' },
  { label: 'move cursor',   keys: '↑↓←→' },
  { label: 'zoom in / out', keys: '+ -' },
  { label: 'undo',          keys: '^Z' },
  { label: 'redo',          keys: '^Y' },
];

const PROJECT: Row[] = [
  { label: 'add frame',  keys: 'N' },
  { label: 'save',       keys: '^S' },
  { label: 'duplicate',  keys: '^⇧S' },
];

const MATRIX: Row[] = [
  { label: 'left',   keys: 'L' },
  { label: 'right',  keys: 'R' },
  { label: 'both',   keys: 'B' },
  { label: 'mirror', keys: 'M' },
];

const LIFE_SIM: Row[] = [
  { label: 'play / pause',  keys: 'space' },
  { label: 'step back',     keys: '[' },
  { label: 'step forward',  keys: ']' },
  { label: 'zoom in / out', keys: '+ -' },
];

function Col({ header, rows }: { header: string; rows: Row[] }) {
  const id = `shortcut-col-${header}`;
  return (
    <div className="flex-1 min-w-0">
      <div id={id} className="text-muted-foreground mb-2">{header}</div>
      <div className="border-t border-border mb-3" />
      <dl aria-labelledby={id} className="space-y-1.5">
        {rows.map(({ label, keys }) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="flex-1 text-foreground/80">{label}</dt>
            <dd className="shrink-0 text-foreground tabular-nums whitespace-nowrap">{keys}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ShortcutDialog({
  open,
  onOpenChange,
  dualModule = true,
  mode = 'design',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dualModule?: boolean;
  mode?: 'design' | 'life';
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content className={cn(content)} aria-describedby={undefined}>
          <DialogPrimitive.Title className="text-center mb-5 tracking-widest">
            <span aria-hidden="true">??? </span>shortcuts<span aria-hidden="true"> ???</span>
          </DialogPrimitive.Title>
          {mode === 'life' ? (
            <div className="flex gap-8">
              <Col header="simulation" rows={LIFE_SIM} />
              {dualModule && <Col header="matrix" rows={MATRIX} />}
            </div>
          ) : (
            <div className="flex gap-8">
              <Col header="canvas" rows={CANVAS} />
              <Col header="project" rows={PROJECT} />
              {dualModule && <Col header="matrix" rows={MATRIX} />}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
