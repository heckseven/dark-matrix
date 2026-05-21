import { useEffect, useState } from 'react';
import { createScrollAnimation } from '../../../../animations/scroll.js';
import type { ScrollFrame } from '../../../../animations/scroll.js';
import { createGolAnimation } from '../../../../animations/gol.js';
import type { Frame } from '../../../../lib/frame.js';
import { MatrixPreview } from '../MatrixPreview.js';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { Button } from '../ui/button.js';
import { AssetPickerModal } from '../AssetPickerModal.js';
import { DmxPreview } from '../DmxPreview.js';

type StartupAnimation = 'gol-random' | 'scroll' | 'dmx' | 'none';

interface StartupValue {
  animation: StartupAnimation;
  scroll_text: string;
  dmx_path?: string;
  overlay_mode?: 'or' | 'replace' | 'xor' | 'halo';
  transition?: 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
  dmx_duration_ms?: number;
}

interface StartupTabProps {
  value: StartupValue;
  onChange: (v: StartupValue) => void;
  dualModule?: boolean;
}

const ANIMATION_OPTIONS: { value: StartupAnimation; label: string }[] = [
  { value: 'gol-random', label: 'gol-random' },
  { value: 'scroll',     label: 'scroll' },
  { value: 'dmx',        label: 'dmx' },
  { value: 'none',       label: 'none' },
];

const ROWS = 34;
const COLS = 9;

function toB64(f: Uint8Array): string {
  let s = '';
  for (let i = 0; i < f.length; i++) s += String.fromCharCode(f[i]!);
  return btoa(s);
}

function blankB64(cols: number) { return toB64(new Uint8Array(cols * ROWS)); }

function mergeFrames(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(18 * ROWS);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      out[c * ROWS + r]        = left[c * ROWS + r]  ?? 0;
      out[(c + COLS) * ROWS + r] = right[c * ROWS + r] ?? 0;
    }
  }
  return out;
}

function ScrollPrev({ text, dual }: { text: string; dual: boolean }) {
  const [px, setPx] = useState(() => blankB64(dual ? 18 : 9));
  useEffect(() => {
    setPx(blankB64(dual ? 18 : 9));
    let dead = false;
    const a = createScrollAnimation({ text: text || ' ', size: 'small', loop: true, startOffset: 0 });
    const it = a[Symbol.asyncIterator]();
    const tick = () => void it.next().then((r: IteratorResult<ScrollFrame>) => {
      if (dead || r.done) return;
      setPx(dual ? toB64(mergeFrames(r.value[0], r.value[1])) : toB64(r.value[0]));
      setTimeout(tick, 50);
    });
    tick();
    return () => { dead = true; a.stop(); };
  }, [text, dual]);
  return <MatrixPreview pixels={px} width={dual ? 18 : 9} />;
}

function GolPrev({ dual }: { dual: boolean }) {
  const [px, setPx] = useState(() => blankB64(dual ? 18 : 9));
  useEffect(() => {
    setPx(blankB64(dual ? 18 : 9));
    let dead = false;
    const aL = createGolAnimation({ loop: true });
    const aR = dual ? createGolAnimation({ loop: true }) : null;
    const itL = aL[Symbol.asyncIterator]();
    const itR = aR?.[Symbol.asyncIterator]();
    const tick = async () => {
      const rL = await itL.next();
      if (dead || rL.done) return;
      if (dual && itR) {
        const rR = await itR.next();
        if (dead || rR.done) return;
        setPx(toB64(mergeFrames(rL.value, rR.value)));
      } else {
        setPx(toB64(rL.value));
      }
      setTimeout(tick, 80);
    };
    void tick();
    return () => { dead = true; aL.stop(); aR?.stop(); };
  }, [dual]);
  return <MatrixPreview pixels={px} width={dual ? 18 : 9} />;
}

function NonePrev({ dual }: { dual: boolean }) {
  const w = dual ? 91 : 43;
  return (
    <div aria-hidden="true" className="flex items-center justify-center bg-black shrink-0" style={{ width: w, height: 168 }}>
      <span className="font-mono text-foreground/15" style={{ fontSize: 8 }}>none</span>
    </div>
  );
}

function AnimPrev({ value, dual }: { value: StartupValue; dual: boolean }) {
  if (value.animation === 'scroll') return <ScrollPrev text={value.scroll_text} dual={dual} />;
  if (value.animation === 'gol-random') return <GolPrev dual={dual} />;
  if (value.animation === 'dmx') return <DmxPreview filename={value.dmx_path} dual={dual} />;
  return <NonePrev dual={dual} />;
}

type PreviewState = 'idle' | 'firing' | 'ok' | 'error';

export function StartupTab({ value, onChange, dualModule = false }: StartupTabProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const assetDisplay = value.dmx_path ?? '';

  async function firePreview() {
    setPreviewState('firing');
    try {
      const res = await fetch('/api/startup-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      setPreviewState(res.ok ? 'ok' : 'error');
    } catch {
      setPreviewState('error');
    }
    setTimeout(() => setPreviewState('idle'), 2000);
  }

  return (
    <div className="flex flex-col gap-4 p-2">

      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted-foreground">preview</span>
        <AnimPrev value={value} dual={dualModule} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-xs text-muted-foreground">animation</label>
        <Select
          fluid
          aria-label="startup animation"
          value={value.animation}
          options={ANIMATION_OPTIONS}
          onValueChange={v => onChange({ ...value, animation: v as StartupAnimation })}
        />
      </div>

      {value.animation === 'scroll' && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-muted-foreground">
            text ({value.scroll_text.length}/100)
          </label>
          <Input
            fluid
            value={value.scroll_text}
            maxLength={100}
            onChange={e => onChange({ ...value, scroll_text: e.target.value })}
            aria-label="scroll text"
          />
        </div>
      )}

      {value.animation === 'dmx' && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-muted-foreground">asset</label>
          <div className="flex items-center gap-1.5">
            <Input
              fluid
              readOnly
              value={assetDisplay ? assetDisplay.replace('.dmx.json', '') : ''}
              placeholder="none"
              aria-label="Selected asset"
            />
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label={`Pick asset${assetDisplay ? ` (current: ${assetDisplay.replace('.dmx.json', '')})` : ''}`}
              onClick={() => setPickerOpen(true)}
            >
              pick
            </Button>
          </div>
        </div>
      )}

      {value.animation === 'dmx' && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-muted-foreground">blend</label>
          <Select
            fluid
            aria-label="Blend mode"
            value={value.overlay_mode ?? 'halo'}
            options={[
              { value: 'replace', label: 'replace' },
              { value: 'or',      label: 'additive' },
              { value: 'xor',     label: 'xor' },
              { value: 'halo',    label: 'halo' },
            ]}
            onValueChange={v => onChange({ ...value, overlay_mode: v as StartupValue['overlay_mode'] })}
          />
        </div>
      )}

      {value.animation === 'dmx' && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-muted-foreground">transition</label>
          <Select
            fluid
            aria-label="Transition"
            value={value.transition ?? 'dissolve'}
            options={[
              { value: 'none',    label: 'none' },
              { value: 'wipe',    label: 'wipe' },
              { value: 'scan',    label: 'scan' },
              { value: 'slide',   label: 'slide' },
              { value: 'dissolve',label: 'dissolve' },
              { value: 'flash',   label: 'flash' },
            ]}
            onValueChange={v => {
              const t = (v === 'wipe' || v === 'scan' || v === 'slide' || v === 'dissolve' || v === 'flash') ? v : undefined;
              onChange({ ...value, transition: t });
            }}
          />
        </div>
      )}

      {value.animation === 'dmx' && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-muted-foreground">duration</label>
          <Input
            fluid
            type="number"
            min="100"
            aria-label="Duration ms"
            value={value.dmx_duration_ms ?? 2000}
            suffix="ms"
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...value, dmx_duration_ms: isNaN(n) || n <= 0 ? undefined : n });
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-foreground/10 pt-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={previewState === 'firing' || value.animation === 'none'}
          onClick={() => void firePreview()}
        >
          {previewState === 'firing' ? 'firing…' : 'Test'}
        </Button>
        {previewState === 'ok' && <span className="font-mono text-xs text-green-400">● sent</span>}
        {previewState === 'error' && <span className="font-mono text-xs text-amber-400">◐ daemon unavailable</span>}
      </div>

      <AssetPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        {...(assetDisplay ? { current: assetDisplay } : {})}
        onPick={filename => onChange({ ...value, dmx_path: filename })}
      />
    </div>
  );
}
