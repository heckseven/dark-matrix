import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.js';
import { Button } from './ui/button.js';
import { MatrixPreview } from './MatrixPreview.js';
import type { DmxProject } from '../../format.js';

const ROWS = 34;
const EMPTY_9 = btoa(String.fromCharCode(...new Uint8Array(9 * ROWS)));

type LibraryEntry = {
  name: string;
  frames: string[];
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
      frames: proj.frames.map(f => f.pixels),
      width: proj.width,
    };
  } catch {
    return null;
  }
}

export interface LibraryPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (name: string, frame: string, width: 9 | 18) => void;
}

type View = { step: 'grid' } | { step: 'frames'; entry: LibraryEntry };

export function LibraryPickerModal({ open, onOpenChange, onPick }: LibraryPickerModalProps) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [view, setView] = useState<View>({ step: 'grid' });

  useEffect(() => {
    if (!open) return;
    setView({ step: 'grid' });
    setEntries(null);
    fetch('/api/library')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<{ ok: boolean; files: { name: string }[] }>; })
      .then(d => Promise.all((d.files ?? []).map(f => fetchEntry(f.name))))
      .then(results => setEntries(results.filter((e): e is LibraryEntry => e !== null)))
      .catch(() => setEntries([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handlePick(name: string, frame: string, width: 9 | 18) {
    onPick(name, frame, width);
    onOpenChange(false);
  }

  const inFrames = view.step === 'frames';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-h-[75vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {inFrames ? `Pick frame — ${view.entry.name}` : 'Pick design'}
        </DialogTitle>

        {/* header */}
        <div className="relative flex items-center shrink-0 px-3 py-2 border-b border-foreground/15">
          {inFrames ? (
            <Button
              variant="ghost"
              className="text-foreground/60 text-xs"
              aria-label="Back to library"
              onClick={() => setView({ step: 'grid' })}
            >
              ‹ library
            </Button>
          ) : (
            <span className="font-mono text-xs text-muted-foreground px-1">library</span>
          )}
          <span className="absolute inset-x-0 text-center font-mono text-xs text-foreground pointer-events-none">
            {inFrames ? view.entry.name : 'pick design'}
          </span>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-3">
          {view.step === 'grid' && (
            <>
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
                      onClick={() => {
                        if (entry.frames.length === 1) {
                          handlePick(entry.name, entry.frames[0]!, entry.width);
                        } else {
                          setView({ step: 'frames', entry });
                        }
                      }}
                    >
                      <MatrixPreview width={entry.width} pixels={entry.frames[0] ?? EMPTY_9} />
                      <span className="font-mono text-xs text-muted-foreground truncate max-w-full">{entry.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {view.step === 'frames' && (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${view.entry.width === 18 ? 100 : 52}px, max-content))` }}>
              {view.entry.frames.map((pixels, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Frame ${idx + 1}`}
                  className="flex flex-col gap-1 items-center p-2 rounded-sm hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                  onClick={() => handlePick(view.entry.name, pixels, view.entry.width)}
                >
                  <MatrixPreview width={view.entry.width} pixels={pixels} />
                  <span className="font-mono text-[10px] text-muted-foreground">{idx + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
