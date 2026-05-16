import { useState } from 'react';
import type { HudTrigger } from '../types/hud-preset.js';

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
  if (trigger.type !== 'time') return null;
  const [fromErr, setFromErr] = useState(false);
  const [toErr, setToErr] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        <label className="font-mono text-xs text-foreground/40">from</label>
        <input
          type="text"
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
      </div>
      <div className="flex items-center gap-1">
        <label className="font-mono text-xs text-foreground/40">to</label>
        <input
          type="text"
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
      </div>
    </>
  );
}

function ThresholdFields({ trigger, onChange }: RowProps) {
  if (trigger.type !== 'threshold') return null;
  const t = trigger; // capture narrowed type for use in closures
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
      <select
        className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 rounded-none focus:outline-none focus:border-white"
        value={trigger.metric}
        onChange={e => update({ metric: e.target.value as typeof trigger.metric })}
      >
        {(['cpu', 'ram', 'net_rx', 'net_tx'] as const).map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <label className="font-mono text-xs text-foreground/40">above</label>
        <input
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
        <label className="font-mono text-xs text-foreground/40">below</label>
        <input
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
        <span className="font-mono text-xs text-yellow-400" title="above ≥ below — condition can never be met">⚠</span>
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
        className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 w-24 rounded-none focus:outline-none focus:border-white"
        placeholder="name"
        value={trigger.name}
        onChange={e => onChange({ ...trigger, name: e.target.value })}
      />
      <select
        className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 rounded-none focus:outline-none focus:border-white"
        value={trigger.state}
        onChange={e => onChange({ ...trigger, state: e.target.value as 'up' | 'down' })}
      >
        <option value="up">up</option>
        <option value="down">down</option>
      </select>
    </>
  );
}

function VmFields({ trigger, onChange }: RowProps) {
  if (trigger.type !== 'vm') return null;
  const stateValue = trigger.state ?? 'any';

  function update(name: string, state: string) {
    if (state === 'any') {
      onChange({ type: 'vm', name });
    } else {
      onChange({ type: 'vm', name, state: state as 'running' | 'stopped' });
    }
  }

  return (
    <>
      <input
        type="text"
        className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 w-24 rounded-none focus:outline-none focus:border-white"
        placeholder="name"
        value={trigger.name}
        onChange={e => update(e.target.value, stateValue)}
      />
      <select
        className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-0.5 rounded-none focus:outline-none focus:border-white"
        value={stateValue}
        onChange={e => update(trigger.name, e.target.value)}
      >
        <option value="any">any</option>
        <option value="running">running</option>
        <option value="stopped">stopped</option>
      </select>
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
        className="font-mono text-xs text-foreground/40 hover:text-foreground ml-auto shrink-0 px-1"
        onClick={onDelete}
        aria-label="delete trigger"
      >
        ×
      </button>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export function TriggerEditor({ triggers, onChange, match = 'all', onMatchChange }: TriggerEditorProps) {
  const [expanded, setExpanded] = useState(true);
  const [picking, setPicking] = useState(false);

  function updateTrigger(idx: number, t: HudTrigger) {
    const next = [...triggers];
    next[idx] = t;
    onChange(next);
  }

  function deleteTrigger(idx: number) {
    onChange(triggers.filter((_, i) => i !== idx));
  }

  function addTrigger(type: TriggerType) {
    onChange([...triggers, defaultTrigger(type)]);
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
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>triggers ({triggers.length})</span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-0 mt-1">
          {/* match mode toggle — only shown with 2+ triggers */}
          {triggers.length >= 2 && onMatchChange && (
            <div className="flex items-center gap-1 mb-1">
              <span className="font-mono text-xs text-foreground/40">match</span>
              {(['all', 'any'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  className={`font-mono text-xs px-1.5 py-0.5 border transition-colors ${match === m ? 'border-foreground text-foreground' : 'border-foreground/20 text-foreground/40 hover:text-foreground hover:border-foreground/50'}`}
                  onClick={() => onMatchChange(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          {/* Trigger list */}
          {triggers.map((t, i) => (
            <TriggerRow
              key={i}
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
                  className="font-mono text-xs border border-foreground/30 px-2 py-0.5 text-foreground/70 hover:text-foreground hover:border-foreground transition-colors"
                  onClick={() => addTrigger(type)}
                >
                  {type}
                </button>
              ))}
              <button
                type="button"
                className="font-mono text-xs text-foreground/40 hover:text-foreground px-1"
                onClick={() => setPicking(false)}
                aria-label="cancel"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="font-mono text-xs text-foreground/40 hover:text-foreground mt-2 self-start"
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
