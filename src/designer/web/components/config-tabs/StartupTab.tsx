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

type StartupAnimation = 'gol-random' | 'scroll' | 'dmx' | 'none';

interface StartupValue {
  animation: StartupAnimation;
  scroll_text: string;
  dmx_path?: string;
}

interface StartupTabProps {
  value: StartupValue;
  onChange: (v: StartupValue) => void;
}

const ANIMATION_OPTIONS: { value: StartupAnimation; label: string }[] = [
  { value: 'gol-random', label: 'gol-random' },
  { value: 'scroll',     label: 'scroll' },
  { value: 'dmx',        label: 'dmx' },
  { value: 'none',       label: 'none' },
];

const FSIZE = 9 * 34;

function toB64(f: Uint8Array): string {
  let s = '';
  for (let i = 0; i < f.length; i++) s += String.fromCharCode(f[i]!);
  return btoa(s);
}

const BLANK = toB64(new Uint8Array(FSIZE));

function ScrollPrev({ text }: { text: string }) {
  const [px, setPx] = useState(BLANK);
  useEffect(() => {
    let dead = false;
    const a = createScrollAnimation({ text: text || ' ', size: 'small', loop: true, startOffset: 0 });
    const it = a[Symbol.asyncIterator]();
    const tick = () => void it.next().then((r: IteratorResult<ScrollFrame>) => {
      if (dead || r.done) return;
      setPx(toB64(r.value[0]));
      setTimeout(tick, 50);
    });
    tick();
    return () => { dead = true; a.stop(); };
  }, [text]);
  return <MatrixPreview pixels={px} width={9} />;
}

function GolPrev() {
  const [px, setPx] = useState(BLANK);
  useEffect(() => {
    let dead = false;
    const a = createGolAnimation({ loop: true });
    const it = a[Symbol.asyncIterator]();
    const tick = () => void it.next().then((r: IteratorResult<Frame>) => {
      if (dead || r.done) return;
      setPx(toB64(r.value));
      setTimeout(tick, 80);
    });
    tick();
    return () => { dead = true; a.stop(); };
  }, []);
  return <MatrixPreview pixels={px} width={9} />;
}

function DmxPrev({ asset }: { asset?: string }) {
  return (
    <div aria-hidden="true" className="flex items-center justify-center bg-black shrink-0" style={{ width: 43, height: 168 }}>
      <span className="font-mono text-center text-foreground/25 leading-tight break-all" style={{ fontSize: 7 }}>
        {asset?.replace('.dmx.json', '') ?? '—'}
      </span>
    </div>
  );
}

function NonePrev() {
  return (
    <div aria-hidden="true" className="flex items-center justify-center bg-black shrink-0" style={{ width: 43, height: 168 }}>
      <span className="font-mono text-foreground/15" style={{ fontSize: 8 }}>none</span>
    </div>
  );
}

function AnimPrev({ value }: { value: StartupValue }) {
  if (value.animation === 'scroll') return <ScrollPrev text={value.scroll_text} />;
  if (value.animation === 'gol-random') return <GolPrev />;
  if (value.animation === 'dmx') return <DmxPrev {...(value.dmx_path !== undefined ? { asset: value.dmx_path } : {})} />;
  return <NonePrev />;
}

type PreviewState = 'idle' | 'firing' | 'ok' | 'error';

export function StartupTab({ value, onChange }: StartupTabProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const assetDisplay = value.dmx_path ?? '';

  async function firePreview() {
    setPreviewState('firing');
    try {
      const res = await fetch('/api/startup-preview', { method: 'POST' });
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
        <AnimPrev value={value} />
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
