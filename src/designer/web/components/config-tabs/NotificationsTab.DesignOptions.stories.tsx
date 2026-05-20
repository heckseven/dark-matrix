/**
 * Design options for the notification rule list — variations on option 2
 * (compact chip rows + popover editor), each exploring a different way
 * to integrate the animation preview.
 * Presentational mockups — controls are not wired to state.
 */
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useState, useEffect, useRef } from 'react';
import { createScrollAnimation } from '../../../../animations/scroll.js';
import type { ScrollSize } from '../../../../animations/scroll.js';
import { MatrixPreview } from '../MatrixPreview.js';
import { Button } from '../ui/button.js';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';
import type { NotificationRule } from './NotificationsTab.js';

const meta: Meta = {
  title: 'App/Config/Notifications/DesignOptions',
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof meta>;

// ── shared data ───────────────────────────────────────────────────────────────

const RULES: NotificationRule[] = [
  { source: 'ec-switch', content_glob: 'MIC*', animation: 'dmx', asset_path: 'skulltalkk.dmx.json', composite: 'overlay', overlay_mode: 'halo', transition: 'dissolve' },
  { source: 'desktop-notification', app_name_glob: 'Slack', animation: 'dmx', asset_path: 'alert.dmx.json', composite: 'overlay', overlay_mode: 'or', transition: 'wipe', duration_ms_override: 5000 },
  { source: 'desktop-notification', app_name_glob: '*', animation: 'scroll', composite: 'replace' },
  { source: 'vm', animation: 'none' },
];

// ── shared components ─────────────────────────────────────────────────────────

const FSIZE = 9 * 34;
function toB64(f: Uint8Array): string {
  let s = '';
  for (let i = 0; i < f.length; i++) s += String.fromCharCode(f[i]!);
  return btoa(s);
}
const BLANK = toB64(new Uint8Array(FSIZE));

function ScrollPrev({ text, size = 'small' }: { text: string; size?: ScrollSize }) {
  const [px, setPx] = useState(BLANK);
  useEffect(() => {
    let dead = false;
    const a = createScrollAnimation({ text: text || ' ', size, loop: true, startOffset: 0 });
    const it = a[Symbol.asyncIterator]();
    const tick = () => void it.next().then(r => { if (dead || r.done) return; setPx(toB64(r.value[0])); setTimeout(tick, 50); });
    tick();
    return () => { dead = true; a.stop(); };
  }, [text, size]);
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

function RulePrev({ rule }: { rule: NotificationRule }) {
  if (rule.animation === 'scroll') return <ScrollPrev text="test notification" />;
  if (rule.animation === 'dmx') return <DmxPrev {...(rule.asset_path !== undefined ? { asset: rule.asset_path } : {})} />;
  return (
    <div aria-hidden="true" className="flex items-center justify-center bg-black shrink-0" style={{ width: 43, height: 168 }}>
      <span className="font-mono text-foreground/15" style={{ fontSize: 8 }}>none</span>
    </div>
  );
}

// Center 43×43 crop of the 43×168 canvas. translateY(-63) = (168−43)/2.
function CropPrev({ rule }: { rule: NotificationRule }) {
  return (
    <div aria-hidden="true" style={{ width: 43, height: 43, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ transform: 'translateY(-63px)' }}>
        <RulePrev rule={rule} />
      </div>
    </div>
  );
}

function srcLabel(r: NotificationRule) {
  if (!r.source || r.source === 'desktop-notification') return r.app_name_glob || '*';
  if (r.source === 'ec-switch') return r.content_glob?.startsWith('CAM') ? 'cam' : 'mic';
  return r.source;
}

function animLabel(r: NotificationRule) {
  if (r.animation === 'none') return 'suppress';
  if (r.animation === 'dmx') return r.asset_path?.replace('.dmx.json', '') ?? 'dmx';
  return r.composite === 'overlay' ? 'scroll·overlay' : 'scroll';
}

function Chip({ children, dim, className }: { children: React.ReactNode; dim?: boolean; className?: string }) {
  return (
    <span className={`font-mono text-xs px-1.5 py-0.5 rounded-sm border whitespace-nowrap ${dim ? 'border-foreground/10 text-foreground/35' : 'border-foreground/25 text-foreground/65'}${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}

function OptionHeader({ n, title, note }: { n: string; title: string; note: string }) {
  return (
    <div className="mb-4 pb-3 border-b border-foreground/15">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-foreground/30">option {n}</span>
        <span className="font-mono text-sm text-foreground">{title}</span>
      </div>
      <p className="font-mono text-xs text-foreground/40 mt-0.5">{note}</p>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-foreground/45 w-20 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function RuleForm({ rule }: { rule: NotificationRule }) {
  return (
    <>
      <FormRow label="source">
        <Select aria-label="Source" value={rule.source ?? ''} onChange={() => undefined}>
          <option value="">any</option>
          <option value="desktop-notification">desktop</option>
          <option value="ec-switch">ec-switch</option>
          <option value="vm">vm</option>
          <option value="claude">claude</option>
        </Select>
      </FormRow>
      {(rule.source === 'desktop-notification' || !rule.source) && (
        <FormRow label="app">
          <Input aria-label="App glob" value={rule.app_name_glob ?? ''} placeholder="glob (*)" onChange={() => undefined} spellCheck={false} />
        </FormRow>
      )}
      {rule.source === 'ec-switch' && (
        <FormRow label="switch">
          <Select aria-label="Switch" value={rule.content_glob?.startsWith('CAM') ? 'cam' : 'mic'} onChange={() => undefined}>
            <option value="mic">mic</option>
            <option value="cam">cam</option>
          </Select>
        </FormRow>
      )}
      <FormRow label="animation">
        <Select aria-label="Animation" value={rule.animation} onChange={() => undefined}>
          <option value="scroll">scroll</option>
          <option value="dmx">dmx</option>
          <option value="none">none</option>
        </Select>
      </FormRow>
      {rule.animation === 'dmx' && (
        <>
          <FormRow label="asset">
            <Button variant="ghost" className="font-mono text-xs truncate max-w-[10rem]">
              {rule.asset_path?.replace('.dmx.json', '') ?? 'pick…'}
            </Button>
          </FormRow>
          <FormRow label="blend">
            <Select aria-label="Blend" value={rule.overlay_mode ?? 'replace'} onChange={() => undefined}>
              <option value="replace">replace</option>
              <option value="or">additive</option>
              <option value="xor">xor</option>
              <option value="halo">halo</option>
            </Select>
          </FormRow>
          <FormRow label="transition">
            <Select aria-label="Transition" value={rule.transition ?? 'none'} onChange={() => undefined}>
              <option value="none">none</option>
              <option value="wipe">wipe</option>
              <option value="scan">scan</option>
              <option value="slide">slide</option>
              <option value="dissolve">dissolve</option>
              <option value="flash">flash</option>
            </Select>
          </FormRow>
        </>
      )}
      {rule.animation === 'scroll' && (
        <FormRow label="composite">
          <Select aria-label="Composite" value={rule.composite ?? 'replace'} onChange={() => undefined}>
            <option value="replace">replace</option>
            <option value="overlay">overlay</option>
          </Select>
        </FormRow>
      )}
      <FormRow label="duration">
        <Input type="number" value={rule.duration_ms_override ?? ''} placeholder="default" onChange={() => undefined} style={{ width: '5rem' }} suffix="ms" />
      </FormRow>
    </>
  );
}

function SaveCancel({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex gap-2 pt-2 border-t border-foreground/10">
      <Button size="sm" onClick={onClose}>save</Button>
      <Button variant="ghost" size="sm" onClick={onClose}>cancel</Button>
    </div>
  );
}

// Compact chip summary for a row. Used as the baseline row content.
function RuleChips({ rule }: { rule: NotificationRule }) {
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <Chip>{srcLabel(rule)}</Chip>
      <span className="text-foreground/25 text-xs shrink-0">→</span>
      <Chip dim={rule.animation === 'none'}>{animLabel(rule)}</Chip>
      {rule.transition && <Chip dim>{rule.transition}</Chip>}
      {rule.duration_ms_override !== undefined && <Chip dim>{rule.duration_ms_override}ms</Chip>}
    </div>
  );
}

// ── option 2 ──────────────────────────────────────────────────────────────────

function O2() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="max-w-xl">
      <OptionHeader n="2" title="baseline — preview above form in popover"
        note="compact rows, chip summary. edit/delete appear on hover. edit opens a popover with preview stacked above the form." />
      <p className="font-mono text-xs text-foreground/35 mb-2">first match wins</p>
      <div className="flex flex-col">
        {RULES.map((rule, idx) => (
          <div key={idx} className="group flex items-center gap-2 py-1.5 border-b border-foreground/10 last:border-0">
            <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>
            <RuleChips rule={rule} />
            <Popover open={openIdx === idx} onOpenChange={v => setOpenIdx(v ? idx : null)}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"
                  className={`transition-opacity ${openIdx === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                  aria-label={`Edit rule ${idx + 1}`}>
                  edit
                </Button>
              </PopoverTrigger>
              <PopoverContent side="left" className="w-72 flex flex-col gap-3">
                <div className="flex justify-center pb-2 border-b border-foreground/10">
                  <RulePrev rule={rule} />
                </div>
                <div className="flex flex-col gap-2">
                  <RuleForm rule={rule} />
                </div>
                <SaveCancel onClose={() => setOpenIdx(null)} />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              tooltip="Delete rule"
              aria-label={`Delete rule ${idx + 1}`}>
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-2">+ add rule</Button>
    </div>
  );
}
/** Baseline. Compact chip rows. edit/× appear on hover. edit opens a narrow popover with the live preview stacked above the form. */
export const Option2Baseline: Story = { name: '2 · baseline — preview above form', render: () => <O2 /> };

// ── option 2b ─────────────────────────────────────────────────────────────────

function O2b() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="max-w-xl">
      <OptionHeader n="2b" title="live crop in every row"
        note="43×43 preview plays live in each row at all times. edit popover shows form only — preview is already visible." />
      <p className="font-mono text-xs text-foreground/35 mb-2">first match wins</p>
      <div className="flex flex-col">
        {RULES.map((rule, idx) => (
          <div key={idx} className="group flex items-center gap-2 py-1 border-b border-foreground/10 last:border-0">
            <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>
            <CropPrev rule={rule} />
            <RuleChips rule={rule} />
            <Popover open={openIdx === idx} onOpenChange={v => setOpenIdx(v ? idx : null)}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"
                  className={`transition-opacity ${openIdx === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                  aria-label={`Edit rule ${idx + 1}`}>
                  edit
                </Button>
              </PopoverTrigger>
              <PopoverContent side="left" className="w-64 flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <RuleForm rule={rule} />
                </div>
                <SaveCancel onClose={() => setOpenIdx(null)} />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              tooltip="Delete rule"
              aria-label={`Delete rule ${idx + 1}`}>
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-2">+ add rule</Button>
    </div>
  );
}
/** A 43×43 crop of the live animation plays in every row. The edit popover shows only the form — the preview is already in view. */
export const Option2bLiveInRow: Story = { name: '2b · live crop in every row', render: () => <O2b /> };

// ── option 2c ─────────────────────────────────────────────────────────────────

function O2c() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="max-w-xl">
      <OptionHeader n="2c" title="wide popover — preview beside form"
        note="popover is 440 px wide. preview and form sit side-by-side with no vertical stacking." />
      <p className="font-mono text-xs text-foreground/35 mb-2">first match wins</p>
      <div className="flex flex-col">
        {RULES.map((rule, idx) => (
          <div key={idx} className="group flex items-center gap-2 py-1.5 border-b border-foreground/10 last:border-0">
            <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>
            <RuleChips rule={rule} />
            <Popover open={openIdx === idx} onOpenChange={v => setOpenIdx(v ? idx : null)}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"
                  className={`transition-opacity ${openIdx === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                  aria-label={`Edit rule ${idx + 1}`}>
                  edit
                </Button>
              </PopoverTrigger>
              <PopoverContent side="left" className="p-0 overflow-hidden" style={{ width: 440 }}>
                <div className="flex">
                  <div className="flex flex-col items-center justify-center gap-2 px-4 bg-black/20 border-r border-foreground/10 shrink-0">
                    <RulePrev rule={rule} />
                    <span className="font-mono text-foreground/25 text-center" style={{ fontSize: 9 }}>
                      {animLabel(rule)}
                    </span>
                  </div>
                  <div className="flex-1 p-3 flex flex-col gap-2">
                    <RuleForm rule={rule} />
                    <SaveCancel onClose={() => setOpenIdx(null)} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              tooltip="Delete rule"
              aria-label={`Delete rule ${idx + 1}`}>
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-2">+ add rule</Button>
    </div>
  );
}
/** Compact rows unchanged. The popover widens to 440 px and shows the full live preview and form side-by-side. Both have more breathing room than the stacked layout. */
export const Option2cWidePopover: Story = { name: '2c · wide popover — preview beside form', render: () => <O2c /> };

// ── option 2d ─────────────────────────────────────────────────────────────────

function O2d() {
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="max-w-xl">
      <OptionHeader n="2d" title="hover row to preview, click edit to configure"
        note="hovering a row shows the live preview floating to the right. edit opens a form-only popover." />
      <p className="font-mono text-xs text-foreground/35 mb-2">first match wins</p>
      <div className="flex flex-col">
        {RULES.map((rule, idx) => (
          <div key={idx}
            className="group relative flex items-center gap-2 py-1.5 border-b border-foreground/10 last:border-0"
            onMouseEnter={() => setHovIdx(idx)}
            onMouseLeave={() => setHovIdx(null)}
          >
            <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>
            <RuleChips rule={rule} />
            <Popover open={openIdx === idx} onOpenChange={v => setOpenIdx(v ? idx : null)}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"
                  className={`transition-opacity ${openIdx === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                  aria-label={`Edit rule ${idx + 1}`}>
                  edit
                </Button>
              </PopoverTrigger>
              <PopoverContent side="left" className="w-64 flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <RuleForm rule={rule} />
                </div>
                <SaveCancel onClose={() => setOpenIdx(null)} />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              tooltip="Delete rule"
              aria-label={`Delete rule ${idx + 1}`}>
              ×
            </Button>
            {hovIdx === idx && openIdx === null && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 flex flex-col items-center gap-1.5 p-2 border border-foreground/20 bg-background rounded shadow-lg pointer-events-none">
                <RulePrev rule={rule} />
                <span className="font-mono text-foreground/30 text-center" style={{ fontSize: 9 }}>
                  {animLabel(rule)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-2">+ add rule</Button>
    </div>
  );
}
/** Hover a row to see the live preview floating to the right — no clicking needed to evaluate a rule. edit opens a compact form-only popover. The two gestures are intentionally separated. */
export const Option2dHoverPreview: Story = { name: '2d · hover row to preview', render: () => <O2d /> };

// ── option 2e ─────────────────────────────────────────────────────────────────

function O2e() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="max-w-xl">
      <OptionHeader n="2e" title="preview is the edit button"
        note="the live preview crop in each row is the only edit affordance — clicking it opens the wide popover. no separate edit button." />
      <p className="font-mono text-xs text-foreground/35 mb-2">first match wins</p>
      <div className="flex flex-col">
        {RULES.map((rule, idx) => (
          <div key={idx} className="group flex items-center gap-2 py-1 border-b border-foreground/10 last:border-0">
            <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>
            <Popover open={openIdx === idx} onOpenChange={v => setOpenIdx(v ? idx : null)}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Edit rule ${idx + 1}: ${srcLabel(rule)} → ${animLabel(rule)}`}
                  className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60 hover:opacity-75 transition-opacity"
                >
                  <CropPrev rule={rule} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="left" className="p-0 overflow-hidden" style={{ width: 440 }}>
                <div className="flex">
                  <div className="flex flex-col items-center justify-center gap-2 px-4 bg-black/20 border-r border-foreground/10 shrink-0">
                    <RulePrev rule={rule} />
                    <span className="font-mono text-foreground/25 text-center" style={{ fontSize: 9 }}>
                      {animLabel(rule)}
                    </span>
                  </div>
                  <div className="flex-1 p-3 flex flex-col gap-2">
                    <RuleForm rule={rule} />
                    <SaveCancel onClose={() => setOpenIdx(null)} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <RuleChips rule={rule} />
            <Button variant="ghost" size="sm"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              tooltip="Delete rule"
              aria-label={`Delete rule ${idx + 1}`}>
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-2">+ add rule</Button>
    </div>
  );
}
/** The preview crop is the only edit trigger — clicking it opens the wide popover. No separate edit button. One fewer control, and the affordance is self-documenting. */
export const Option2ePreviewIsButton: Story = { name: '2e · preview is the edit button', render: () => <O2e /> };

// ── option 2f ─────────────────────────────────────────────────────────────────

function O2f() {
  const [railIdx, setRailIdx] = useState(0);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const railRule = RULES[railIdx]!;
  return (
    <div className="max-w-xl">
      <OptionHeader n="2f" title="persistent preview rail"
        note="a preview rail below the list always shows one rule's animation. hover to switch. edit opens a form-only popover." />
      <p className="font-mono text-xs text-foreground/35 mb-2">first match wins</p>
      <div className="flex flex-col">
        {RULES.map((rule, idx) => (
          <div key={idx}
            className={`group flex items-center gap-2 py-1.5 border-b border-foreground/10 last:border-0 transition-colors ${railIdx === idx ? 'bg-white/[0.03]' : ''}`}
            onMouseEnter={() => setRailIdx(idx)}
          >
            <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>
            <RuleChips rule={rule} />
            <Popover open={openIdx === idx} onOpenChange={v => setOpenIdx(v ? idx : null)}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"
                  className={`transition-opacity ${openIdx === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                  aria-label={`Edit rule ${idx + 1}`}>
                  edit
                </Button>
              </PopoverTrigger>
              <PopoverContent side="left" className="w-64 flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <RuleForm rule={rule} />
                </div>
                <SaveCancel onClose={() => setOpenIdx(null)} />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              tooltip="Delete rule"
              aria-label={`Delete rule ${idx + 1}`}>
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-2 mb-4">+ add rule</Button>
      <div className="flex items-start gap-4 pt-4 border-t border-foreground/15">
        <RulePrev rule={railRule} />
        <div className="flex flex-col gap-2 pt-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip>{srcLabel(railRule)}</Chip>
            <span className="text-foreground/25 text-xs">→</span>
            <Chip dim={railRule.animation === 'none'}>{animLabel(railRule)}</Chip>
          </div>
          {railRule.animation === 'dmx' && (
            <div className="flex flex-wrap gap-1.5">
              {railRule.overlay_mode && <Chip dim>{railRule.overlay_mode}</Chip>}
              {railRule.transition && <Chip dim>{railRule.transition}</Chip>}
            </div>
          )}
          {railRule.duration_ms_override !== undefined && (
            <span className="font-mono text-xs text-foreground/35">{railRule.duration_ms_override}ms</span>
          )}
          <span className="font-mono text-foreground/20 mt-1" style={{ fontSize: 9 }}>hover a rule to preview it</span>
        </div>
      </div>
    </div>
  );
}
/** A preview rail below the list always shows one rule's live animation. Hovering any row updates the rail. edit opens a form-only popover. The preview never competes with the form. */
export const Option2fPreviewRail: Story = { name: '2f · persistent preview rail', render: () => <O2f /> };

// ── option 2g ─────────────────────────────────────────────────────────────────
// Hovering the action chip lifts preview state to the row level; the preview
// panel is rendered to the left of the whole list so it never overlaps rows.

function AnimChipWithPreview({ rule, onHover }: { rule: NotificationRule; onHover: (active: boolean) => void }) {
  return (
    <span className="inline-flex items-center min-w-0"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}>
      <Chip className="max-w-[10rem] overflow-hidden text-ellipsis inline-block">{animLabel(rule)}</Chip>
    </span>
  );
}

function O2g() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  return (
    <div className="flex justify-center py-4">
      <div className="relative">
        {hoverIdx !== null && hoverY !== null && RULES[hoverIdx] !== undefined && (
          <div
            className="absolute right-full mr-6 -translate-y-1/2 flex flex-col items-center gap-1.5 p-2 border border-foreground/20 bg-background rounded shadow-lg pointer-events-none z-50"
            style={{ top: hoverY }}
          >
            <RulePrev rule={RULES[hoverIdx]!} />
            <span className="font-mono text-foreground/30 text-center" style={{ fontSize: 9 }}>
              {animLabel(RULES[hoverIdx]!)}
            </span>
          </div>
        )}
        <div className="max-w-[800px] w-full">
          <OptionHeader n="2g" title="hover chip to preview"
            note="hovering 'skulltalkk', 'scroll', or 'suppress' shows the animation to the left of the list. no click required." />
          <p className="font-mono text-xs text-foreground/35 mb-2">first match wins</p>
          <div className="flex flex-col">
            {RULES.map((rule, idx) => (
              <div
                key={idx}
                ref={(el: HTMLDivElement | null) => { rowRefs.current[idx] = el; }}
                className="group flex items-center gap-2 py-1.5 border-b border-foreground/10 last:border-0"
              >
                <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <Chip className="shrink-0">{srcLabel(rule)}</Chip>
                  <span className="text-xs shrink-0">→</span>
                  <AnimChipWithPreview rule={rule} onHover={v => {
                    if (v) {
                      const el = rowRefs.current[idx];
                      setHoverY(el ? el.offsetTop + el.offsetHeight / 2 : null);
                      setHoverIdx(idx);
                    } else {
                      setHoverIdx(null);
                      setHoverY(null);
                    }
                  }} />
                  {rule.transition && <Chip className="shrink-0">{rule.transition}</Chip>}
                  {rule.duration_ms_override !== undefined && <Chip className="shrink-0">{rule.duration_ms_override}ms</Chip>}
                </div>
                <Popover open={openIdx === idx} onOpenChange={v => setOpenIdx(v ? idx : null)}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm"
                      className={`transition-opacity ${openIdx === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                      aria-label={`Edit rule ${idx + 1}`}>
                      edit
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="left" className="w-64 flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      <RuleForm rule={rule} />
                    </div>
                    <SaveCancel onClose={() => setOpenIdx(null)} />
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="sm"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  tooltip="Delete rule"
                  aria-label={`Delete rule ${idx + 1}`}>
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-2">+ add rule</Button>
        </div>
      </div>
    </div>
  );
}
/** Hovering the action chip ("skulltalkk", "scroll", "suppress") shows the live animation to the left of the list. edit opens a form-only popover. */
export const Option2gChipHoverPreview: Story = { name: '2g · hover chip to preview', render: () => <O2g /> };
