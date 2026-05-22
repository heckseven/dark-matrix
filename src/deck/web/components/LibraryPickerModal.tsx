import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.js';
import { MatrixPreview } from './MatrixPreview.js';
import type { DmxProject } from '../../format.js';

const ROWS = 34;
const EMPTY_9 = btoa(String.fromCharCode(...new Uint8Array(9 * ROWS)));

type LibraryEntry = {
  name: string;
  firstFrame: string;
  width: 9 | 18;
};

async function fetchEntry(name: string): Promise<LibraryEntry | null> {
  try {
    const proj = await fetch(`/api/library/${encodeURIComponent(name)}`).then(r => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json() as Promise<DmxProject>;
    });
    return {
      name,
      firstFrame: proj.frames[0]?.pixels ?? EMPTY_9,
      width: proj.width,
    };
  } catch {
    return null;
  }
}

export interface LibraryPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (name: string, firstFrame: string, width: 9 | 18) => void;
}

export function LibraryPickerModal({ open, onOpenChange, onPick }: LibraryPickerModalProps) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setEntries(null);
    fetch('/api/library')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<{ ok: boolean; files: { name: string }[] }>; })
      .then(d => Promise.all((d.files ?? []).map(f => fetchEntry(f.name))))
      .then(results => setEntries(results.filter((e): e is LibraryEntry => e !== null)))
      .catch(() => setEntries([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-h-[75vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Pick design</DialogTitle>

        <div className="relative flex items-center shrink-0 px-3 py-2 border-b border-foreground/15">
          <span className="font-mono text-xs text-muted-foreground px-1">library</span>
          <span className="absolute inset-x-0 text-center font-mono text-xs text-foreground pointer-events-none">
            pick design
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {entries === null && (
            <span className="font-mono text-xs text-muted-foreground">loading…</span>
          )}
          {entries !== null && entries.length === 0 && (
            <p className="font-mono text-xs text-muted-foreground">no designs in library</p>
          )}
          {entries !== null && entries.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {entries.map(entry => (
                <button
                  key={entry.name}
                  type="button"
                  aria-label={entry.name}
                  className={`relative flex flex-col gap-2 items-center p-2 w-full rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px] hover:bg-foreground/5${entry.width === 18 ? ' col-span-2' : ''}`}
                  onClick={() => { onPick(entry.name, entry.firstFrame, entry.width); onOpenChange(false); }}
                >
                  <MatrixPreview width={entry.width} pixels={entry.firstFrame} />
                  <span className="font-mono text-xs text-muted-foreground truncate max-w-full">{entry.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
