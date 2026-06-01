import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetMeta } from '../../../../lib/asset-meta.js';
import { createScrollAnimation } from '../../../../animations/scroll.js';
import type { ScrollFrame } from '../../../../animations/scroll.js';
import { TEXT_STYLES, TEXT_SIZES, TEXT_SPEEDS, TEXT_FLICKERS, TEXT_TRANSITIONS, SPEED_PXPS, SPEED_DWELL_MS, createTextRenderer } from '../../../../animations/text-renderers.js';
import type { TextStyle, TextSize, TextSpeed, TextFlicker, TextTransition } from '../../../../animations/text-renderers.js';
import { MatrixPreview } from '../MatrixPreview.js';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog.js';
import { AssetPickerModal } from '../AssetPickerModal.js';
import { DmxPreview } from '../DmxPreview.js';
import { ScrubInput } from '../ui/scrub-input.js';

export type NotificationRule = {
  source?: 'ec-switch' | 'vm' | 'claude' | 'desktop-notification' | 'manual' | 'twitch' | 'battery';
  battery_threshold?: number;
  app_name_glob?: string;
  content_glob?: string;
  animation: 'text' | 'design' | 'suppress';
  text_content?: string;
  text_size?: TextSize;
  text_style?: TextStyle;
  text_speed?: TextSpeed;
  text_flicker?: TextFlicker;
  text_transition?: TextTransition;
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

// Partial rule used for pending (new, not-yet-saved) rows
type RuleDraft = Partial<NotificationRule>;

type PendingRow = { id: string; draft: RuleDraft; sourceConfigured: boolean };

type RowProps = {
  rule: RuleDraft;
  isExisting: boolean;
  sourceConfigured: boolean;
  idx: number;
  total: number;
  onSourceDone: (draft: RuleDraft) => void;
  onAnimationDone: (rule: NotificationRule) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  dragging: boolean;
  dragOver: boolean;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
  history: Record<string, string[]>;
  refreshHistory: () => Promise<void>;
  dualModule: boolean;
};

type RulePatch = { [K in keyof NotificationRule]+?: NotificationRule[K] | undefined };

function buildRule(base: NotificationRule, changes: RulePatch): NotificationRule {
  const merged = { ...base, ...changes };
  const src = merged.source;
  const anim: NotificationRule['animation'] = merged.animation ?? base.animation;
  const needsAsset = anim === 'design';
  const isDesktop = src === 'desktop-notification' || src === undefined;
  const isBattery = src === 'battery';

  const result: NotificationRule = { animation: anim };
  if (src !== undefined) result.source = src;

  if (isDesktop) {
    if (merged.app_name_glob !== undefined && merged.app_name_glob !== '') result.app_name_glob = merged.app_name_glob;
  } else if (isBattery) {
    if (merged.battery_threshold !== undefined) result.battery_threshold = merged.battery_threshold;
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

  if (anim === 'text') {
    if (merged.text_content !== undefined && merged.text_content !== '') result.text_content = merged.text_content;
    if (merged.text_size !== undefined && merged.text_size !== 'small') result.text_size = merged.text_size;
    if (merged.text_style !== undefined && merged.text_style !== 'marquee') result.text_style = merged.text_style;
    if (merged.text_speed !== undefined && merged.text_speed !== 'normal') result.text_speed = merged.text_speed;
    if (merged.text_flicker !== undefined) result.text_flicker = merged.text_flicker;
    if (merged.text_transition !== undefined) result.text_transition = merged.text_transition;
    if (merged.side !== undefined) result.side = merged.side;
  }

  if (anim !== 'suppress' && merged.composite !== undefined && merged.composite !== 'replace') {
    result.composite = merged.composite;
  }

  if (anim === 'design') {
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

function virtualSource(draft: RuleDraft): string {
  if (draft.source === 'ec-switch') {
    return (draft.content_glob ?? '').startsWith('CAM') ? 'cam-switch' : 'mic-switch';
  }
  return draft.source ?? '';
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

function timingMode(rule: RuleDraft): TimingMode {
  if (rule.loop_count !== undefined) return 'loops';
  if (rule.duration_ms_override !== undefined) return 'duration';
  return 'default';
}

// ── label helpers ─────────────────────────────────────────────────────────────

function srcButtonLabel(draft: RuleDraft): string {
  const src = draft.source;
  if (!src) return 'any source';
  if (src === 'desktop-notification') {
    return draft.app_name_glob ? `desktop "${draft.app_name_glob}"` : 'desktop any';
  }
  if (src === 'ec-switch') {
    const isCamera = (draft.content_glob ?? '').startsWith('CAM');
    const device = isCamera ? 'cam' : 'mic';
    const state = switchState(draft.content_glob);
    return state === 'any' ? `${device} toggled` : `${device} ${state}`;
  }
  if (src === 'battery') {
    return draft.battery_threshold !== undefined ? `battery ≤${draft.battery_threshold}%` : 'battery';
  }
  if (src === 'claude') {
    const kind = claudeEventKind(draft.content_glob);
    if (kind === 'idle') return 'claude idle';
    if (kind === 'input') return 'claude needs input';
    if (kind === 'tool') {
      const suffix = claudeEventSuffix(draft.content_glob);
      return suffix === '*' ? 'claude tool' : `claude tool "${suffix}"`;
    }
    if (kind === 'agent') {
      const suffix = claudeEventSuffix(draft.content_glob);
      return suffix === '*' ? 'claude agent' : `claude agent "${suffix}"`;
    }
    return 'claude';
  }
  if (src === 'vm') return draft.content_glob ? `vm "${draft.content_glob}"` : 'vm';
  if (src === 'twitch') return draft.content_glob ? `twitch "${draft.content_glob}"` : 'twitch';
  if (src === 'manual') return 'manual';
  return src;
}

function animButtonLabel(rule: NotificationRule): string {
  if (rule.animation === 'suppress') return 'suppress';
  if (rule.animation === 'text') {
    const style = rule.text_style ?? 'marquee';
    const label = rule.text_content ? `"${rule.text_content}"` : '';
    return label ? `${style} ${label}` : style;
  }
  if (rule.animation === 'design') {
    const name = stripAssetName(rule.asset_path ?? rule.dmx_path ?? '');
    return name ? `design "${name}"` : 'design';
  }
  return rule.animation;
}

// used for hover preview label
function animLabel(r: NotificationRule): string {
  if (r.animation === 'suppress') return 'suppress';
  if (r.animation === 'design') return r.asset_path ? stripAssetName(r.asset_path) : 'design';
  const style = r.text_style ?? 'marquee';
  return r.composite === 'overlay' ? `${style}·overlay` : style;
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

function TextPrev({ text = 'dark matrix', size = 'small', style = 'marquee' as TextStyle, dual = false, speed, flicker, transition }: {
  text?: string;
  size?: TextSize;
  style?: TextStyle;
  dual?: boolean;
  speed?: TextSpeed;
  flicker?: TextFlicker;
  transition?: TextTransition;
}) {
  const [px, setPx] = useState(() => blankB64(dual));
  useEffect(() => {
    setPx(blankB64(dual));
    const displayText = text || ' ';
    if (style === 'marquee') {
      let dead = false;
      const a = createScrollAnimation({ text: displayText, size, loop: true, startOffset: 0 });
      const it = a[Symbol.asyncIterator]();
      const tick = () => void it.next().then((r: IteratorResult<ScrollFrame>) => {
        if (dead || r.done) return;
        setPx(toB64(dual ? mergeFrames(r.value[0], r.value[1]) : r.value[0]));
        setTimeout(tick, 50);
      });
      tick();
      return () => { dead = true; a.stop(); };
    }
    // Non-marquee: use TextRenderer at 100ms interval
    const widgetCfg = {
      text: displayText,
      style,
      size,
      ...(speed !== undefined ? { speed } : {}),
      ...(flicker !== undefined ? { flicker } : {}),
      ...(transition !== undefined ? { transition } : {}),
    };
    const rendL = createTextRenderer(widgetCfg, 'left');
    const rendR = dual ? createTextRenderer(widgetCfg, 'right') : null;
    let dead = false;
    const tick = () => {
      if (dead) return;
      const now = new Date();
      const lf = rendL.render(now);
      if (dual && rendR) {
        const rf = rendR.render(now);
        setPx(toB64(mergeFrames(lf as Uint8Array, rf as Uint8Array)));
      } else {
        setPx(toB64(lf as Uint8Array));
      }
      setTimeout(tick, 100);
    };
    tick();
    return () => { dead = true; rendL.stop(); rendR?.stop(); };
  }, [text, size, style, dual, speed, flicker, transition]);
  return <MatrixPreview pixels={px} width={dual ? 18 : 9} />;
}

function RulePrev({ rule, dual }: { rule: NotificationRule; dual: boolean }) {
  const w = dual ? 91 : 43;
  if (rule.animation === 'text') return <TextPrev
    {...(rule.text_content ? { text: rule.text_content } : {})}
    {...(rule.text_size ? { size: rule.text_size } : {})}
    {...(rule.text_style ? { style: rule.text_style } : {})}
    {...(rule.text_speed ? { speed: rule.text_speed } : {})}
    {...(rule.text_flicker ? { flicker: rule.text_flicker } : {})}
    {...(rule.text_transition ? { transition: rule.text_transition } : {})}
    dual={dual}
  />;
  if (rule.animation === 'design') return <DmxPreview filename={rule.asset_path} dual={dual} {...(rule.mirror ? { mirror: true } : {})} {...(rule.side ? { side: rule.side } : {})} />;
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

// Applies a patch to a RuleDraft, deleting properties set to undefined.
// Required because exactOptionalPropertyTypes disallows explicit undefined on optional props.
function patchDraft(base: RuleDraft, patch: Record<string, unknown>): RuleDraft {
  const result: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v === undefined) delete result[k];
    else result[k] = v;
  }
  return result as RuleDraft;
}

function stripAssetName(path: string): string {
  return path.replace(/^library\//, '').replace('.dmx.json', '');
}

const NOOP = () => {};

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ── source dialog ─────────────────────────────────────────────────────────────

function SourceDialog({ open, onOpenChange, initial, onDone, history, refreshHistory, triggerRef }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: RuleDraft;
  onDone: (draft: RuleDraft) => void;
  history: NotificationHistory;
  refreshHistory: () => Promise<void>;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}) {
  const [draft, setDraft] = useState<RuleDraft>(initial);

  // Capture latest initial and reset draft when dialog opens
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (open) setDraft(initialRef.current);
  }, [open]);

  const vSrc = virtualSource(draft);
  const isMicSwitch = vSrc === 'mic-switch';
  const isCamSwitch = vSrc === 'cam-switch';
  const isDesktop = draft.source === 'desktop-notification' || draft.source === undefined;
  const isClaude = draft.source === 'claude';
  const isBattery = draft.source === 'battery';

  function handleSourceChange(newVirt: string) {
    if (newVirt === 'mic-switch') {
      const state = (isMicSwitch || isCamSwitch) ? switchState(draft.content_glob) : 'any';
      setDraft(d => patchDraft(d, { source: 'ec-switch', content_glob: toSwitchGlob('MIC', state) }));
    } else if (newVirt === 'cam-switch') {
      const state = (isMicSwitch || isCamSwitch) ? switchState(draft.content_glob) : 'any';
      setDraft(d => patchDraft(d, { source: 'ec-switch', content_glob: toSwitchGlob('CAM', state) }));
    } else {
      const newSrc = (newVirt === '' || newVirt === 'any') ? undefined : newVirt as NotificationRule['source'];
      setDraft(d => {
        const patch: Record<string, unknown> = { source: newSrc };
        // Clear content_glob when switching away from any source that uses it
        if (isMicSwitch || isCamSwitch || isClaude || d.source === 'vm' || d.source === 'twitch' || d.source === 'manual') {
          patch.content_glob = undefined;
        }
        // Seed battery threshold default on first switch to battery
        if (newSrc === 'battery' && d.battery_threshold === undefined) {
          patch.battery_threshold = 20;
        }
        return patchDraft(d, patch);
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[380px] flex flex-col gap-3"
        onCloseAutoFocus={e => { if (triggerRef?.current) { e.preventDefault(); triggerRef.current.focus(); } }}
      >
        <DialogTitle>select source</DialogTitle>
        <div className="flex flex-col gap-2">
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
                { value: 'twitch', label: 'twitch' },
                { value: 'battery', label: 'battery' },
              ]}
              onValueChange={handleSourceChange}
            />
          </FormRow>

          {isDesktop && (
            <FormRow label="app">
              <div className="flex items-center gap-1 min-w-0">
                <Input
                  fluid
                  aria-label="App name glob"
                  placeholder="glob (*)"
                  value={draft.app_name_glob ?? ''}
                  onChange={e => setDraft(d => ({ ...d, app_name_glob: e.target.value }))}
                  spellCheck={false}
                />
                <RecentExamplesButton
                  items={history['desktop-notification'] ?? []}
                  refresh={refreshHistory}
                  onPick={v => setDraft(d => ({ ...d, app_name_glob: v }))}
                />
              </div>
            </FormRow>
          )}

          {(isMicSwitch || isCamSwitch) && (
            <FormRow label="state">
              <Select
                fluid
                aria-label="Switch state"
                value={switchState(draft.content_glob)}
                options={[{ value: 'any', label: 'any' }, { value: 'on', label: 'on' }, { value: 'off', label: 'off' }]}
                onValueChange={v => {
                  const state: SwitchState = (v === 'on' || v === 'off') ? v : 'any';
                  const prefix = isMicSwitch ? 'MIC' : 'CAM';
                  setDraft(d => ({ ...d, content_glob: toSwitchGlob(prefix, state) }));
                }}
              />
            </FormRow>
          )}

          {isClaude && (() => {
            const kind = claudeEventKind(draft.content_glob);
            const suffix = claudeEventSuffix(draft.content_glob);
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
                      setDraft(d => patchDraft(d, { content_glob: toClaudeGlob(next, suffix) }));
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
                        setDraft(d => patchDraft(d, { content_glob: toClaudeGlob(kind, e.target.value || '*') }));
                      }}
                      spellCheck={false}
                    />
                  </FormRow>
                )}
              </>
            );
          })()}

          {isBattery && (
            <FormRow label="at or below">
              <ScrubInput
                aria-label="Battery threshold"
                suffix="%"
                min={1}
                max={99}
                pixelsPerUnit={2}
                value={draft.battery_threshold ?? 20}
                onChange={v => setDraft(d => ({ ...d, battery_threshold: v }))}
              />
            </FormRow>
          )}

          {!isDesktop && !isMicSwitch && !isCamSwitch && !isClaude && !isBattery && (
            <FormRow label="content">
              <div className="flex items-center gap-1">
                <Input
                  fluid
                  aria-label="Content glob"
                  placeholder="glob (*)"
                  value={draft.content_glob ?? ''}
                  onChange={e => setDraft(d => patchDraft(d, { content_glob: e.target.value }))}
                  spellCheck={false}
                />
                <RecentExamplesButton
                  items={history[draft.source ?? ''] ?? []}
                  refresh={refreshHistory}
                  onPick={v => setDraft(d => patchDraft(d, { content_glob: v }))}
                />
              </div>
            </FormRow>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-foreground/10">
          <DialogClose asChild>
            <Button size="sm" onClick={() => onDone(draft)}>done</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── animation dialog helpers ───────────────────────────────────────────────────

const SIZE_RESTRICTED_STYLES: readonly TextStyle[] = ['spine', 'neon', 'bigglyph', 'vegas'];
const sizeOptionsForStyle = (style: TextStyle): readonly TextSize[] =>
  SIZE_RESTRICTED_STYLES.includes(style) ? (['tiny', 'small'] as const) : TEXT_SIZES;
const speedOptionsForStyle = (style: TextStyle): readonly TextSpeed[] =>
  style === 'bigglyph' ? TEXT_SPEEDS
    : style === 'vegas' ? TEXT_SPEEDS.filter(s => s !== 'fast' && s !== 'fast2' && s !== 'fast3')
    : TEXT_SPEEDS.filter(s => s !== 'fast2' && s !== 'fast3');

function speedLabel(style: TextStyle, s: TextSpeed): string {
  if (style === 'bigglyph') {
    const ms = SPEED_DWELL_MS[s];
    return `${ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}/letter`;
  }
  return `${SPEED_PXPS[s]}px/s`;
}

// ── animation dialog ──────────────────────────────────────────────────────────

function AnimationDialog({ open, onOpenChange, initial, onDone, dualModule, triggerRef }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: RuleDraft;
  onDone: (draft: RuleDraft) => void;
  dualModule: boolean;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}) {
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerOpenRef = useRef(false);
  useEffect(() => { pickerOpenRef.current = pickerOpen; }, [pickerOpen]);

  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (open) setDraft(initialRef.current);
  }, [open]);

  const [assetWidth, setAssetWidth] = useState<9 | 18 | null>(null);
  useEffect(() => {
    const path = draft.asset_path;
    if (!path) { setAssetWidth(null); return; }
    let cancelled = false;
    fetch(`/api/assets/${encodeURIComponent(path)}`)
      .then(r => r.ok ? r.json() as Promise<{ ok: boolean; asset: AssetMeta }> : Promise.reject())
      .then(d => { if (!cancelled) setAssetWidth(d.asset.width); })
      .catch(() => { if (!cancelled) setAssetWidth(null); });
    return () => { cancelled = true; };
  }, [draft.asset_path]);

  const animType = draft.animation ?? 'text';
  const mode = timingMode(draft);
  const assetDisplay = draft.asset_path ?? draft.dmx_path ?? '';
  const durationDisplay = draft.duration_ms_override !== undefined ? String(draft.duration_ms_override) : '';
  const previewRule = buildRule({ animation: animType }, draft as RulePatch);
  const textStyle: TextStyle = draft.text_style ?? 'marquee';

  return (
    <Dialog open={open} onOpenChange={v => { if (!pickerOpenRef.current) onOpenChange(v); }}>
      <DialogContent
        className="w-[360px] flex flex-col gap-3"
        onInteractOutside={e => { if (pickerOpenRef.current) e.preventDefault(); }}
        onCloseAutoFocus={e => { if (triggerRef?.current) { e.preventDefault(); triggerRef.current.focus(); } }}
      >
        <DialogTitle>select animation</DialogTitle>

        <div className="flex justify-center">
          <RulePrev rule={previewRule} dual={dualModule} />
        </div>

        <div className="flex flex-col gap-2">
          <FormRow label="type">
            <Select
              fluid
              aria-label="Animation type"
              value={animType}
              options={[
                { value: 'text', label: 'text' },
                { value: 'design', label: 'design' },
                { value: 'suppress', label: 'suppress' },
              ]}
              onValueChange={v => {
                if (v === 'design') {
                  setDraft(d => ({ ...d, animation: 'design', transition: 'dissolve', overlay_mode: 'halo', composite: 'overlay' }));
                } else if (v === 'text' || v === 'suppress') {
                  setDraft(d => ({ ...d, animation: v as 'text' | 'suppress' }));
                }
              }}
            />
          </FormRow>

          {animType === 'text' && (
            <FormRow label="style">
              <Select
                fluid
                aria-label="Text style"
                value={textStyle}
                options={TEXT_STYLES.map(s => ({ value: s, label: s }))}
                onValueChange={v => {
                  const next = v as TextStyle;
                  setDraft(d => {
                    const patch: Record<string, unknown> = { text_style: next === 'marquee' ? undefined : next };
                    // Clamp size if style is restricted
                    if (SIZE_RESTRICTED_STYLES.includes(next) && (d.text_size === 'medium' || d.text_size === 'large')) {
                      patch['text_size'] = 'small';
                    }
                    // Clamp speed for vegas
                    if (next === 'vegas' && d.text_speed !== undefined && !speedOptionsForStyle('vegas').includes(d.text_speed)) {
                      patch['text_speed'] = 'slow';
                    }
                    // Clear style-specific params when switching away
                    if (next !== 'neon') patch['text_flicker'] = undefined;
                    if (next !== 'bigglyph') patch['text_transition'] = undefined;
                    return patchDraft(d, patch);
                  });
                }}
              />
            </FormRow>
          )}

          {animType === 'text' && (
            <FormRow label="text">
              <Input
                fluid
                aria-label="Text content"
                placeholder="notification text"
                value={draft.text_content ?? ''}
                onChange={e => setDraft(d => patchDraft(d, { text_content: e.target.value }))}
                spellCheck={false}
              />
            </FormRow>
          )}

          {animType === 'text' && (
            <FormRow label="size">
              <Select
                fluid
                aria-label="Text size"
                value={draft.text_size ?? 'small'}
                options={sizeOptionsForStyle(textStyle).map(s => ({ value: s, label: s }))}
                onValueChange={v => {
                  const s = (TEXT_SIZES as readonly string[]).includes(v) ? v as TextSize : undefined;
                  setDraft(d => patchDraft(d, { text_size: s }));
                }}
              />
            </FormRow>
          )}

          {animType === 'text' && textStyle !== 'neon' && (
            <FormRow label="speed">
              <Select
                fluid
                aria-label="Text speed"
                value={draft.text_speed ?? 'normal'}
                options={speedOptionsForStyle(textStyle).map(s => ({ value: s, label: speedLabel(textStyle, s) }))}
                onValueChange={v => {
                  const s = (TEXT_SPEEDS as readonly string[]).includes(v) ? v as TextSpeed : undefined;
                  setDraft(d => patchDraft(d, { text_speed: s === 'normal' ? undefined : s }));
                }}
              />
            </FormRow>
          )}

          {animType === 'text' && textStyle === 'neon' && (
            <FormRow label="flicker">
              <Select
                fluid
                aria-label="Flicker intensity"
                value={draft.text_flicker ?? 'medium'}
                options={TEXT_FLICKERS.map(f => ({ value: f, label: f }))}
                onValueChange={v => {
                  const f = (TEXT_FLICKERS as readonly string[]).includes(v) ? v as TextFlicker : undefined;
                  setDraft(d => patchDraft(d, { text_flicker: f }));
                }}
              />
            </FormRow>
          )}

          {animType === 'text' && textStyle === 'bigglyph' && (
            <FormRow label="transition">
              <Select
                fluid
                aria-label="Letter transition"
                value={draft.text_transition ?? 'slide'}
                options={TEXT_TRANSITIONS.map(t => ({ value: t, label: t }))}
                onValueChange={v => {
                  const t = (TEXT_TRANSITIONS as readonly string[]).includes(v) ? v as TextTransition : undefined;
                  setDraft(d => patchDraft(d, { text_transition: t }));
                }}
              />
            </FormRow>
          )}

          {animType === 'text' && (
            <FormRow label="side">
              <Select
                fluid
                aria-label="Module side"
                value={draft.side ?? 'both'}
                options={[
                  { value: 'both', label: 'both' },
                  { value: 'left', label: 'left' },
                  { value: 'right', label: 'right' },
                ]}
                onValueChange={v => setDraft(d => patchDraft(d, { side: (v === 'left' || v === 'right') ? v : undefined }))}
              />
            </FormRow>
          )}

          {animType === 'text' && (
            <FormRow label="composite">
              <Select
                fluid
                aria-label="Composite"
                value={draft.composite ?? 'replace'}
                options={[{ value: 'replace', label: 'replace' }, { value: 'overlay', label: 'overlay' }]}
                onValueChange={v => setDraft(d => ({ ...d, composite: v === 'overlay' ? 'overlay' : 'replace' }))}
              />
            </FormRow>
          )}

          {animType === 'design' && (
            <FormRow label="asset">
              <div className="flex items-center gap-1.5 w-full">
                <Input
                  fluid
                  readOnly
                  value={assetDisplay ? stripAssetName(assetDisplay) : ''}
                  placeholder="none"
                  aria-label="Selected asset"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  aria-label={`Pick asset${assetDisplay ? ` (current: ${stripAssetName(assetDisplay)})` : ''}`}
                  onClick={() => setPickerOpen(true)}
                >
                  pick
                </Button>
              </div>
            </FormRow>
          )}

          {animType === 'design' && (
            <FormRow label="mirror">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={draft.mirror === true}
                  onChange={e => setDraft(d => patchDraft(d, {
                    mirror: e.target.checked ? true : undefined,
                    side: e.target.checked ? d.side : undefined,
                  }))}
                />
                <span className="font-mono text-xs text-muted-foreground">mirror on second panel</span>
              </label>
            </FormRow>
          )}

          {animType === 'design' && assetWidth === 9 && !draft.mirror && (
            <FormRow label="side">
              <Select
                fluid
                aria-label="Panel side"
                value={draft.side ?? 'both'}
                options={[
                  { value: 'both', label: 'both' },
                  { value: 'left', label: 'left' },
                  { value: 'right', label: 'right' },
                ]}
                onValueChange={v => setDraft(d => patchDraft(d, { side: (v === 'left' || v === 'right') ? v : undefined }))}
              />
            </FormRow>
          )}

          {animType === 'design' && (
            <FormRow label="blend">
              <Select
                fluid
                aria-label="Blend"
                value={draft.overlay_mode ?? (draft.composite === 'overlay' ? 'or' : 'replace')}
                options={[{ value: 'replace', label: 'replace' }, { value: 'or', label: 'additive' }, { value: 'xor', label: 'xor' }, { value: 'halo', label: 'halo' }]}
                onValueChange={v => {
                  if (v === 'replace') {
                    setDraft(d => patchDraft(d, { composite: 'replace', overlay_mode: undefined }));
                  } else {
                    setDraft(d => patchDraft(d, { composite: 'overlay', overlay_mode: v as 'or' | 'xor' | 'halo' }));
                  }
                }}
              />
            </FormRow>
          )}

          {animType === 'design' && (
            <FormRow label="transition">
              <Select
                fluid
                aria-label="Transition"
                value={draft.transition ?? 'none'}
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
                  setDraft(d => patchDraft(d, { transition: t }));
                }}
              />
            </FormRow>
          )}

          {animType === 'design' && (
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
                    if (v === 'loops') setDraft(d => patchDraft(d, { loop_count: d.loop_count ?? 1, duration_ms_override: undefined }));
                    else if (v === 'duration') setDraft(d => patchDraft(d, { duration_ms_override: d.duration_ms_override ?? 5000, loop_count: undefined }));
                    else setDraft(d => patchDraft(d, { loop_count: undefined, duration_ms_override: undefined }));
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
                    value={draft.loop_count !== undefined ? String(draft.loop_count) : ''}
                    onChange={e => {
                      const n = parseInt(e.target.value, 10);
                      setDraft(d => ({ ...d, loop_count: isNaN(n) || n < 1 ? 1 : n }));
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
                      setDraft(d => patchDraft(d, { duration_ms_override: isNaN(n) || n <= 0 ? undefined : n }));
                    }}
                  />
                </FormRow>
              )}
            </>
          )}

          {animType !== 'design' && (
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
                  setDraft(d => patchDraft(d, { duration_ms_override: isNaN(n) || n <= 0 ? undefined : n }));
                }}
              />
            </FormRow>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-foreground/10">
          <DialogClose asChild>
            <Button size="sm" onClick={() => onDone(draft)}>done</Button>
          </DialogClose>
        </div>

        <AssetPickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          {...(assetDisplay ? { current: assetDisplay } : {})}
          onPick={filename => setDraft(d => patchDraft(d, { asset_path: filename }))}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── rule row ──────────────────────────────────────────────────────────────────

function RuleRow({
  rule, isExisting, sourceConfigured, idx, total, dualModule,
  onSourceDone, onAnimationDone,
  onDelete, onMoveUp, onMoveDown,
  onDragStart, onDragEnter, onDragEnd, onDrop,
  dragging, dragOver,
  onHoverEnter, onHoverLeave, rowRef,
  history, refreshHistory,
}: RowProps) {
  const [srcOpen, setSrcOpen] = useState(false);
  const [animOpen, setAnimOpen] = useState(false);
  const srcBtnRef = useRef<HTMLButtonElement>(null);
  const animBtnRef = useRef<HTMLButtonElement>(null);

  const [testState, setTestState] = useState<'idle' | 'firing' | 'ok' | 'err'>('idle');
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testMountedRef = useRef(true);
  useEffect(() => {
    testMountedRef.current = true;
    return () => {
      testMountedRef.current = false;
      if (testTimerRef.current !== null) clearTimeout(testTimerRef.current);
    };
  }, []);

  async function fireTest() {
    if (!rule.animation || rule.animation === 'suppress') return;
    setTestState('firing');
    try {
      const body: Record<string, unknown> = {};
      if (rule.animation === 'design') {
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
        body['summary'] = rule.text_content || 'dark matrix';
        if (rule.text_style) body['textStyle'] = rule.text_style;
        if (rule.text_size) body['textSize'] = rule.text_size;
        if (rule.text_speed) body['textSpeed'] = rule.text_speed;
        if (rule.text_flicker) body['textFlicker'] = rule.text_flicker;
        if (rule.text_transition) body['textTransition'] = rule.text_transition;
        if (rule.composite) body['composite'] = rule.composite;
        if (rule.side !== undefined) body['side'] = rule.side;
        if (rule.duration_ms_override !== undefined) body['durationMsOverride'] = rule.duration_ms_override;
      }
      const r = await fetch('/api/test-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!testMountedRef.current) return;
      setTestState(r.ok ? 'ok' : 'err');
    } catch {
      if (!testMountedRef.current) return;
      setTestState('err');
    }
    if (testTimerRef.current !== null) clearTimeout(testTimerRef.current);
    testTimerRef.current = setTimeout(() => { testTimerRef.current = null; if (testMountedRef.current) setTestState('idle'); }, 1500);
  }

  const completeRule = rule.animation !== undefined ? rule as NotificationRule : null;

  function handleAnimationDone(draft: RuleDraft) {
    const anim = draft.animation ?? 'text';
    const complete = buildRule({ animation: anim }, draft as RulePatch);
    onAnimationDone(complete);
  }

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={`Rule ${idx + 1}`}
      className={`group flex items-center gap-2 py-1.5 border-b border-foreground/10 last:border-b-0 transition-opacity${dragging ? ' opacity-40' : ''}${dragOver ? ' -mt-px border-t-2 border-t-primary' : ''}`}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onDragEnter={e => { e.preventDefault(); onDragEnter(); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>

      {/* source button */}
      <Button
        ref={srcBtnRef}
        variant={sourceConfigured ? 'ghost' : 'primary'}
        size="sm"
        className="shrink-0 font-mono truncate max-w-[180px]"
        aria-label={sourceConfigured ? `Edit source for rule ${idx + 1}` : `Select source for rule ${idx + 1}`}
        tooltip={sourceConfigured ? srcButtonLabel(rule) : 'Select event source'}
        onClick={() => setSrcOpen(true)}
      >
        {sourceConfigured ? srcButtonLabel(rule) : 'select source'}
      </Button>

      <span aria-hidden="true" className="text-foreground/30 shrink-0 select-none">·</span>

      {/* animation button */}
      <Button
        ref={animBtnRef}
        variant={completeRule ? 'ghost' : sourceConfigured ? 'primary' : 'default'}
        size="sm"
        className="shrink-0 font-mono truncate max-w-[180px]"
        aria-label={completeRule ? `Edit animation for rule ${idx + 1}` : `Select animation for rule ${idx + 1}`}
        aria-disabled={!sourceConfigured}
        aria-description={!sourceConfigured ? 'Select a source first' : undefined}
        disabled={!sourceConfigured}
        tooltip={sourceConfigured ? (completeRule ? animButtonLabel(completeRule) : 'Select animation') : undefined}
        onClick={() => setAnimOpen(true)}
      >
        {completeRule ? animButtonLabel(completeRule) : 'select animation'}
      </Button>

      {/* test button — existing complete rules only, hover visible */}
      {isExisting && completeRule && completeRule.animation !== 'suppress' && (
        <>
        <span aria-live="polite" aria-atomic="true" className="sr-only">
          {testState === 'firing' ? 'Firing test' : testState === 'ok' ? 'Test succeeded' : testState === 'err' ? 'Test failed' : ''}
        </span>
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
        </>
      )}

      {/* right cluster: reorder + delete + drag */}
      <div className="flex items-center gap-0.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {isExisting && (
          <>
            <Button variant="ghost" size="sm" aria-label={`Move rule ${idx + 1} up`} disabled={idx === 0} onClick={onMoveUp}>↑</Button>
            <Button variant="ghost" size="sm" aria-label={`Move rule ${idx + 1} down`} disabled={idx === total - 1} onClick={onMoveDown}>↓</Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          tooltip="Delete rule"
          aria-label={`Delete rule ${idx + 1}`}
          onClick={onDelete}
        >
          ×
        </Button>
        {/* drag handle — rightmost, existing rows only */}
        <button
          type="button"
          draggable={isExisting}
          tabIndex={-1}
          aria-hidden="true"
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          className={`font-mono text-foreground/30 hover:text-foreground/60 shrink-0 leading-none${isExisting ? ' cursor-grab active:cursor-grabbing' : ' invisible pointer-events-none'}`}
        >
          ⠿
        </button>
      </div>

      <SourceDialog
        open={srcOpen}
        onOpenChange={setSrcOpen}
        initial={rule}
        onDone={onSourceDone}
        history={history}
        refreshHistory={refreshHistory}
        triggerRef={srcBtnRef}
      />

      <AnimationDialog
        open={animOpen}
        onOpenChange={setAnimOpen}
        initial={rule}
        onDone={handleAnimationDone}
        dualModule={dualModule}
        triggerRef={animBtnRef}
      />
    </div>
  );
}

// ── add rule row ──────────────────────────────────────────────────────────────

function AddRuleRow({ onSourceDone, history, refreshHistory }: {
  onSourceDone: (draft: RuleDraft) => void;
  history: NotificationHistory;
  refreshHistory: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex items-center py-1.5 border-b border-foreground/10 last:border-b-0">
      <Button
        ref={btnRef}
        variant="ghost"
        size="sm"
        className="font-mono"
        onClick={() => setOpen(true)}
      >
        add rule
      </Button>
      <SourceDialog
        open={open}
        onOpenChange={setOpen}
        initial={{}}
        onDone={onSourceDone}
        history={history}
        refreshHistory={refreshHistory}
        triggerRef={btnRef}
      />
    </div>
  );
}

// ── tab ───────────────────────────────────────────────────────────────────────

export function NotificationsTab({ value, onChange, dualModule = false }: NotificationsTabProps) {
  const idsRef = useRef<string[]>(value.map(() => crypto.randomUUID()));
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const [reorderMsg, setReorderMsg] = useState('');
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([]);
  const { history, refresh: refreshHistory } = useNotificationHistory();

  function updateRule(idx: number, rule: NotificationRule) {
    const next = [...value];
    next[idx] = rule;
    onChange(next);
  }

  function deleteRule(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
    idsRef.current = idsRef.current.filter((_, i) => i !== idx);
  }

  function deletePendingRow(id: string) {
    setPendingRows(rows => rows.filter(r => r.id !== id));
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
    setReorderMsg(`Rule moved to position ${to + 1} of ${value.length}`);
  }

  function startDrag(idx: number) {
    dragIdxRef.current = idx;
    setDragIdx(idx);
  }

  function endDrag() {
    dragIdxRef.current = null;
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleDrop(to: number) {
    const from = dragIdxRef.current;
    if (from !== null && from !== to) moveRule(from, to);
    endDrag();
  }

  const hoverRule = hoverIdx !== null ? (value[hoverIdx] ?? null) : null;

  return (
    <div className="flex flex-col p-2">
      <p className="font-mono text-xs text-muted-foreground mb-2">
        first match wins — default when no rules match: scroll (replace)
      </p>

      <div className="relative">
        {/* hover preview — floats left of the list */}
        {hoverRule !== null && hoverY !== null && (
          <div
            className="absolute right-full mr-6 -translate-y-1/2 flex flex-col items-center gap-1.5 p-2 border border-foreground/20 bg-background rounded shadow-lg pointer-events-none z-50"
            style={{ top: hoverY }}
          >
            <RulePrev rule={hoverRule} dual={dualModule} />
            <span className="font-mono text-foreground/30 text-center" style={{ fontSize: 9 }}>
              {animLabel(hoverRule)}
            </span>
          </div>
        )}

        <span role="status" aria-live="polite" className="sr-only">{reorderMsg}</span>

        <div className="flex flex-col">
          {value.map((rule, idx) => (
            <RuleRow
              key={idsRef.current[idx] ?? String(idx)}
              rule={rule}
              isExisting={true}
              sourceConfigured={true}
              idx={idx}
              total={value.length + pendingRows.length}
              dualModule={dualModule}
              history={history}
              refreshHistory={refreshHistory}
              onSourceDone={draft => updateRule(idx, buildRule(rule, draft))}
              onAnimationDone={updated => updateRule(idx, updated)}
              onDelete={() => deleteRule(idx)}
              onMoveUp={() => moveRule(idx, idx - 1)}
              onMoveDown={() => moveRule(idx, idx + 1)}
              onDragStart={() => startDrag(idx)}
              onDragEnter={() => { if (dragIdxRef.current !== null) setDragOverIdx(idx); }}
              onDragEnd={endDrag}
              onDrop={() => handleDrop(idx)}
              dragging={dragIdx === idx}
              dragOver={dragOverIdx === idx && dragIdx !== idx}
              onHoverEnter={() => {
                const el = rowRefs.current[idx];
                setHoverY(el ? el.offsetTop + el.offsetHeight / 2 : null);
                setHoverIdx(idx);
              }}
              onHoverLeave={() => { setHoverIdx(null); setHoverY(null); }}
              rowRef={(el: HTMLDivElement | null) => { rowRefs.current[idx] = el; }}
            />
          ))}

          {pendingRows.map((pending, pi) => (
            <RuleRow
              key={pending.id}
              rule={pending.draft}
              isExisting={false}
              sourceConfigured={pending.sourceConfigured}
              idx={value.length + pi}
              total={value.length + pendingRows.length}
              dualModule={dualModule}
              history={history}
              refreshHistory={refreshHistory}
              onSourceDone={draft => {
                setPendingRows(rows => rows.map(r =>
                  r.id === pending.id
                    ? { ...r, draft: { ...r.draft, ...draft }, sourceConfigured: true }
                    : r
                ));
              }}
              onAnimationDone={complete => {
                // Promote pending row to saved rule
                setPendingRows(rows => rows.filter(r => r.id !== pending.id));
                idsRef.current = [...idsRef.current, pending.id];
                onChange([...value, complete]);
              }}
              onDelete={() => deletePendingRow(pending.id)}
              onMoveUp={NOOP}
              onMoveDown={NOOP}
              onDragStart={NOOP}
              onDragEnter={NOOP}
              onDragEnd={NOOP}
              onDrop={NOOP}
              dragging={false}
              dragOver={false}
              onHoverEnter={() => {
                // Pending rows have no complete animation — clear hover to suppress preview
                setHoverIdx(null);
                setHoverY(null);
              }}
              onHoverLeave={() => { setHoverIdx(null); setHoverY(null); }}
              rowRef={(el: HTMLDivElement | null) => { pendingRowRefs.current[pi] = el; }}
            />
          ))}

          <AddRuleRow
            onSourceDone={draft => {
              const id = crypto.randomUUID();
              setPendingRows(rows => [...rows, { id, draft, sourceConfigured: true }]);
            }}
            history={history}
            refreshHistory={refreshHistory}
          />
        </div>
      </div>
    </div>
  );
}
