import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetMeta } from '../../../../lib/asset-meta.js';
import { createScrollAnimation } from '../../../../animations/scroll.js';
import type { ScrollFrame, ScrollSize } from '../../../../animations/scroll.js';
import { MatrixPreview } from '../MatrixPreview.js';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { Button } from '../ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';
import { AssetPickerModal } from '../AssetPickerModal.js';
import { DmxPreview } from '../DmxPreview.js';

export type NotificationRule = {
  source?: 'ec-switch' | 'vm' | 'claude' | 'desktop-notification' | 'manual';
  app_name_glob?: string;
  urgency?: 'low' | 'normal' | 'critical' | 'any';
  content_glob?: string;
  animation: 'scroll' | 'dmx' | 'none';
  scroll_text?: string;
  scroll_size?: ScrollSize;
  asset_path?: string;
  composite?: 'replace' | 'overlay';
  overlay_mode?: 'or' | 'replace' | 'xor' | 'halo';
  transition?: 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
  duration_ms_override?: number;
  loop_count?: number;
  mirror?: boolean;
  side?: 'left' | 'right';
  dmx_path?: string;
};

export type NotificationsTabProps = {
  value: NotificationRule[];
  onChange: (rules: NotificationRule[]) => void;
  dualModule?: boolean;
};

type RowProps = {
  rule: NotificationRule;
  idx: number;
  total: number;
  onUpdate: (rule: NotificationRule) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  editOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
  history: Record<string, string[]>;
  refreshHistory: () => Promise<void>;
};

type RulePatch = { [K in keyof NotificationRule]+?: NotificationRule[K] | undefined };

function buildRule(base: NotificationRule, changes: RulePatch): NotificationRule {
  const merged = { ...base, ...changes };
  const src = merged.source;
  const anim: NotificationRule['animation'] = merged.animation ?? base.animation;
  const needsAsset = anim === 'dmx';
  const isDesktop = src === 'desktop-notification' || src === undefined;

  const result: NotificationRule = { animation: anim };
  if (src !== undefined) result.source = src;

  if (isDesktop) {
    if (merged.app_name_glob !== undefined && merged.app_name_glob !== '') result.app_name_glob = merged.app_name_glob;
    if (merged.urgency !== undefined && merged.urgency !== 'any') result.urgency = merged.urgency;
  } else {
    if (merged.content_glob !== undefined && merged.content_glob !== '') result.content_glob = merged.content_glob;
  }

  if (needsAsset) {
    const assetVal = merged.asset_path ?? merged.dmx_path;
    if (assetVal !== undefined && assetVal !== '') result.asset_path = assetVal;
    if (merged.loop_count !== undefined && merged.loop_count >= 1) result.loop_count = merged.loop_count;
    if (merged.mirror === true) result.mirror = true;
    if (!merged.mirror && merged.side !== undefined) result.side = merged.side;
  }

  if (anim === 'scroll') {
    if (merged.scroll_text !== undefined && merged.scroll_text !== '') result.scroll_text = merged.scroll_text;
    if (merged.scroll_size !== undefined && merged.scroll_size !== 'small') result.scroll_size = merged.scroll_size;
  }

  if (anim !== 'none' && merged.composite !== undefined && merged.composite !== 'replace') {
    result.composite = merged.composite;
  }

  if (anim === 'dmx') {
    if (merged.overlay_mode !== undefined) result.overlay_mode = merged.overlay_mode;
    if (merged.transition !== undefined) result.transition = merged.transition;
  }

  if (merged.duration_ms_override !== undefined && merged.duration_ms_override > 0) {
    result.duration_ms_override = merged.duration_ms_override;
  }

  return result;
}

// ec-switch events produce content strings like "MIC ON", "MIC OFF", "CAM ON", "CAM OFF".
type SwitchState = 'on' | 'off' | 'any';

function virtualSource(rule: NotificationRule): string {
  if (rule.source === 'ec-switch') {
    return (rule.content_glob ?? '').startsWith('CAM') ? 'cam-switch' : 'mic-switch';
  }
  return rule.source ?? '';
}

function switchState(glob?: string): SwitchState {
  if (glob?.endsWith(' ON')) return 'on';
  if (glob?.endsWith(' OFF')) return 'off';
  return 'any';
}

function toSwitchGlob(prefix: 'MIC' | 'CAM', state: SwitchState): string {
  if (state === 'on') return `${prefix} ON`;
  if (state === 'off') return `${prefix} OFF`;
  return `${prefix}*`;
}

type ClaudeEventKind = 'any' | 'tool' | 'agent' | 'idle' | 'input';

function claudeEventKind(glob?: string): ClaudeEventKind {
  if (!glob) return 'any';
  if (glob === 'IDLE') return 'idle';
  if (glob === 'INPUT') return 'input';
  if (glob.startsWith('TOOL')) return 'tool';
  if (glob.startsWith('AGENT')) return 'agent';
  return 'any';
}

function claudeEventSuffix(glob?: string): string {
  if (glob?.startsWith('TOOL ')) return glob.slice(5);
  if (glob?.startsWith('AGENT ')) return glob.slice(6);
  return '*';
}

function toClaudeGlob(kind: ClaudeEventKind, suffix: string): string | undefined {
  if (kind === 'idle') return 'IDLE';
  if (kind === 'input') return 'INPUT';
  if (kind === 'tool') return `TOOL ${suffix || '*'}`;
  if (kind === 'agent') return `AGENT ${suffix || '*'}`;
  return undefined;
}

type TimingMode = 'default' | 'loops' | 'duration';

function timingMode(rule: NotificationRule): TimingMode {
  if (rule.loop_count !== undefined) return 'loops';
  if (rule.duration_ms_override !== undefined) return 'duration';
  return 'default';
}

// ── chip summary helpers ──────────────────────────────────────────────────────

function srcLabel(r: NotificationRule): string {
  if (!r.source || r.source === 'desktop-notification') return r.app_name_glob || '*';
  if (r.source === 'ec-switch') return r.content_glob?.startsWith('CAM') ? 'cam' : 'mic';
  return r.source;
}

function animLabel(r: NotificationRule): string {
  if (r.animation === 'none') return 'suppress';
  if (r.animation === 'dmx') return r.asset_path?.replace(/^library\//, '').replace('.dmx.json', '') ?? 'dmx';
  return r.composite === 'overlay' ? 'scroll·overlay' : 'scroll';
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-xs px-1.5 py-0.5 rounded-sm border border-foreground/25 text-foreground/65 whitespace-nowrap${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}

// ── live preview ──────────────────────────────────────────────────────────────

const ROWS = 34;
const COLS = 9;
function toB64(f: Uint8Array): string {
  let s = '';
  for (let i = 0; i < f.length; i++) s += String.fromCharCode(f[i]!);
  return btoa(s);
}
function blankB64(dual: boolean) { return toB64(new Uint8Array((dual ? 18 : 9) * ROWS)); }
function mergeFrames(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(18 * ROWS);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++) {
      out[c * ROWS + r]          = left[c * ROWS + r]  ?? 0;
      out[(c + COLS) * ROWS + r] = right[c * ROWS + r] ?? 0;
    }
  return out;
}

function ScrollPrev({ text = 'test notification', size = 'small', dual = false }: { text?: string; size?: ScrollSize; dual?: boolean }) {
  const [px, setPx] = useState(() => blankB64(dual));
  useEffect(() => {
    setPx(blankB64(dual));
    let dead = false;
    const a = createScrollAnimation({ text: text || ' ', size, loop: true, startOffset: 0 });
    const it = a[Symbol.asyncIterator]();
    const tick = () => void it.next().then((r: IteratorResult<ScrollFrame>) => {
      if (dead || r.done) return;
      setPx(toB64(dual ? mergeFrames(r.value[0], r.value[1]) : r.value[0]));
      setTimeout(tick, 50);
    });
    tick();
    return () => { dead = true; a.stop(); };
  }, [text, size, dual]);
  return <MatrixPreview pixels={px} width={dual ? 18 : 9} />;
}

function RulePrev({ rule, dual }: { rule: NotificationRule; dual: boolean }) {
  const w = dual ? 91 : 43;
  if (rule.animation === 'scroll') return <ScrollPrev {...(rule.scroll_text ? { text: rule.scroll_text } : {})} {...(rule.scroll_size ? { size: rule.scroll_size } : {})} dual={dual} />;
  if (rule.animation === 'dmx') return <DmxPreview filename={rule.asset_path} dual={dual} {...(rule.mirror ? { mirror: true } : {})} {...(rule.side ? { side: rule.side } : {})} />;
  return (
    <div aria-hidden="true" className="flex items-center justify-center bg-black shrink-0" style={{ width: w, height: 168 }}>
      <span className="font-mono text-foreground/15" style={{ fontSize: 8 }}>none</span>
    </div>
  );
}

// ── form helpers ──────────────────────────────────────────────────────────────

type NotificationHistory = Record<string, string[]>;

function isHistoryShape(v: unknown): v is NotificationHistory {
  if (typeof v !== 'object' || v === null) return false;
  for (const value of Object.values(v as Record<string, unknown>)) {
    if (!Array.isArray(value) || !value.every(x => typeof x === 'string')) return false;
  }
  return true;
}

function useNotificationHistory(): { history: NotificationHistory; refresh: () => Promise<void> } {
  const [history, setHistory] = useState<NotificationHistory>({});
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/notification-history');
      if (!r.ok) return;
      const data: unknown = await r.json();
      if (isHistoryShape(data)) setHistory(data);
    } catch { /* daemon unreachable */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { history, refresh };
}

function RecentExamplesButton({ items, onPick, refresh }: {
  items: string[];
  onPick: (value: string) => void;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function focusItem(idx: number) {
    const len = items.length;
    if (len === 0) return;
    const wrapped = ((idx % len) + len) % len;
    itemRefs.current[wrapped]?.focus();
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) void refresh(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2"
          aria-label="Recent examples"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Recent examples"
        >
          <span aria-hidden="true">recent</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-[260px] p-1"
        onOpenAutoFocus={(e) => {
          if (items.length > 0) {
            e.preventDefault();
            requestAnimationFrame(() => itemRefs.current[0]?.focus());
          }
        }}
      >
        {items.length === 0 ? (
          <div role="status" className="px-2 py-1.5 font-mono text-xs text-muted-foreground">
            no examples yet
          </div>
        ) : (
          <ul
            className="flex flex-col"
            role="menu"
            onKeyDown={(e) => {
              const active = document.activeElement;
              const idx = itemRefs.current.findIndex(b => b === active);
              if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(idx + 1); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(idx - 1); }
              else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
              else if (e.key === 'End') { e.preventDefault(); focusItem(items.length - 1); }
            }}
          >
            {items.map((item, i) => (
              <li key={item} role="none">
                <button
                  ref={(el) => { itemRefs.current[i] = el; }}
                  type="button"
                  role="menuitem"
                  className="w-full text-left font-mono text-xs px-2 py-1.5 rounded hover:bg-accent truncate"
                  onClick={() => { onPick(item); setOpen(false); }}
                  aria-label={item}
                  title={item}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ── rule row ──────────────────────────────────────────────────────────────────

function RuleRow({ rule, idx, total, onUpdate, onDelete, onMoveUp, onMoveDown, editOpen, onEditOpenChange, onHoverEnter, onHoverLeave, rowRef, history, refreshHistory }: RowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerOpenRef = useRef(false);
  useEffect(() => { pickerOpenRef.current = pickerOpen; }, [pickerOpen]);
  const [assetWidth, setAssetWidth] = useState<9 | 18 | null>(null);
  useEffect(() => {
    const path = rule.asset_path;
    if (!path) { setAssetWidth(null); return; }
    fetch(`/api/assets/${encodeURIComponent(path)}`)
      .then(r => r.ok ? r.json() as Promise<{ ok: boolean; asset: AssetMeta }> : Promise.reject())
      .then(d => setAssetWidth(d.asset.width))
      .catch(() => setAssetWidth(null));
  }, [rule.asset_path]);

  const [testState, setTestState] = useState<'idle' | 'firing' | 'ok' | 'err'>('idle');
  async function fireTest() {
    if (rule.animation === 'none') return;
    setTestState('firing');
    try {
      const body: Record<string, unknown> = {};
      if (rule.animation === 'dmx') {
        body['style'] = 'dmx';
        if (rule.asset_path) body['assetPath'] = rule.asset_path;
        if (rule.composite) body['composite'] = rule.composite;
        if (rule.overlay_mode) body['overlayMode'] = rule.overlay_mode;
        if (rule.transition) body['transition'] = rule.transition;
        if (rule.loop_count !== undefined) body['loopCount'] = rule.loop_count;
        if (rule.mirror !== undefined) body['mirror'] = rule.mirror;
        if (rule.side !== undefined) body['side'] = rule.side;
        if (rule.duration_ms_override !== undefined) body['durationMsOverride'] = rule.duration_ms_override;
      } else {
        body['style'] = 'text';
        body['summary'] = rule.scroll_text || 'test notification';
        if (rule.composite) body['composite'] = rule.composite;
        if (rule.duration_ms_override !== undefined) body['durationMsOverride'] = rule.duration_ms_override;
      }
      const r = await fetch('/api/test-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setTestState(r.ok ? 'ok' : 'err');
    } catch {
      setTestState('err');
    }
    setTimeout(() => setTestState('idle'), 1500);
  }
  const assetDisplay = rule.asset_path ?? rule.dmx_path ?? '';
  const durationDisplay = rule.duration_ms_override !== undefined ? String(rule.duration_ms_override) : '';
  const vSrc = virtualSource(rule);
  const isMicSwitch = vSrc === 'mic-switch';
  const isCamSwitch = vSrc === 'cam-switch';
  const isDesktop = rule.source === 'desktop-notification' || rule.source === undefined;
  const isClaude = rule.source === 'claude';

  function handleSourceChange(newVirt: string) {
    if (newVirt === 'mic-switch') {
      const state = (isMicSwitch || isCamSwitch) ? switchState(rule.content_glob) : 'any';
      onUpdate(buildRule(rule, { source: 'ec-switch', content_glob: toSwitchGlob('MIC', state) }));
    } else if (newVirt === 'cam-switch') {
      const state = (isMicSwitch || isCamSwitch) ? switchState(rule.content_glob) : 'any';
      onUpdate(buildRule(rule, { source: 'ec-switch', content_glob: toSwitchGlob('CAM', state) }));
    } else {
      const newSrc = (newVirt === '' || newVirt === 'any') ? undefined : newVirt as NotificationRule['source'];
      const patch: RulePatch = { source: newSrc };
      if (isMicSwitch || isCamSwitch) patch.content_glob = '';
      onUpdate(buildRule(rule, patch));
    }
  }

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={`Rule ${idx + 1}`}
      className="group flex items-center gap-2 py-1.5 border-b border-foreground/10 last:border-b-0"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>

      {/* chip summary */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <Chip className="shrink-0">{srcLabel(rule)}</Chip>
        <span className="text-xs shrink-0">→</span>
        <Chip className="max-w-[10rem] overflow-hidden text-ellipsis inline-block shrink-0">{animLabel(rule)}</Chip>
        {rule.transition && <Chip className="shrink-0">{rule.transition}</Chip>}
        {rule.loop_count !== undefined && <Chip className="shrink-0">{rule.loop_count}×</Chip>}
        {rule.loop_count === undefined && rule.duration_ms_override !== undefined && <Chip className="shrink-0">{rule.duration_ms_override}ms</Chip>}
      </div>

      {/* reorder — hover visible */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="sm" aria-label={`Move rule ${idx + 1} up`} disabled={idx === 0} onClick={onMoveUp}>↑</Button>
        <Button variant="ghost" size="sm" aria-label={`Move rule ${idx + 1} down`} disabled={idx === total - 1} onClick={onMoveDown}>↓</Button>
      </div>

      {/* test button */}
      {rule.animation !== 'none' && (
        <Button
          variant="ghost"
          size="sm"
          className={`transition-opacity font-mono tabular-nums shrink-0 ${testState === 'idle' ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : 'opacity-100'}`}
          aria-label={`Test rule ${idx + 1}`}
          disabled={testState === 'firing'}
          onClick={() => void fireTest()}
        >
          {testState === 'firing' ? '…' : testState === 'ok' ? 'ok' : testState === 'err' ? 'err' : 'test'}
        </Button>
      )}

      {/* edit popover */}
      <Popover open={editOpen} onOpenChange={onEditOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`transition-opacity ${editOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
            aria-label={`Edit rule ${idx + 1}`}
          >
            edit
          </Button>
        </PopoverTrigger>
        <PopoverContent side="left" className="w-[360px] flex flex-col gap-3" onInteractOutside={e => { if (pickerOpenRef.current) e.preventDefault(); }}>
          <div className="flex flex-col gap-2">
            {/* source */}
            <FormRow label="source">
              <Select
                fluid
                aria-label="Source"
                value={vSrc === '' ? 'any' : vSrc}
                options={[
                  { value: 'any', label: 'any source' },
                  { value: 'desktop-notification', label: 'desktop' },
                  { value: 'mic-switch', label: 'mic switch' },
                  { value: 'cam-switch', label: 'cam switch' },
                  { value: 'vm', label: 'vm' },
                  { value: 'claude', label: 'claude' },
                  { value: 'manual', label: 'manual' },
                ]}
                onValueChange={handleSourceChange}
              />
            </FormRow>

            {/* app glob */}
            {isDesktop && (
              <FormRow label="app">
                <div className="flex items-center gap-1">
                  <Input
                    fluid
                    aria-label="App name glob"
                    placeholder="glob (*)"
                    value={rule.app_name_glob ?? ''}
                    onChange={e => onUpdate(buildRule(rule, { app_name_glob: e.target.value }))}
                    spellCheck={false}
                  />
                  <RecentExamplesButton
                    items={history['desktop-notification'] ?? []}
                    refresh={refreshHistory}
                    onPick={(v) => onUpdate(buildRule(rule, { app_name_glob: v }))}
                  />
                </div>
              </FormRow>
            )}

            {/* urgency */}
            {isDesktop && (
              <FormRow label="urgency">
                <Select
                  fluid
                  aria-label="Urgency"
                  value={rule.urgency ?? 'any'}
                  options={[{ value: 'any', label: 'any' }, { value: 'low', label: 'low' }, { value: 'normal', label: 'normal' }, { value: 'critical', label: 'critical' }]}
                  onValueChange={v => onUpdate(buildRule(rule, { urgency: (v === 'low' || v === 'normal' || v === 'critical') ? v : 'any' }))}
                />
              </FormRow>
            )}

            {/* switch state */}
            {(isMicSwitch || isCamSwitch) && (
              <FormRow label="state">
                <Select
                  fluid
                  aria-label="Switch state"
                  value={switchState(rule.content_glob)}
                  options={[{ value: 'any', label: 'any' }, { value: 'on', label: 'on' }, { value: 'off', label: 'off' }]}
                  onValueChange={v => {
                    const state: SwitchState = (v === 'on' || v === 'off') ? v : 'any';
                    const prefix = isMicSwitch ? 'MIC' : 'CAM';
                    onUpdate(buildRule(rule, { content_glob: toSwitchGlob(prefix, state) }));
                  }}
                />
              </FormRow>
            )}

            {/* claude event selector */}
            {isClaude && (() => {
              const kind = claudeEventKind(rule.content_glob);
              const suffix = claudeEventSuffix(rule.content_glob);
              const hasSuffix = kind === 'tool' || kind === 'agent';
              return (
                <>
                  <FormRow label="event">
                    <Select
                      fluid
                      aria-label="Claude event type"
                      value={kind}
                      options={[
                        { value: 'any', label: 'any' },
                        { value: 'tool', label: 'TOOL' },
                        { value: 'agent', label: 'AGENT' },
                        { value: 'idle', label: 'IDLE' },
                        { value: 'input', label: 'INPUT' },
                      ]}
                      onValueChange={v => {
                        const next = v as ClaudeEventKind;
                        onUpdate(buildRule(rule, { content_glob: toClaudeGlob(next, suffix) }));
                      }}
                    />
                  </FormRow>
                  {hasSuffix && (
                    <FormRow label="match">
                      <Input
                        fluid
                        aria-label={`${kind === 'tool' ? 'Tool' : 'Agent'} name glob`}
                        placeholder="* (any)"
                        value={suffix === '*' ? '' : suffix}
                        onChange={e => {
                          onUpdate(buildRule(rule, { content_glob: toClaudeGlob(kind, e.target.value || '*') }));
                        }}
                        spellCheck={false}
                      />
                    </FormRow>
                  )}
                </>
              );
            })()}

            {/* content glob — non-desktop, non-switch, non-claude */}
            {!isDesktop && !isMicSwitch && !isCamSwitch && !isClaude && (
              <FormRow label="content">
                <div className="flex items-center gap-1">
                  <Input
                    fluid
                    aria-label="Content glob"
                    placeholder="glob (*)"
                    value={rule.content_glob ?? ''}
                    onChange={e => onUpdate(buildRule(rule, { content_glob: e.target.value }))}
                    spellCheck={false}
                  />
                  <RecentExamplesButton
                    items={history[rule.source ?? ''] ?? []}
                    refresh={refreshHistory}
                    onPick={(v) => onUpdate(buildRule(rule, { content_glob: v }))}
                  />
                </div>
              </FormRow>
            )}

            {/* animation */}
            <FormRow label="animation">
              <Select
                fluid
                aria-label="Animation"
                value={rule.animation}
                options={[{ value: 'scroll', label: 'scroll' }, { value: 'dmx', label: 'dmx' }, { value: 'none', label: 'none' }]}
                onValueChange={v => {
                  if (v === 'dmx') {
                    onUpdate(buildRule(rule, { animation: 'dmx', transition: 'dissolve', overlay_mode: 'halo', composite: 'overlay' }));
                  } else if (v === 'scroll' || v === 'none') {
                    onUpdate(buildRule(rule, { animation: v }));
                  }
                }}
              />
            </FormRow>

            {/* scroll text — scroll only */}
            {rule.animation === 'scroll' && (
              <FormRow label="text">
                <Input
                  fluid
                  aria-label="Scroll text"
                  placeholder="notification text"
                  value={rule.scroll_text ?? ''}
                  onChange={e => onUpdate(buildRule(rule, { scroll_text: e.target.value }))}
                  spellCheck={false}
                />
              </FormRow>
            )}

            {/* scroll size — scroll only */}
            {rule.animation === 'scroll' && (
              <FormRow label="size">
                <Select
                  fluid
                  aria-label="Text size"
                  value={rule.scroll_size ?? 'small'}
                  options={[
                    { value: 'tiny', label: 'tiny' },
                    { value: 'small', label: 'small' },
                    { value: 'medium', label: 'medium' },
                    { value: 'large', label: 'large' },
                  ]}
                  onValueChange={v => {
                    const s: ScrollSize | undefined = (v === 'tiny' || v === 'small' || v === 'medium' || v === 'large') ? v : undefined;
                    onUpdate(buildRule(rule, { scroll_size: s }));
                  }}
                />
              </FormRow>
            )}

            {/* asset — dmx only */}
            {rule.animation === 'dmx' && (
              <FormRow label="asset">
                <div className="flex items-center gap-1.5 w-full">
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
              </FormRow>
            )}

            {/* mirror — dmx only */}
            {rule.animation === 'dmx' && (
              <FormRow label="mirror">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rule.mirror === true}
                    onChange={e => onUpdate(buildRule(rule, { mirror: e.target.checked || undefined, ...(e.target.checked ? { side: undefined } : {}) }))}
                    className="w-3.5 h-3.5 accent-foreground"
                    aria-label="Mirror animation on second panel"
                  />
                  <span className="font-mono text-xs text-muted-foreground">mirror on second panel</span>
                </label>
              </FormRow>
            )}

            {/* side — dmx, single-panel, no mirror */}
            {rule.animation === 'dmx' && assetWidth === 9 && !rule.mirror && (
              <FormRow label="side">
                <Select
                  fluid
                  aria-label="Panel side"
                  value={rule.side ?? 'both'}
                  options={[
                    { value: 'both', label: 'both' },
                    { value: 'left', label: 'left' },
                    { value: 'right', label: 'right' },
                  ]}
                  onValueChange={v => onUpdate(buildRule(rule, { side: (v === 'left' || v === 'right') ? v : undefined }))}
                />
              </FormRow>
            )}

            {/* blend — dmx only */}
            {rule.animation === 'dmx' && (
              <FormRow label="blend">
                <Select
                  fluid
                  aria-label="Blend"
                  value={rule.overlay_mode ?? (rule.composite === 'overlay' ? 'or' : 'replace')}
                  options={[{ value: 'replace', label: 'replace' }, { value: 'or', label: 'additive' }, { value: 'xor', label: 'xor' }, { value: 'halo', label: 'halo' }]}
                  onValueChange={v => {
                    if (v === 'replace') {
                      onUpdate(buildRule(rule, { composite: 'replace', overlay_mode: undefined }));
                    } else {
                      onUpdate(buildRule(rule, { composite: 'overlay', overlay_mode: v as 'or' | 'xor' | 'halo' }));
                    }
                  }}
                />
              </FormRow>
            )}

            {/* transition — dmx only */}
            {rule.animation === 'dmx' && (
              <FormRow label="transition">
                <Select
                  fluid
                  aria-label="Transition"
                  value={rule.transition ?? 'none'}
                  options={[
                    { value: 'none', label: 'none' },
                    { value: 'wipe', label: 'wipe' },
                    { value: 'scan', label: 'scan' },
                    { value: 'slide', label: 'slide' },
                    { value: 'dissolve', label: 'dissolve' },
                    { value: 'flash', label: 'flash' },
                  ]}
                  onValueChange={v => {
                    const t: NotificationRule['transition'] = (v === 'wipe' || v === 'scan' || v === 'slide' || v === 'dissolve' || v === 'flash') ? v : undefined;
                    onUpdate(buildRule(rule, { transition: t }));
                  }}
                />
              </FormRow>
            )}

            {/* composite — scroll only */}
            {rule.animation === 'scroll' && (
              <FormRow label="composite">
                <Select
                  fluid
                  aria-label="Composite"
                  value={rule.composite ?? 'replace'}
                  options={[{ value: 'replace', label: 'replace' }, { value: 'overlay', label: 'overlay' }]}
                  onValueChange={v => onUpdate(buildRule(rule, { composite: v === 'overlay' ? 'overlay' : 'replace' }))}
                />
              </FormRow>
            )}

            {/* timing — DMX: loops / duration / default */}
            {rule.animation === 'dmx' && (() => {
              const mode = timingMode(rule);
              return (
                <>
                  <FormRow label="timing">
                    <Select
                      fluid
                      aria-label="Timing mode"
                      value={mode}
                      options={[
                        { value: 'default', label: 'default' },
                        { value: 'loops', label: 'loops' },
                        { value: 'duration', label: 'duration ms' },
                      ]}
                      onValueChange={v => {
                        if (v === 'loops') onUpdate(buildRule(rule, { loop_count: rule.loop_count ?? 1, duration_ms_override: undefined }));
                        else if (v === 'duration') onUpdate(buildRule(rule, { duration_ms_override: rule.duration_ms_override ?? 5000, loop_count: undefined }));
                        else onUpdate(buildRule(rule, { loop_count: undefined, duration_ms_override: undefined }));
                      }}
                    />
                  </FormRow>
                  {mode === 'loops' && (
                    <FormRow label="count">
                      <Input
                        fluid
                        aria-label="Loop count"
                        type="number"
                        min="1"
                        placeholder="1"
                        value={rule.loop_count !== undefined ? String(rule.loop_count) : ''}
                        onChange={e => {
                          const n = parseInt(e.target.value, 10);
                          onUpdate(buildRule(rule, { loop_count: isNaN(n) || n < 1 ? 1 : n }));
                        }}
                      />
                    </FormRow>
                  )}
                  {mode === 'duration' && (
                    <FormRow label="duration">
                      <Input
                        fluid
                        aria-label="Duration override ms"
                        type="number"
                        min="100"
                        placeholder="default"
                        value={durationDisplay}
                        suffix="ms"
                        onChange={e => {
                          const n = parseInt(e.target.value, 10);
                          onUpdate(buildRule(rule, { duration_ms_override: isNaN(n) || n <= 0 ? undefined : n }));
                        }}
                      />
                    </FormRow>
                  )}
                </>
              );
            })()}

            {/* duration — scroll / none */}
            {rule.animation !== 'dmx' && (
              <FormRow label="duration">
                <Input
                  fluid
                  aria-label="Duration override ms"
                  type="number"
                  min="100"
                  placeholder="default"
                  value={durationDisplay}
                  suffix="ms"
                  onChange={e => {
                    const n = parseInt(e.target.value, 10);
                    onUpdate(buildRule(rule, { duration_ms_override: isNaN(n) || n <= 0 ? undefined : n }));
                  }}
                />
              </FormRow>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-foreground/10">
            <Button size="sm" onClick={() => onEditOpenChange(false)}>done</Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* delete */}
      <Button
        variant="ghost"
        size="sm"
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        tooltip="Delete rule"
        aria-label={`Delete rule ${idx + 1}`}
        onClick={onDelete}
      >
        ×
      </Button>

      {/* asset picker modal — portalled, always mounted so it survives animation type changes */}
      <AssetPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        {...(assetDisplay ? { current: assetDisplay } : {})}
        onPick={filename => onUpdate(buildRule(rule, { asset_path: filename }))}
      />
    </div>
  );
}

// ── tab ───────────────────────────────────────────────────────────────────────

export function NotificationsTab({ value, onChange, dualModule = false }: NotificationsTabProps) {
  const idsRef = useRef<string[]>(value.map(() => crypto.randomUUID()));
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [editOpenIdx, setEditOpenIdx] = useState<number | null>(null);
  const { history, refresh: refreshHistory } = useNotificationHistory();

  function addRule() {
    onChange([...value, { animation: 'scroll' as const }]);
    idsRef.current = [...idsRef.current, crypto.randomUUID()];
    setEditOpenIdx(value.length);
  }

  function updateRule(idx: number, rule: NotificationRule) {
    const next = [...value];
    next[idx] = rule;
    onChange(next);
  }

  function deleteRule(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
    idsRef.current = idsRef.current.filter((_, i) => i !== idx);
  }

  function moveRule(from: number, to: number) {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    const ids = [...idsRef.current];
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id!);
    idsRef.current = ids;
    onChange(next);
  }

  return (
    <div className="flex flex-col p-2">
      <p className="font-mono text-xs text-white/55 mb-2">
        first match wins — default when no rules match: scroll (replace)
      </p>

      <div className="relative">
        {/* hover preview — floats left of the list */}
        {hoverIdx !== null && hoverY !== null && editOpenIdx !== hoverIdx && value[hoverIdx] !== undefined && (
          <div
            className="absolute right-full mr-6 -translate-y-1/2 flex flex-col items-center gap-1.5 p-2 border border-foreground/20 bg-background rounded shadow-lg pointer-events-none z-50"
            style={{ top: hoverY }}
          >
            <RulePrev rule={value[hoverIdx]!} dual={dualModule} />
            <span className="font-mono text-foreground/30 text-center" style={{ fontSize: 9 }}>
              {animLabel(value[hoverIdx]!)}
            </span>
          </div>
        )}

        <div className="flex flex-col">
          {value.map((rule, idx) => (
            <RuleRow
              key={idsRef.current[idx] ?? String(idx)}
              rule={rule}
              idx={idx}
              total={value.length}
              history={history}
              refreshHistory={refreshHistory}
              onUpdate={r => updateRule(idx, r)}
              onDelete={() => deleteRule(idx)}
              onMoveUp={() => moveRule(idx, idx - 1)}
              onMoveDown={() => moveRule(idx, idx + 1)}
              editOpen={editOpenIdx === idx}
              onEditOpenChange={v => setEditOpenIdx(v ? idx : null)}
              onHoverEnter={() => {
                const el = rowRefs.current[idx];
                setHoverY(el ? el.offsetTop + el.offsetHeight / 2 : null);
                setHoverIdx(idx);
              }}
              onHoverLeave={() => { setHoverIdx(null); setHoverY(null); }}
              rowRef={(el: HTMLDivElement | null) => { rowRefs.current[idx] = el; }}
            />
          ))}
        </div>

        <div className="h-10 flex items-center gap-1 px-1">
          <div aria-hidden="true" className="flex-1 h-px bg-border" />
          <Button variant="ghost" aria-label="Add rule" tooltip="Add rule" onClick={addRule}>+</Button>
          <div aria-hidden="true" className="flex-1 h-px bg-border" />
        </div>
      </div>

      <div className="font-mono text-xs text-muted-foreground flex flex-col gap-1 border-t border-foreground/10 mt-4 pt-4">
        <p className="text-foreground/60 mb-1">assets</p>
        <p>assets live in <span className="text-foreground/70">~/.config/dark-matrix/assets/</span> — use the picker to browse or import images/GIFs as DMX</p>

        <p className="text-foreground/60 mt-3 mb-1">finding a desktop app name</p>
        <p>sniff the next real notification from any app:</p>
        <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1 whitespace-pre-wrap">{'dbus-monitor --session "interface=\'org.freedesktop.Notifications\',member=\'Notify\'"'}</pre>
        <p className="mt-1">or fire a synthetic one to test a specific name:</p>
        <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1">{'notify-send --app-name="Slack" "hello"'}</pre>
      </div>

      <TestNotification rules={value} />
    </div>
  );
}

function TestNotification({ rules }: { rules: NotificationRule[] }) {
  const [appName, setAppName] = useState('');
  const [firing, setFiring] = useState(false);
  const [result, setResult] = useState<{ action: string } | { error: string } | null>(null);

  async function fire() {
    setFiring(true);
    setResult(null);
    try {
      const res = await fetch('/api/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName: appName || '*', summary: 'test notification' }),
      });
      const data = await res.json() as { ok: boolean; action?: string; error?: string };
      setResult(data.ok ? { action: data.action ?? 'scroll' } : { error: data.error ?? 'request failed' });
    } catch {
      setResult({ error: 'request failed' });
    } finally {
      setFiring(false);
    }
  }

  const matchedRule = rules.find(r => {
    const glob = r.app_name_glob ?? '*';
    const name = appName || '*';
    if (glob === '*') return true;
    if (glob === name) return true;
    return false;
  });

  return (
    <div className="mt-4 pt-4 border-t border-foreground/10 flex flex-col gap-2">
      <span className="font-mono text-xs text-muted-foreground">test notification</span>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Test app name"
          placeholder="app name (or * for default)"
          value={appName}
          onChange={e => { setAppName(e.target.value); setResult(null); }}
          spellCheck={false}
        />
        <Button aria-label="Fire test notification" variant="ghost" disabled={firing} onClick={() => void fire()}>
          {firing ? 'firing…' : 'fire'}
        </Button>
        <span aria-live="polite" className="font-mono text-xs">
          {result && (
            'error' in result
              ? <span className="text-red-400">{result.error}</span>
              : <span className="text-foreground/60">→ {result.action}{result.action === 'none' ? ' (suppressed)' : ''}</span>
          )}
        </span>
      </div>
      <span aria-live="polite" className="font-mono text-xs text-muted-foreground">
        {appName && matchedRule && !result && (
          <>matches rule: {matchedRule.app_name_glob ?? matchedRule.content_glob ?? '*'} → {matchedRule.animation}</>
        )}
      </span>
    </div>
  );
}
