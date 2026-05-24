import { useState, useEffect } from 'react';
import { createScrollAnimation } from '../../../animations/scroll.js';
import type { ScrollSize } from '../../../animations/scroll.js';
import { MatrixPreview } from './MatrixPreview.js';
import { DmxPreview } from './DmxPreview.js';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';

const ROWS = 34;
const COLS = 9;
const FRAME_SIZE = COLS * ROWS;

type NotifStyle = 'text' | 'dmx';
type Composite = 'replace' | 'overlay';
type TextPosition = 'top' | 'middle' | 'bottom';
type OverlayMode = 'or' | 'replace' | 'xor' | 'halo';
type TransitionMode = 'none' | 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
type FireResult = { action: string } | { error: string };

type CellState = {
  id: string;
  style: NotifStyle;
  text: string;
  textSize: ScrollSize;
  textPosition: TextPosition;
  overlayMode: OverlayMode;
  transition: TransitionMode;
  assetPath: string;
  composite: Composite;
  durationMs: number;
};

function uid(): string { return crypto.randomUUID(); }

function frameToB64(frame: Uint8Array): string {
  let s = '';
  for (let i = 0; i < frame.length; i++) s += String.fromCharCode(frame[i]!);
  return btoa(s);
}

const BLANK = frameToB64(new Uint8Array(FRAME_SIZE));

function defaultCell(): CellState {
  return { id: uid(), style: 'text', text: 'test notification', textSize: 'small', textPosition: 'bottom', overlayMode: 'replace', transition: 'none', assetPath: '', composite: 'replace', durationMs: 2000 };
}

function mergeFrames(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(18 * ROWS);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++) {
      out[c * ROWS + r]          = left[c * ROWS + r]  ?? 0;
      out[(c + COLS) * ROWS + r] = right[c * ROWS + r] ?? 0;
    }
  return out;
}

// Runs createScrollAnimation in the browser — scroll.ts has no node: imports.
function ScrollPreview({ text, size, dual = false }: { text: string; size: ScrollSize; dual?: boolean }) {
  const [pixels, setPixels] = useState(() => frameToB64(new Uint8Array((dual ? 18 : 9) * ROWS)));

  useEffect(() => {
    setPixels(frameToB64(new Uint8Array((dual ? 18 : 9) * ROWS)));
    let cancelled = false;
    const anim = createScrollAnimation({ text: text || ' ', size, loop: true, startOffset: 0 });
    const iter = anim[Symbol.asyncIterator]();
    function tick() {
      void iter.next().then(result => {
        if (cancelled || result.done) return;
        setPixels(frameToB64(dual ? mergeFrames(result.value[0], result.value[1]) : result.value[0]));
        setTimeout(tick, 50);
      });
    }
    tick();
    return () => { cancelled = true; anim.stop(); };
  }, [text, size, dual]);

  return <MatrixPreview pixels={pixels} width={dual ? 18 : 9} />;
}


function NotifCell({
  cell,
  dual,
  onClone,
  onRemove,
  onChange,
}: {
  cell: CellState;
  dual: boolean;
  onClone: () => void;
  onRemove: () => void;
  onChange: (updated: CellState) => void;
}) {
  const [firing, setFiring] = useState(false);
  const [result, setResult] = useState<FireResult | null>(null);

  function update(patch: Partial<CellState>) {
    onChange({ ...cell, ...patch });
    setResult(null);
  }

  async function fire() {
    setFiring(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        summary: cell.text || 'test',
        style: cell.style,
        composite: cell.composite,
        durationMsOverride: cell.durationMs,
      };
      if (cell.style === 'text') body['textSize'] = cell.textSize;
      if (cell.style === 'text' && cell.composite === 'overlay') body['textPosition'] = cell.textPosition;
      if (cell.composite === 'overlay') body['overlayMode'] = cell.overlayMode;
      if (cell.transition !== 'none') body['transition'] = cell.transition;
      if (cell.assetPath) body['assetPath'] = cell.assetPath;
      const res = await fetch('/api/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; action?: string; error?: string };
      setResult(data.ok ? { action: data.action ?? cell.style } : { error: data.error ?? 'failed' });
    } catch {
      setResult({ error: 'request failed' });
    } finally {
      setFiring(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 p-3 border border-border rounded bg-background" style={{ minWidth: 180 }}>
      <div className="flex items-center gap-1">
        <Select
          aria-label="Notification style"
          value={cell.style}
          options={[{ value: 'text', label: 'text' }, { value: 'dmx', label: 'dmx' }]}
          onValueChange={v => update({ style: v as NotifStyle })}
          className="flex-1"
        />
        <Button variant="ghost" size="sm" aria-label="Clone" tooltip="Clone" onClick={onClone}>⎘</Button>
        <Button variant="destructive" size="sm" aria-label="Remove cell" tooltip="Remove" onClick={onRemove}>×</Button>
      </div>

      <div className="flex justify-center">
        {cell.style === 'text'
          ? <ScrollPreview text={cell.text} size={cell.textSize} dual={dual} />
          : <DmxPreview filename={cell.assetPath || undefined} dual={dual} />
        }
      </div>

      {cell.style === 'text' && <>
        <Input
          label="text"
          value={cell.text}
          onChange={e => update({ text: e.target.value })}
          spellCheck={false}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">size</span>
          <Select
            aria-label="Text size"
            value={cell.textSize}
            options={[{ value: 'tiny', label: 'tiny' }, { value: 'small', label: 'small' }, { value: 'medium', label: 'medium' }, { value: 'large', label: 'large' }]}
            onValueChange={v => update({ textSize: v as ScrollSize })}
          />
        </div>
        {cell.composite === 'overlay' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">position</span>
            <Select
              aria-label="Text position"
              value={cell.textPosition}
              options={[{ value: 'top', label: 'top' }, { value: 'middle', label: 'middle' }, { value: 'bottom', label: 'bottom' }]}
              onValueChange={v => update({ textPosition: v as TextPosition })}
            />
            <abbr title="hardware" className="text-xs text-muted-foreground no-underline">hw</abbr>
          </div>
        )}
      </>}

      {cell.style !== 'text' && (
        <Input
          label="asset"
          placeholder="filename"
          value={cell.assetPath}
          onChange={e => update({ assetPath: e.target.value })}
          spellCheck={false}
        />
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">composite</span>
        <Select
          aria-label="Composite mode"
          value={cell.composite}
          options={[{ value: 'replace', label: 'replace' }, { value: 'overlay', label: 'overlay' }]}
          onValueChange={v => update({ composite: v as Composite })}
        />
        <abbr title="hardware" className="text-xs text-muted-foreground no-underline">hw</abbr>
      </div>

      {cell.composite === 'overlay' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">blend</span>
          <Select
            aria-label="Overlay blend mode"
            value={cell.overlayMode}
            options={[
              { value: 'replace', label: 'replace (black bg)' },
              { value: 'or', label: 'additive (HUD+text)' },
              { value: 'xor', label: 'invert (XOR)' },
              { value: 'halo', label: 'halo (black border)' },
            ]}
            onValueChange={v => update({ overlayMode: v as OverlayMode })}
          />
          <abbr title="hardware" className="text-xs text-muted-foreground no-underline">hw</abbr>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">transition</span>
        <Select
          aria-label="Transition"
          value={cell.transition}
          options={[
            { value: 'none', label: 'none' },
            { value: 'wipe', label: 'wipe' },
            { value: 'scan', label: 'scan' },
            { value: 'slide', label: 'slide' },
            { value: 'dissolve', label: 'dissolve' },
            { value: 'flash', label: 'flash' },
          ]}
          onValueChange={v => update({ transition: v as TransitionMode })}
        />
        <abbr title="hardware" className="text-xs text-muted-foreground no-underline">hw</abbr>
      </div>

      <Input
        label="dur"
        type="number"
        value={cell.durationMs}
        min={500}
        max={30000}
        step={500}
        onChange={e => update({ durationMs: Math.max(500, Number(e.target.value)) })}
        suffix="ms · hw"
        className="w-14"
      />

      <div className="flex items-center gap-2">
        <Button disabled={firing} onClick={() => void fire()}>
          {firing ? 'firing…' : 'fire'}
        </Button>
        <span className="font-mono text-xs" aria-live="polite" aria-atomic="true">
          {result && ('error' in result
            ? <span className="text-red-400">{result.error}</span>
            : <span className="text-muted-foreground">→ {result.action}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function defaultDmxCell(): CellState {
  return { id: uid(), style: 'dmx', text: '', textSize: 'small', textPosition: 'bottom', overlayMode: 'halo', transition: 'wipe', assetPath: 'skulltalkk.dmx.json', composite: 'replace', durationMs: 2000 };
}

function defaultDmxOverlayCell(): CellState {
  return { id: uid(), style: 'dmx', text: '', textSize: 'small', textPosition: 'bottom', overlayMode: 'halo', transition: 'none', assetPath: 'skulltalkk.dmx.json', composite: 'overlay', durationMs: 2000 };
}

export function NotificationLab() {
  const [cells, setCells] = useState<CellState[]>(() => [defaultCell(), defaultDmxCell(), defaultDmxOverlayCell()]);
  const [dual, setDual] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json() as Promise<{ config?: { modules?: { left?: string; right?: string } } }>)
      .then(d => setDual(!!(d.config?.modules?.left && d.config?.modules?.right)))
      .catch(() => {});
  }, []);

  function addCell() { setCells(cs => [...cs, defaultCell()]); }

  function cloneCell(id: string) {
    setCells(cs => {
      const idx = cs.findIndex(c => c.id === id);
      if (idx === -1) return cs;
      const src = cs[idx]!;
      return [...cs.slice(0, idx + 1), { ...src, id: uid() }, ...cs.slice(idx + 1)];
    });
  }

  function removeCell(id: string) { setCells(cs => cs.filter(c => c.id !== id)); }

  function updateCell(id: string, updated: CellState) {
    setCells(cs => cs.map(c => c.id === id ? updated : c));
  }

  return (
    <div className="p-5">
      <div className="flex items-center gap-4 mb-5">
        <Button variant="default" size="sm" aria-label="Add notification cell" onClick={addCell}>+ add cell</Button>
        <span className="text-xs text-muted-foreground ml-auto">text: live preview · dmx: fire to hardware</span>
      </div>

      <div className="flex flex-wrap gap-3 items-start">
        {cells.map(cell => (
          <NotifCell
            key={cell.id}
            cell={cell}
            dual={dual}
            onClone={() => cloneCell(cell.id)}
            onRemove={() => removeCell(cell.id)}
            onChange={updated => updateCell(cell.id, updated)}
          />
        ))}
      </div>
    </div>
  );
}
