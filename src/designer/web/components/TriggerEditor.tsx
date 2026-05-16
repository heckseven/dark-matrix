import { useState, useId, useRef } from 'react';
import type { HudTrigger } from '../types/hud-preset.js';
import { Select } from './ui/select.js';
import { Tabs } from './ui/tabs.js';

export type TriggerEditorProps = {
  triggers: HudTrigger[];
  onChange: (triggers: HudTrigger[]) => void;
  match?: 'all' | 'any';
  onMatchChange?: (match: 'all' | 'any') => void;
};

const TIME_RE = /^\d{2}:\d{2}$/;

const TRIGGER_TYPES = ['time', 'idle', 'active', 'threshold', 'interface', 'vm'] as const;
type TriggerType = typeof TRIGGER_TYPES[number];

function defaultTrigger(type: TriggerType): HudTrigger {
  switch (type) {
    case 'time':      return { type: 'time', from: '00:00', to: '00:00' };
    case 'idle':      return { type: 'idle' };
    case 'active':    return { type: 'active' };
    case 'threshold': return { type: 'threshold', metric: 'cpu' };
    case 'interface': return { type: 'interface', name: '', state: 'up' };
    case 'vm':        return { type: 'vm', name: '' };
  }
}

// ── inline field editors ───────────────────────────────────────────────────

type RowProps = {
  trigger: HudTrigger;
  onChange: (t: HudTrigger) => void;
};

function TimeFields({ trigger, onChange }: RowProps) {
  const [fromErr, setFromErr] = useState(false);
  const [toErr, setToErr] = useState(false);
  const uid = useId();
  if (trigger.type !== 'time') return null;

  return (
    <>
      <div className="flex items-center gap-1">
        <label htmlFor={`${uid}-from`} className="font-mono text-xs text-foreground/55">from</label>
        <input
          id={`${uid}-from`}
          type="text"
          aria-invalid={fromErr}
          aria-describedby={fromErr ? `${uid}-from-err` : undefined}
          className={`font-mono text-xs bg-background text-foreground border px-2 py-0.5 w-20 rounded-none focus:outline-none focus:border-white ${fromErr ? 'border-red-500' : 'border-foreground/30'}`}
          defaultValue={trigger.from}
          onBlur={e => {
            const v = e.target.value;
            if (!TIME_RE.test(v)) { setFromErr(true); return; }
            setFromErr(false);
            onChange({ ...trigger, from: v });
          }}
          onChange={() => setFromErr(false)}
        />
        {fromErr && <span id={`${uid}-from-err`} className="sr-only">Invalid time — use HH:MM</span>}
      </div>
      <div className="flex items-center gap-1">
        <label htmlFor={`${uid}-to`} className="font-mono text-xs text-foreground/55">to</label>
        <input
          id={`${uid}-to`}
          type="text"
          aria-invalid={toErr}
          aria-describedby={toErr ? `${uid}-to-err` : undefined}
          className={`font-mono text-xs bg-background text-foreground border px-2 py-0.5 w-20 rounded-none focus:outline-none focus:border-white ${toErr ? 'border-red-500' : 'border-foreground/30'}`}
          defaultValue={trigger.to}
          onBlur={e => {
            const v = e.target.value;
            if (!TIME_RE.test(v)) { setToErr(true); return; }
            setToErr(false);
            onChange({ ...trigger, to: v });
          }}
          onChange={() => setToErr(false)}
        />
        {toErr && <span id={`${uid}-to-err`} className="sr-only">Invalid time — use HH:MM</span>}
      </div>
    </>
  );
}

function ThresholdFields({ trigger, onChange }: RowProps) {
  const uid = useId();
  if (trigger.type !== 'threshold') return null;
  const t = trigger;
  const conflict =
    t.above !== undefined &&
    t.below !== undefined &&
    t.above >= t.below;

  function update(patch: { metric?: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; above?: number; below?: number; clearAbove?: boolean; clearBelow?: boolean }) {
    type ThresholdTrigger = { type: 'threshold'; metric: 'cpu' | 'ram' | 'net_rx' | 'net_tx'; above?: number; below?: number };
    const base: ThresholdTrigger = { type: 'threshold', metric: patch.metric ?? t.metric };
    const above = patch.clearAbove ? undefined : (patch.above !== undefined ? patch.above : t.above);
    const below = patch.clearBelow ? undefined : (patch.below !== undefined ? patch.below : t.below);
    if (above !== undefined) base.above = above;
    if (below !== undefined) base.below = below;
    onChange(base);
  }

  return (
    <>
      <Select
        aria-label="Metric"
        value={trigger.metric}
        onChange={e => update({ metric: e.target.value as typeof trigger.metric })}
      >
        {(['cpu', 'ram', 'net_rx', 'net_tx'] as const).map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </Select>
      <div className="flex items-center gap-1">
        <label htmlFor={`${uid}-above`} className="font-mono text-xs text-foreground/55">above</label>
        <input
          id={`${uid}-above`}
          type="number"
          className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 w-16 rounded-none focus:outline-none focus:border-white"
          value={trigger.above ?? ''}
          onChange={e => {
            if (e.target.value === '') update({ clearAbove: true });
            else update({ above: Number(e.target.value) });
          }}
        />
      </div>
      <div className="flex items-center gap-1">
        <label htmlFor={`${uid}-below`} className="font-mono text-xs text-foreground/55">below</label>
        <input
          id={`${uid}-below`}
          type="number"
          className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 w-16 rounded-none focus:outline-none focus:border-white"
          value={trigger.below ?? ''}
          onChange={e => {
            if (e.target.value === '') update({ clearBelow: true });
            else update({ below: Number(e.target.value) });
          }}
        />
      </div>
      {conflict && (
        <span role="alert" className="font-mono text-xs text-yellow-400">
          <span aria-hidden="true">⚠</span>
          <span className="sr-only">above is ≥ below — condition can never be met</span>
        </span>
      )}
    </>
  );
}

function InterfaceFields({ trigger, onChange }: RowProps) {
  if (trigger.type !== 'interface') return null;
  return (
    <>
      <input
        type="text"
        aria-label="Interface name"
        className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 w-24 rounded-none focus:outline-none focus:border-white"
        placeholder="name"
        value={trigger.name}
        onChange={e => onChange({ ...trigger, name: e.target.value })}
      />
      <Select
        aria-label="Interface state"
        value={trigger.state}
        onChange={e => onChange({ ...trigger, state: e.target.value as 'up' | 'down' })}
      >
        <option value="up">up</option>
        <option value="down">down</option>
      </Select>
    </>
  );
}

function VmFields({ trigger, onChange }: RowProps) {
  if (trigger.type !== 'vm') return null;
  const stateValue = trigger.state ?? 'any';

  function update(name: string, state: string) {
    if (state === 'running' || state === 'stopped') {
      onChange({ type: 'vm', name, state });
    } else {
      onChange({ type: 'vm', name });
    }
  }

  return (
    <>
      <input
        type="text"
        aria-label="VM name"
        className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 w-24 rounded-none focus:outline-none focus:border-white"
        placeholder="name"
        value={trigger.name}
        onChange={e => update(e.target.value, stateValue)}
      />
      <Select
        aria-label="VM state"
        value={stateValue}
        onChange={e => update(trigger.name, e.target.value)}
      >
        <option value="any">any</option>
        <option value="running">running</option>
        <option value="stopped">stopped</option>
      </Select>
    </>
  );
}

// ── trigger row ────────────────────────────────────────────────────────────

type TriggerRowProps = {
  trigger: HudTrigger;
  onUpdate: (t: HudTrigger) => void;
  onDelete: () => void;
};

function TriggerRow({ trigger, onUpdate, onDelete }: TriggerRowProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap py-1 border-b border-foreground/10 last:border-b-0">
      <span className="font-mono text-xs text-foreground/60 border border-foreground/30 px-1.5 py-0.5 shrink-0">
        {trigger.type}
      </span>
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        {trigger.type === 'time'      && <TimeFields      trigger={trigger} onChange={onUpdate} />}
        {trigger.type === 'threshold' && <ThresholdFields trigger={trigger} onChange={onUpdate} />}
        {trigger.type === 'interface' && <InterfaceFields trigger={trigger} onChange={onUpdate} />}
        {trigger.type === 'vm'        && <VmFields        trigger={trigger} onChange={onUpdate} />}
      </div>
      <button
        type="button"
        className="font-mono text-xs text-foreground/55 hover:text-foreground ml-auto shrink-0 px-1"
        onClick={onDelete}
        aria-label={`Delete ${trigger.type} trigger`}
      >
        ×
      </button>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export function TriggerEditor({ triggers, onChange, match = 'all', onMatchChange }: TriggerEditorProps) {
  const uid = useId();
  const [expanded, setExpanded] = useState(true);
  const [picking, setPicking] = useState(false);
  const triggerIdsRef = useRef<string[]>(triggers.map(() => crypto.randomUUID()));
  if (triggerIdsRef.current.length !== triggers.length) {
    triggerIdsRef.current = triggers.map(() => crypto.randomUUID());
  }

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
    setPicking(false);
  }

  return (
    <div className="flex flex-col border-t border-foreground/20 pt-2 pb-4 px-2">
      {/* Header */}
      <button
        type="button"
        className="flex items-center gap-2 font-mono text-xs text-foreground/60 hover:text-foreground py-1 self-start"
        onClick={() => { setExpanded(e => !e); if (expanded) setPicking(false); }}
        aria-expanded={expanded}
        aria-controls={`${uid}-body`}
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span>triggers ({triggers.length})</span>
      </button>

      {expanded && (
        <div id={`${uid}-body`} className="flex flex-col gap-0 mt-1">
          {/* match mode toggle — only shown with 2+ triggers */}
          {triggers.length >= 2 && onMatchChange && (
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-foreground/55" aria-hidden="true">match</span>
              <Tabs
                options={['all', 'any']}
                value={match}
                onChange={(v) => { if (v === 'all' || v === 'any') onMatchChange(v); }}
                aria-label="match mode"
              />
            </div>
          )}
          {/* Trigger list */}
          {triggers.map((t, i) => (
            <TriggerRow
              key={triggerIdsRef.current[i] ?? String(i)}
              trigger={t}
              onUpdate={t => updateTrigger(i, t)}
              onDelete={() => deleteTrigger(i)}
            />
          ))}

          {/* Add trigger */}
          {picking ? (
            <div className="flex flex-wrap gap-1 mt-2">
              {TRIGGER_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  aria-label={`Add ${type} trigger`}
                  className="font-mono text-xs border border-foreground/30 px-2 py-0.5 text-foreground/70 hover:text-foreground hover:border-foreground transition-colors"
                  onClick={() => addTrigger(type)}
                >
                  {type}
                </button>
              ))}
              <button
                type="button"
                className="font-mono text-xs text-foreground/55 hover:text-foreground px-1"
                onClick={() => setPicking(false)}
                aria-label="cancel"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="font-mono text-xs text-foreground/55 hover:text-foreground mt-2 self-start"
              onClick={() => setPicking(true)}
            >
              + add trigger
            </button>
          )}
        </div>
      )}
    </div>
  );
}
