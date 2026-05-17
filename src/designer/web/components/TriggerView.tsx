import { useState, useEffect, useRef, useId } from 'react';
import type { HudTrigger, HudPresetClient } from '../types/hud-preset.js';
import { Select } from './ui/select.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { ScrubInput } from './ui/scrub-input.js';
import { Checkbox } from './ui/checkbox.js';
import { Menu, MenuTrigger, MenuContent, MenuItem } from './ui/menu.js';

// ── constants ──────────────────────────────────────────────────────────────

const TRIGGER_TYPES = ['time', 'idle', 'active', 'day', 'date', 'threshold', 'interface', 'vm'] as const;
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
  idle:      'Active when no keyboard or mouse input has been detected for the configured idle timeout (daemon → idle_after_ms).',
  active:    'Active while the user is present — any input within the idle timeout window.',
  day:       'Active on selected days of the week.',
  date:      'Active on a specific month and day each year.',
  threshold: 'Active when a system metric (CPU, RAM, network) crosses a numeric boundary.',
  interface: 'Active when a named network interface is in a specific state (up or down).',
  vm:        'Active when a named virtual machine is in a specific state (running or stopped).',
};

const FW = 'w-24';

function defaultTrigger(type: TriggerType): HudTrigger {
  switch (type) {
    case 'time':      return { type: 'time', from: '00:00', to: '00:00' };
    case 'idle':      return { type: 'idle' };
    case 'active':    return { type: 'active' };
    case 'day':       return { type: 'day', days: ['mon'] as Weekday[] };
    case 'date':      return { type: 'date', month: 1, day: 1 };
    case 'threshold': return { type: 'threshold', metric: 'cpu' };
    case 'interface': return { type: 'interface', name: '', state: 'up' };
    case 'vm':        return { type: 'vm', name: '' };
  }
}

// ── field editors ──────────────────────────────────────────────────────────

type FieldProps = { trigger: HudTrigger; onChange: (t: HudTrigger) => void };

function parseHHMM(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

function fmtHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function TimePair({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [h, m] = parseHHMM(value);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-foreground/55 whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-1">
        <ScrubInput aria-label={`${label} hours`}   value={h} min={0} max={23} onChange={v => onChange(fmtHHMM(v, m))} className="w-8 text-center" />
        <span aria-hidden="true" className="font-mono text-xs text-foreground/40">:</span>
        <ScrubInput aria-label={`${label} minutes`} value={m} min={0} max={59} onChange={v => onChange(fmtHHMM(h, v))} className="w-8 text-center" />
      </div>
    </div>
  );
}

function TimeFields({ trigger, onChange }: FieldProps) {
  if (trigger.type !== 'time') return null;
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <TimePair label="from" value={trigger.from} onChange={v => onChange({ ...trigger, from: v })} />
      <TimePair label="to"   value={trigger.to}   onChange={v => onChange({ ...trigger, to: v })} />
    </div>
  );
}

function ThresholdFields({ trigger, onChange }: FieldProps) {
  const uid = useId();
  if (trigger.type !== 'threshold') return null;
  const t = trigger;
  const cfg = METRIC_CONFIG[t.metric];
  const conflict = t.above !== undefined && t.below !== undefined && t.above >= t.below;

  function update(patch: { metric?: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; above?: number; below?: number; clearAbove?: true; clearBelow?: true }) {
    type T = { type: 'threshold'; metric: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; above?: number; below?: number };
    const base: T = { type: 'threshold', metric: patch.metric ?? t.metric };
    const above = patch.clearAbove ? undefined : (patch.above !== undefined ? patch.above : t.above);
    const below = patch.clearBelow ? undefined : (patch.below !== undefined ? patch.below : t.below);
    if (above !== undefined) base.above = above;
    if (below !== undefined) base.below = below;
    onChange(base);
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="font-mono text-xs text-foreground/55">metric</label>
        <Select
          aria-label="Metric"
          value={t.metric}
          onChange={e => update({ metric: e.target.value as 'cpu' | 'ram' | 'net_rx' | 'net_tx' })}
        >
          {(['cpu', 'ram', 'net_rx', 'net_tx'] as const).map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${uid}-above-en`}
          checked={t.above !== undefined}
          onChange={e => e.target.checked ? update({ above: cfg.defaultVal }) : update({ clearAbove: true })}
        />
        <label htmlFor={`${uid}-above-en`} className="font-mono text-xs text-foreground/55 cursor-pointer select-none">above</label>
        {t.above !== undefined && (
          <ScrubInput
            aria-label="above threshold"
            value={t.above}
            min={cfg.min}
            max={cfg.max}
            pixelsPerUnit={cfg.pixelsPerUnit}
            onChange={v => update({ above: v })}
            className={FW}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${uid}-below-en`}
          checked={t.below !== undefined}
          onChange={e => e.target.checked ? update({ below: cfg.defaultVal }) : update({ clearBelow: true })}
        />
        <label htmlFor={`${uid}-below-en`} className="font-mono text-xs text-foreground/55 cursor-pointer select-none">below</label>
        {t.below !== undefined && (
          <ScrubInput
            aria-label="below threshold"
            value={t.below}
            min={cfg.min}
            max={cfg.max}
            pixelsPerUnit={cfg.pixelsPerUnit}
            onChange={v => update({ below: v })}
            className={FW}
          />
        )}
      </div>
      {conflict && (
        <span role="alert" className="font-mono text-xs text-yellow-400">above &ge; below — never matches</span>
      )}
    </div>
  );
}

function InterfaceFields({ trigger, onChange }: FieldProps) {
  const [ifaces, setIfaces] = useState<string[] | null>(null);

  useEffect(() => {
    fetch('/api/net-interfaces')
      .then(r => r.json() as Promise<{ ok: boolean; interfaces?: string[] }>)
      .then(d => setIfaces(d.interfaces ?? []))
      .catch(() => setIfaces([]));
  }, []);

  if (trigger.type !== 'interface') return null;

  const detected = ifaces ?? [];
  const useSelect = detected.length > 0;
  const isOther = useSelect && !detected.includes(trigger.name);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-foreground/55">name</span>
        {useSelect && (
          <Select
            aria-label="Interface name"
            value={isOther ? '__other__' : trigger.name}
            onChange={e => onChange({ ...trigger, name: e.target.value === '__other__' ? '' : e.target.value })}
          >
            {detected.map(iface => (
              <option key={iface} value={iface}>{iface}</option>
            ))}
            <option value="__other__">other…</option>
          </Select>
        )}
        {(!useSelect || isOther) && (
          <Input
            type="text"
            aria-label="Custom interface name"
            placeholder="eth0"
            value={trigger.name}
            onChange={e => onChange({ ...trigger, name: e.target.value })}
            className="w-32"
            expandedClassName="w-32"
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-foreground/55">state</span>
        <Select
          aria-label="Interface state"
          value={trigger.state}
          onChange={e => { const v = e.target.value; if (v === 'up' || v === 'down') onChange({ ...trigger, state: v }); }}
        >
          <option value="up">up</option>
          <option value="down">down</option>
        </Select>
      </div>
    </div>
  );
}

function VmFields({ trigger, onChange }: FieldProps) {
  if (trigger.type !== 'vm') return null;
  const stateValue = trigger.state ?? 'any';
  function update(name: string, state: string) {
    if (state === 'running' || state === 'stopped') onChange({ type: 'vm', name, state });
    else onChange({ type: 'vm', name });
  }
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Input
        type="text"
        label="name"
        aria-label="VM name"
        placeholder="vm-name"
        value={trigger.name}
        onChange={e => update(e.target.value, stateValue)}
        className="w-32"
        expandedClassName="w-32"
      />
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-foreground/55">state</span>
        <Select
          aria-label="VM state"
          value={stateValue}
          onChange={e => update(trigger.name, e.target.value)}
        >
          <option value="any">any</option>
          <option value="running">running</option>
          <option value="stopped">stopped</option>
        </Select>
      </div>
    </div>
  );
}

function DayFields({ trigger, onChange }: FieldProps) {
  if (trigger.type !== 'day') return null;
  function toggle(d: Weekday) {
    if (trigger.type !== 'day') return;
    const next = trigger.days.includes(d)
      ? trigger.days.filter(x => x !== d)
      : [...trigger.days, d];
    onChange({ type: 'day', days: next as Weekday[] });
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {DAYS.map(d => (
        <button
          key={d}
          type="button"
          aria-pressed={trigger.days.includes(d)}
          className={`font-mono text-xs border px-2 py-0.5 transition-colors ${
            trigger.days.includes(d)
              ? 'border-foreground text-foreground'
              : 'border-foreground/30 text-foreground/50 hover:text-foreground hover:border-foreground/60'
          }`}
          onClick={() => toggle(d)}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function DateFields({ trigger, onChange }: FieldProps) {
  if (trigger.type !== 'date') return null;
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <ScrubInput
        label="month"
        aria-label="Month"
        value={trigger.month}
        min={1}
        max={12}
        suffix={MONTHS[(trigger.month - 1) % 12]!}
        onChange={v => onChange({ ...trigger, month: v })}
        className="w-6 text-center"
      />
      <ScrubInput
        label="day"
        aria-label="Day of month"
        value={trigger.day}
        min={1}
        max={31}
        onChange={v => onChange({ ...trigger, day: v })}
        className={FW}
      />
    </div>
  );
}

// ── trigger row ────────────────────────────────────────────────────────────

function TriggerRow({ trigger, onUpdate, onDelete }: {
  trigger: HudTrigger;
  onUpdate: (t: HudTrigger) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <span className="font-mono text-xs font-bold text-foreground/60 shrink-0">
        {trigger.type}:
      </span>
      <div className="flex-1 min-w-0">
        {trigger.type === 'time'      && <TimeFields      trigger={trigger} onChange={onUpdate} />}
        {trigger.type === 'day'       && <DayFields       trigger={trigger} onChange={onUpdate} />}
        {trigger.type === 'date'      && <DateFields      trigger={trigger} onChange={onUpdate} />}
        {trigger.type === 'threshold' && <ThresholdFields trigger={trigger} onChange={onUpdate} />}
        {trigger.type === 'interface' && <InterfaceFields trigger={trigger} onChange={onUpdate} />}
        {trigger.type === 'vm'        && <VmFields        trigger={trigger} onChange={onUpdate} />}
        {(trigger.type === 'idle' || trigger.type === 'active') && (
          <p className="font-mono text-xs text-foreground/40">{TRIGGER_DESCRIPTIONS[trigger.type]}</p>
        )}
      </div>
      <Button
        variant="ghost"
        aria-label={`Delete ${trigger.type} trigger`}
        tooltip="Remove trigger"
        onClick={onDelete}
      >
        del
      </Button>
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

  const triggerIdsRef = useRef<string[]>(triggers.map(() => crypto.randomUUID()));
  if (triggerIdsRef.current.length !== triggers.length) {
    triggerIdsRef.current = triggers.map(() => crypto.randomUUID());
  }

  const [highlighted, setHighlighted] = useState<TriggerType | null>(null);
  const menuOpenRef = useRef(false);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => { prev?.focus(); };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !menuOpenRef.current) { e.preventDefault(); onDone(); }
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

  function addTrigger(type: TriggerType) {
    onChange([...triggers, defaultTrigger(type)]);
    triggerIdsRef.current = [...triggerIdsRef.current, crypto.randomUUID()];
  }

  return (
    <div
      role="dialog"
      aria-label={`Triggers — ${preset.name}`}
      aria-modal="true"
      className="fixed inset-0 z-50 bg-background text-foreground font-mono flex flex-col"
    >
      <header className="relative flex items-center pl-7 pr-5 py-4 shrink-0">
        <span className="absolute inset-x-0 text-center font-mono text-xs text-foreground pointer-events-none">
          {preset.name}
        </span>
        <Button variant="default" size="sm" className="ml-auto" onClick={onDone}>done</Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-6">
          {triggers.length >= 2 && onMatchChange && (
            <div className="flex items-center gap-2 mb-6">
              <span className="font-mono text-xs text-foreground/55">match</span>
              <Select
                aria-label="match mode"
                value={match}
                onChange={e => { const v = e.target.value; if (v === 'all' || v === 'any') onMatchChange(v); }}
              >
                <option value="all">all</option>
                <option value="any">any</option>
              </Select>
            </div>
          )}

          {triggers.length === 0 && (
            <p className="font-mono text-xs text-foreground/40 py-4">
              no triggers — this preset is always active
            </p>
          )}

          <div>
            {triggers.map((t, i) => (
              <TriggerRow
                key={triggerIdsRef.current[i] ?? String(i)}
                trigger={t}
                onUpdate={u => updateTrigger(i, u)}
                onDelete={() => deleteTrigger(i)}
              />
            ))}
          </div>

          <div className="mt-4">
            <Menu onOpenChange={open => { menuOpenRef.current = open; setHighlighted(open ? TRIGGER_TYPES[0]! : null); }}>
              <MenuTrigger asChild>
                <Button variant="ghost">+ add trigger</Button>
              </MenuTrigger>
              <MenuContent
                align="start"
                className="flex p-0 gap-0 overflow-hidden"
              >
                <div className="py-1.5">
                  {TRIGGER_TYPES.map(type => (
                    <MenuItem
                      key={type}
                      className="px-4"
                      onMouseEnter={() => setHighlighted(type)}
                      onFocus={() => setHighlighted(type)}
                      onSelect={() => addTrigger(type)}
                    >
                      {type}
                    </MenuItem>
                  ))}
                </div>
                <div
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className="w-52 shrink-0 border-l border-foreground/15 px-4 py-3 text-foreground/50 leading-relaxed"
                >
                  {highlighted ? TRIGGER_DESCRIPTIONS[highlighted] : ''}
                </div>
              </MenuContent>
            </Menu>
          </div>
        </div>
      </div>
    </div>
  );
}
