import { useState, useEffect } from 'react';
import { createScrollAnimation } from '../../../animations/scroll.js';
import type { ScrollSize } from '../../../animations/scroll.js';
import { MatrixPreview } from './MatrixPreview.js';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';

const FRAME_SIZE = 9 * 34;

type NotifStyle = 'text' | 'image' | 'gif' | 'dmx';
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
  return { id: uid(), style: 'text', text: 'test notification', textSize: 'small', textPosition: 'bottom', overlayMode: 'replace', transition: 'none', assetPath: '', composite: 'replace', durationMs: 5000 };
}

// Runs createScrollAnimation in the browser — scroll.ts has no node: imports.
function ScrollPreview({ text, size }: { text: string; size: ScrollSize }) {
  const [pixels, setPixels] = useState(BLANK);

  useEffect(() => {
    let cancelled = false;
    const anim = createScrollAnimation({ text: text || ' ', size, loop: true, startOffset: 0 });
    const iter = anim[Symbol.asyncIterator]();
    function tick() {
      void iter.next().then(result => {
        if (cancelled || result.done) return;
        setPixels(frameToB64(result.value[0]));
        setTimeout(tick, 50);
      });
    }
    tick();
    return () => { cancelled = true; anim.stop(); };
  }, [text, size]);

  return <MatrixPreview pixels={pixels} width={9} />;
}

// Placeholder for styles that require hardware-side rendering (image/gif/dmx).
// Dimensions match MatrixPreview canvas (43×168 CSS px).
function HardwarePreview({ label }: { label: string }) {
  return (
    <div aria-hidden="true" className="flex items-center justify-center bg-black" style={{ width: 43, height: 168 }}>
      <span className="font-mono text-center text-foreground/25 leading-tight break-all" style={{ fontSize: 7 }}>
        {label || '—'}
      </span>
    </div>
  );
}

function NotifCell({
  cell,
  onClone,
  onRemove,
  onChange,
}: {
  cell: CellState;
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
        <Select aria-label="Notification style" value={cell.style} onChange={e => update({ style: e.target.value as NotifStyle })} className="flex-1">
          <option value="text">text</option>
          <option value="image">image</option>
          <option value="gif">gif</option>
          <option value="dmx">dmx</option>
        </Select>
        <Button variant="ghost" size="sm" aria-label="Clone" tooltip="Clone" onClick={onClone}>⎘</Button>
        <Button variant="destructive" size="sm" aria-label="Remove cell" tooltip="Remove" onClick={onRemove}>×</Button>
      </div>

      <div className="flex justify-center">
        {cell.style === 'text'
          ? <ScrollPreview text={cell.text} size={cell.textSize} />
          : <HardwarePreview label={cell.assetPath} />
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
          <span className="text-xs text-foreground/50">size</span>
          <Select aria-label="Text size" value={cell.textSize} onChange={e => update({ textSize: e.target.value as ScrollSize })}>
            <option value="tiny">tiny</option>
            <option value="small">small</option>
            <option value="medium">medium</option>
            <option value="large">large</option>
          </Select>
        </div>
        {cell.composite === 'overlay' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground/50">position</span>
            <Select aria-label="Text position" value={cell.textPosition} onChange={e => update({ textPosition: e.target.value as TextPosition })}>
              <option value="top">top</option>
              <option value="middle">middle</option>
              <option value="bottom">bottom</option>
            </Select>
            <span className="text-xs text-foreground/25">hw</span>
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
        <span className="text-xs text-foreground/50">composite</span>
        <Select aria-label="Composite mode" value={cell.composite} onChange={e => update({ composite: e.target.value as Composite })}>
          <option value="replace">replace</option>
          <option value="overlay">overlay</option>
        </Select>
        <span className="text-xs text-foreground/25">hw</span>
      </div>

      {cell.composite === 'overlay' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground/50">blend</span>
          <Select aria-label="Overlay blend mode" value={cell.overlayMode} onChange={e => update({ overlayMode: e.target.value as OverlayMode })}>
            <option value="replace">replace (black bg)</option>
            <option value="or">additive (HUD+text)</option>
            <option value="xor">invert (XOR)</option>
            <option value="halo">halo (black border)</option>
          </Select>
          <span className="text-xs text-foreground/25">hw</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground/50">transition</span>
        <Select aria-label="Transition" value={cell.transition} onChange={e => update({ transition: e.target.value as TransitionMode })}>
          <option value="none">none</option>
          <option value="wipe">wipe</option>
          <option value="scan">scan</option>
          <option value="slide">slide</option>
          <option value="dissolve">dissolve</option>
          <option value="flash">flash</option>
        </Select>
        <span className="text-xs text-foreground/25">hw</span>
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
            : <span className="text-foreground/50">→ {result.action}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function defaultDmxCell(): CellState {
  return { id: uid(), style: 'dmx', text: '', textSize: 'small', textPosition: 'bottom', overlayMode: 'replace', transition: 'wipe', assetPath: 'skulltalkk.dmx.json', composite: 'replace', durationMs: 5000 };
}

function defaultDmxOverlayCell(): CellState {
  return { id: uid(), style: 'dmx', text: '', textSize: 'small', textPosition: 'bottom', overlayMode: 'or', transition: 'none', assetPath: 'skulltalkk.dmx.json', composite: 'overlay', durationMs: 5000 };
}

export function NotificationLab() {
  const [cells, setCells] = useState<CellState[]>(() => [defaultCell(), defaultDmxCell(), defaultDmxOverlayCell()]);

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
    <div className="min-h-screen bg-background text-foreground p-5 font-mono">
      <div className="flex items-center gap-4 mb-5">
        <a href="?lab" className="text-xs text-foreground/50 hover:text-foreground transition-colors">← back to audio lab</a>
        <span className="text-xs text-foreground/50">notification lab</span>
        <Button variant="default" size="sm" aria-label="Add notification cell" onClick={addCell}>+ add cell</Button>
        <span className="text-xs text-foreground/50 ml-auto">text: live preview · image/gif/dmx: fire to hardware</span>
      </div>

      <div className="flex flex-wrap gap-3 items-start">
        {cells.map(cell => (
          <NotifCell
            key={cell.id}
            cell={cell}
            onClone={() => cloneCell(cell.id)}
            onRemove={() => removeCell(cell.id)}
            onChange={updated => updateCell(cell.id, updated)}
          />
        ))}
      </div>
    </div>
  );
}
