import { useState, useEffect, useRef, useId } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { HudTrigger, HudPresetClient } from '../types/hud-preset.js';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { ScrubInput } from './ui/scrub-input.js';
import { TimeInput } from './ui/time-input.js';
import { Checkbox } from './ui/checkbox.js';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './ui/dialog.js';

// ── constants ──────────────────────────────────────────────────────────────

const TRIGGER_TYPES = ['time', 'day', 'date', 'threshold', 'interface', 'vm'] as const;
type TriggerType = typeof TRIGGER_TYPES[number];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Weekday = typeof DAYS[number];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const METRIC_CONFIG = {
  cpu:    { min: 0, max: 100,        pixelsPerUnit: 1,      defaultVal: 50 },
  ram:    { min: 0, max: 100,        pixelsPerUnit: 1,      defaultVal: 50 },
  net_rx: { min: 0, max: 10_000_000, pixelsPerUnit: 10_000, defaultVal: 100_000 },
  net_tx: { min: 0, max: 10_000_000, pixelsPerUnit: 10_000, defaultVal: 100_000 },
} as const;

const TRIGGER_DESCRIPTIONS: Record<TriggerType, string> = {
  time:      'Active between two clock times each day. Wraps midnight when "from" is later than "to".',
  day:       'Active on selected days of the week.',
  date:      'Active on a specific month and day each year.',
  threshold: 'Active when a system metric (CPU, RAM, network) crosses a numeric boundary.',
  interface: 'Active when a named network interface is in a specific state (up or down).',
  vm:        'Active when a named virtual machine is in a specific state (running or stopped).',
};

const FIELD_WIDTH = 'w-24';

function defaultTrigger(type: TriggerType): HudTrigger {
  switch (type) {
    case 'time':      return { type: 'time', from: '00:00', to: '00:00' };
    case 'day':       return { type: 'day', days: ['mon'] as Weekday[] };
    case 'date':      return { type: 'date', month: 1, day: 1 };
    case 'threshold': return { type: 'threshold', metric: 'cpu' };
    case 'interface': return { type: 'interface', name: '', state: 'up' };
    case 'vm':        return { type: 'vm', name: '' };
  }
}

// ── label ──────────────────────────────────────────────────────────────────

function triggerLabel(t: HudTrigger): string {
  switch (t.type) {
    case 'time': {
      const overnight = t.from > t.to;
      return `${t.from} – ${t.to}${overnight ? ' (overnight)' : ''}`;
    }
    case 'day':
      return t.days.length === 0 ? 'no days' : t.days.join(' ');
    case 'date':
      return `${MONTHS[(t.month - 1) % 12] ?? ''} ${t.day}`;
    case 'threshold': {
      const parts: string[] = [t.metric];
      if (t.above !== undefined) parts.push(`> ${t.above}`);
      if (t.below !== undefined) parts.push(`< ${t.below}`);
      return parts.join(' ');
    }
    case 'interface':
      return `${t.name || '?'} ${t.state}`;
    case 'vm':
      return t.state ? `${t.name || '?'} ${t.state}` : `${t.name || '?'} any`;
  }
}

// ── form row ───────────────────────────────────────────────────────────────

function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ── trigger dialog ─────────────────────────────────────────────────────────

function TriggerDialog({ open, onOpenChange, initial, onDone, triggerRef }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: HudTrigger;
  onDone: (t: HudTrigger) => void;
  triggerRef?: RefObject<HTMLButtonElement>;
}) {
  const [draft, setDraft] = useState<HudTrigger>(initial);
  const uid = useId();

  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (open) setDraft(initialRef.current);
  }, [open]);

  // Fetch interfaces once, on first open with type=interface
  const [ifaces, setIfaces] = useState<string[] | null>(null);
  const ifacesFetchedRef = useRef(false);
  useEffect(() => {
    if (!open || draft.type !== 'interface' || ifacesFetchedRef.current) return;
    ifacesFetchedRef.current = true;
    let cancelled = false;
    fetch('/api/net-interfaces')
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<{ ok: boolean; interfaces?: string[] }>; })
      .then(d => { if (!cancelled) setIfaces(d.interfaces ?? []); })
      .catch(() => { if (!cancelled) setIfaces([]); });
    return () => { cancelled = true; };
  }, [open, draft.type]);

  const type = draft.type;

  // Threshold derived values (computed outside JSX to avoid IIFEs)
  const thresholdCfg = draft.type === 'threshold' ? METRIC_CONFIG[draft.metric] : null;
  const thresholdConflict = draft.type === 'threshold' &&
    draft.above !== undefined && draft.below !== undefined && draft.above >= draft.below;

  // Interface derived values
  const detected = ifaces ?? [];
  const useSelect = draft.type === 'interface' && detected.length > 0;
  const isOther = useSelect && !detected.includes((draft as { name: string }).name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[400px] flex flex-col gap-3"
        onCloseAutoFocus={e => { if (triggerRef?.current) { e.preventDefault(); triggerRef.current.focus(); } }}
      >
        <DialogTitle>Edit trigger</DialogTitle>

        <div className="flex flex-col gap-2">
          <FormRow label="type">
            <Select
              fluid
              aria-label="Trigger type"
              value={type}
              options={TRIGGER_TYPES.map(t => ({ value: t, label: t }))}
              onValueChange={v => {
                if ((TRIGGER_TYPES as readonly string[]).includes(v)) {
                  setDraft(defaultTrigger(v as TriggerType));
                }
              }}
            />
          </FormRow>

          <p className="font-mono text-xs text-muted-foreground leading-relaxed pl-[88px]">
            {TRIGGER_DESCRIPTIONS[type]}
          </p>

          {/* time */}
          {draft.type === 'time' && (
            <>
              <FormRow label="from">
                <TimeInput aria-label="From time" value={draft.from} onChange={v => setDraft({ ...draft, from: v })} />
              </FormRow>
              <FormRow label="to">
                <TimeInput aria-label="To time" value={draft.to} onChange={v => setDraft({ ...draft, to: v })} />
              </FormRow>
            </>
          )}

          {/* day */}
          {draft.type === 'day' && (
            <FormRow label="days">
              <div className="flex items-center gap-1 flex-wrap">
                {DAYS.map(d => {
                  const active = draft.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={active}
                      className={`font-mono text-xs border px-2 py-0.5 transition-colors ${
                        active
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-foreground/30 text-foreground/50 hover:text-foreground hover:border-foreground/60'
                      }`}
                      onClick={() => {
                        if (draft.type !== 'day') return;
                        const next = active
                          ? draft.days.filter(x => x !== d)
                          : [...draft.days, d];
                        setDraft({ type: 'day', days: next as Weekday[] });
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </FormRow>
          )}

          {/* date */}
          {draft.type === 'date' && (
            <>
              <FormRow label="month">
                <ScrubInput
                  aria-label="Month"
                  value={draft.month}
                  min={1}
                  max={12}
                  suffix={MONTHS[Math.max(0, draft.month - 1) % 12] ?? ''}
                  onChange={v => setDraft({ ...draft, month: v })}
                  className="w-6 text-center"
                />
              </FormRow>
              <FormRow label="day">
                <ScrubInput
                  aria-label="Day of month"
                  value={draft.day}
                  min={1}
                  max={31}
                  onChange={v => setDraft({ ...draft, day: v })}
                  className={FIELD_WIDTH}
                />
              </FormRow>
            </>
          )}

          {/* threshold */}
          {draft.type === 'threshold' && thresholdCfg && (
            <>
              <FormRow label="metric">
                <Select
                  fluid
                  aria-label="Metric"
                  value={draft.metric}
                  options={(['cpu', 'ram', 'net_rx', 'net_tx'] as const).map(m => ({ value: m, label: m }))}
                  onValueChange={v => {
                    const m = v as 'cpu' | 'ram' | 'net_rx' | 'net_tx';
                    setDraft({ type: 'threshold', metric: m });
                  }}
                />
              </FormRow>
              <FormRow label="above">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${uid}-above-en`}
                    checked={draft.above !== undefined}
                    onChange={e => {
                      if (e.target.checked) {
                        setDraft({ ...draft, above: thresholdCfg.defaultVal });
                      } else {
                        const base = { type: 'threshold' as const, metric: draft.metric };
                        setDraft(draft.below !== undefined ? { ...base, below: draft.below } : base);
                      }
                    }}
                  />
                  <label htmlFor={`${uid}-above-en`} className="font-mono text-xs text-muted-foreground cursor-pointer select-none">enabled</label>
                  {draft.above !== undefined && (
                    <ScrubInput
                      aria-label="above threshold"
                      value={draft.above}
                      min={thresholdCfg.min}
                      max={thresholdCfg.max}
                      pixelsPerUnit={thresholdCfg.pixelsPerUnit}
                      onChange={v => setDraft({ ...draft, above: v })}
                      className={FIELD_WIDTH}
                    />
                  )}
                </div>
              </FormRow>
              <FormRow label="below">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${uid}-below-en`}
                    checked={draft.below !== undefined}
                    onChange={e => {
                      if (e.target.checked) {
                        setDraft({ ...draft, below: thresholdCfg.defaultVal });
                      } else {
                        const base = { type: 'threshold' as const, metric: draft.metric };
                        setDraft(draft.above !== undefined ? { ...base, above: draft.above } : base);
                      }
                    }}
                  />
                  <label htmlFor={`${uid}-below-en`} className="font-mono text-xs text-muted-foreground cursor-pointer select-none">enabled</label>
                  {draft.below !== undefined && (
                    <ScrubInput
                      aria-label="below threshold"
                      value={draft.below}
                      min={thresholdCfg.min}
                      max={thresholdCfg.max}
                      pixelsPerUnit={thresholdCfg.pixelsPerUnit}
                      onChange={v => setDraft({ ...draft, below: v })}
                      className={FIELD_WIDTH}
                    />
                  )}
                </div>
              </FormRow>
              {/* always-mounted live region so AT announces state changes reliably */}
              <span role="status" aria-live="assertive" className={`font-mono text-xs text-yellow-400 pl-[88px]${thresholdConflict ? '' : ' sr-only'}`}>
                above &ge; below — never matches
              </span>
            </>
          )}

          {/* interface */}
          {draft.type === 'interface' && (
            <>
              <FormRow label="name">
                <div className="flex items-center gap-2 min-w-0">
                  {useSelect && (
                    <Select
                      fluid
                      aria-label="Interface name"
                      value={isOther ? '__other__' : draft.name}
                      options={[
                        ...detected.map(iface => ({ value: iface, label: iface })),
                        { value: '__other__', label: 'other…' },
                      ]}
                      onValueChange={v => setDraft({ ...draft, name: v === '__other__' ? '' : v })}
                    />
                  )}
                  {(!useSelect || isOther) && (
                    <Input
                      fluid
                      type="text"
                      aria-label="Custom interface name"
                      placeholder="eth0"
                      value={draft.name}
                      onChange={e => setDraft({ ...draft, name: e.target.value })}
                    />
                  )}
                </div>
              </FormRow>
              <FormRow label="state">
                <Select
                  fluid
                  aria-label="Interface state"
                  value={draft.state}
                  options={[{ value: 'up', label: 'up' }, { value: 'down', label: 'down' }]}
                  onValueChange={v => { if (v === 'up' || v === 'down') setDraft({ ...draft, state: v }); }}
                />
              </FormRow>
            </>
          )}

          {/* vm */}
          {draft.type === 'vm' && (
            <>
              <FormRow label="name">
                <Input
                  fluid
                  type="text"
                  aria-label="VM name"
                  placeholder="vm-name"
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                />
              </FormRow>
              <FormRow label="state">
                <Select
                  fluid
                  aria-label="VM state"
                  value={draft.state ?? 'any'}
                  options={[
                    { value: 'any',     label: 'any' },
                    { value: 'running', label: 'running' },
                    { value: 'stopped', label: 'stopped' },
                  ]}
                  onValueChange={v => {
                    if (v === 'running' || v === 'stopped') {
                      setDraft({ type: 'vm', name: draft.name, state: v });
                    } else {
                      setDraft({ type: 'vm', name: draft.name });
                    }
                  }}
                />
              </FormRow>
            </>
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

// ── trigger row ────────────────────────────────────────────────────────────

function TriggerRow({ trigger, idx, total, onUpdate, onDelete, onMoveUp, onMoveDown, onDragStart, onDragEnter, onDragEnd, onDrop, dragging, dragOver, onDialogOpenChange }: {
  trigger: HudTrigger;
  idx: number;
  total: number;
  onUpdate: (t: HudTrigger) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  dragging: boolean;
  dragOver: boolean;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleOpenChange(o: boolean) {
    setOpen(o);
    onDialogOpenChange(o);
  }

  return (
    <div
      role="group"
      aria-label={`Trigger ${idx + 1}`}
      className={`group flex items-center gap-2 py-1.5 border-b border-foreground/10 last:border-b-0 transition-opacity${dragging ? ' opacity-40' : ''}${dragOver ? ' -mt-px border-t-2 border-t-primary' : ''}`}
      onDragEnter={e => { e.preventDefault(); onDragEnter(); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      <span className="font-mono text-xs text-foreground/25 tabular-nums w-4 shrink-0">{idx + 1}</span>

      <Button
        ref={btnRef}
        variant="ghost"
        size="sm"
        className="shrink-0 font-mono truncate max-w-xs text-left"
        aria-label={`Edit trigger ${idx + 1}: ${trigger.type} ${triggerLabel(trigger)}`}
        onClick={() => handleOpenChange(true)}
      >
        <span className="text-foreground/50">{trigger.type}:</span>
        <span className="ml-1">{triggerLabel(trigger)}</span>
      </Button>

      <div className="flex items-center gap-0.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" aria-label={`Move trigger ${idx + 1} up`}   disabled={idx === 0}         onClick={onMoveUp}>
          <span aria-hidden="true">↑</span>
        </Button>
        <Button variant="ghost" size="sm" aria-label={`Move trigger ${idx + 1} down`} disabled={idx === total - 1} onClick={onMoveDown}>
          <span aria-hidden="true">↓</span>
        </Button>
        <Button variant="ghost" size="sm" aria-label={`Delete trigger ${idx + 1}`} tooltip="Delete trigger" onClick={onDelete}>×</Button>
        <button
          type="button"
          draggable
          tabIndex={-1}
          aria-hidden="true"
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          className="font-mono text-foreground/30 hover:text-foreground/60 shrink-0 leading-none cursor-grab active:cursor-grabbing"
        >
          ⠿
        </button>
      </div>

      <TriggerDialog
        open={open}
        onOpenChange={handleOpenChange}
        initial={trigger}
        onDone={t => onUpdate(t)}
        triggerRef={btnRef}
      />
    </div>
  );
}

// ── add trigger row ────────────────────────────────────────────────────────

function AddTriggerRow({ onAdd, onDialogOpenChange }: {
  onAdd: (t: HudTrigger) => void;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleOpenChange(o: boolean) {
    setOpen(o);
    onDialogOpenChange(o);
  }

  return (
    <div className="flex items-center py-1.5 border-b border-foreground/10 last:border-b-0">
      <Button
        ref={btnRef}
        variant="ghost"
        size="sm"
        aria-label="Add trigger"
        className="font-mono"
        onClick={() => handleOpenChange(true)}
      >
        + add trigger
      </Button>
      <TriggerDialog
        open={open}
        onOpenChange={handleOpenChange}
        initial={defaultTrigger('time')}
        onDone={t => { onAdd(t); }}
        triggerRef={btnRef}
      />
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────

export function TriggerView({ preset, onDone, onChange, onMatchChange }: {
  preset: HudPresetClient;
  onDone: () => void;
  onChange: (triggers: HudTrigger[]) => void;
  onMatchChange?: (match: 'all' | 'any') => void;
}) {
  const triggers = preset.triggers ?? [];
  const match = preset.match ?? 'all';
  const titleId = useId();

  const triggerIdsRef = useRef<string[]>(triggers.map(() => crypto.randomUUID()));

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const [reorderMsg, setReorderMsg] = useState('');

  // Guard Escape so it doesn't close TriggerView while a TriggerDialog is open
  const openDialogCountRef = useRef(0);
  function notifyDialogOpen(open: boolean) {
    openDialogCountRef.current += open ? 1 : -1;
  }

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => { prev?.focus(); };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && openDialogCountRef.current === 0) { e.preventDefault(); onDone(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDone]);

  function updateTrigger(idx: number, t: HudTrigger) {
    const next = [...triggers];
    next[idx] = t;
    onChange(next);
  }

  function deleteTrigger(idx: number) {
    onChange(triggers.filter((_, i) => i !== idx));
    triggerIdsRef.current = triggerIdsRef.current.filter((_, i) => i !== idx);
  }

  function moveTrigger(from: number, to: number) {
    if (to < 0 || to >= triggers.length) return;
    // Guard: IDs and triggers must be in sync for safe splice
    if (triggerIdsRef.current.length !== triggers.length) return;
    const next = [...triggers];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    const ids = [...triggerIdsRef.current];
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id!);
    triggerIdsRef.current = ids;
    onChange(next);
    setReorderMsg(`Trigger moved to position ${to + 1} of ${triggers.length}`);
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
    if (from !== null && from !== to) moveTrigger(from, to);
    endDrag();
  }

  function addTrigger(t: HudTrigger) {
    onChange([...triggers, t]);
    triggerIdsRef.current = [...triggerIdsRef.current, crypto.randomUUID()];
  }

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 bg-background text-foreground font-mono flex flex-col"
    >
      <header className="relative flex items-center px-5 py-4 shrink-0 gap-3">
        <span id={titleId} className="absolute inset-x-0 text-center font-mono text-xs text-foreground pointer-events-none">
          {preset.name} — trigger config
        </span>
        <div className="ml-auto flex items-center gap-3">
          {triggers.length >= 2 && onMatchChange && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">match</span>
              <Select
                aria-label="match mode"
                value={match}
                options={[{ value: 'all', label: 'all' }, { value: 'any', label: 'any' }]}
                onValueChange={v => { if (v === 'all' || v === 'any') onMatchChange(v); }}
              />
            </div>
          )}
          {/* Announce when match control disappears so AT users aren't left wondering */}
          {triggers.length < 2 && (
            <span role="status" aria-live="polite" className="sr-only">
              match mode inactive — add a second trigger to configure
            </span>
          )}
          <Button variant="default" size="sm" onClick={onDone}>done</Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-6">
          {triggers.length === 0 && (
            <p className="font-mono text-xs text-muted-foreground py-4">
              no triggers — this preset is always active
            </p>
          )}

          <span role="status" aria-live="polite" className="sr-only">{reorderMsg}</span>

          <div className="flex flex-col">
            {triggers.map((t, i) => (
              <TriggerRow
                key={triggerIdsRef.current[i] ?? String(i)}
                trigger={t}
                idx={i}
                total={triggers.length}
                onUpdate={u => updateTrigger(i, u)}
                onDelete={() => deleteTrigger(i)}
                onMoveUp={() => moveTrigger(i, i - 1)}
                onMoveDown={() => moveTrigger(i, i + 1)}
                onDragStart={() => startDrag(i)}
                onDragEnter={() => { if (dragIdxRef.current !== null) setDragOverIdx(i); }}
                onDragEnd={endDrag}
                onDrop={() => handleDrop(i)}
                dragging={dragIdx === i}
                dragOver={dragOverIdx === i && dragIdx !== i}
                onDialogOpenChange={notifyDialogOpen}
              />
            ))}

            <AddTriggerRow onAdd={addTrigger} onDialogOpenChange={notifyDialogOpen} />
          </div>
        </div>
      </div>
    </div>
  );
}
