import { useRef } from 'react';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { Button } from '../ui/button.js';

export type NotificationRule = {
  app_name_glob: string;
  urgency?: 'low' | 'normal' | 'critical' | 'any';
  animation: 'scroll' | 'dmx' | 'none';
  dmx_path?: string;
};

export type NotificationsTabProps = {
  value: NotificationRule[];
  onChange: (rules: NotificationRule[]) => void;
};

type RowProps = {
  rule: NotificationRule;
  idx: number;
  total: number;
  onUpdate: (rule: NotificationRule) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

function RuleRow({ rule, idx, total, onUpdate, onDelete, onMoveUp, onMoveDown }: RowProps) {
  const urgencyValue = rule.urgency ?? 'any';

  function handleUrgency(v: string) {
    if (v === 'low' || v === 'normal' || v === 'critical') {
      const updated: NotificationRule = {
        app_name_glob: rule.app_name_glob,
        animation: rule.animation,
        urgency: v,
        ...(rule.dmx_path !== undefined && rule.dmx_path !== '' ? { dmx_path: rule.dmx_path } : {}),
      };
      onUpdate(updated);
    } else {
      const updated: NotificationRule = {
        app_name_glob: rule.app_name_glob,
        animation: rule.animation,
        ...(rule.dmx_path !== undefined && rule.dmx_path !== '' ? { dmx_path: rule.dmx_path } : {}),
      };
      onUpdate(updated);
    }
  }

  function handleAnimation(v: string) {
    const anim = v as NotificationRule['animation'];
    const updated: NotificationRule = {
      app_name_glob: rule.app_name_glob,
      animation: anim,
      ...(urgencyValue !== 'any' ? { urgency: urgencyValue } : {}),
      ...(rule.dmx_path !== undefined && rule.dmx_path !== '' ? { dmx_path: rule.dmx_path } : {}),
    };
    onUpdate(updated);
  }

  function handleDmxPath(v: string) {
    const updated: NotificationRule = {
      app_name_glob: rule.app_name_glob,
      animation: rule.animation,
      ...(urgencyValue !== 'any' ? { urgency: urgencyValue } : {}),
      ...(v !== '' ? { dmx_path: v } : {}),
    };
    onUpdate(updated);
  }

  function handleGlob(v: string) {
    const updated: NotificationRule = {
      app_name_glob: v,
      animation: rule.animation,
      ...(urgencyValue !== 'any' ? { urgency: urgencyValue } : {}),
      ...(rule.dmx_path !== undefined && rule.dmx_path !== '' ? { dmx_path: rule.dmx_path } : {}),
    };
    onUpdate(updated);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap py-1.5 border-b border-foreground/10 last:border-b-0">
      {/* reorder */}
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          aria-label="Move rule up"
          disabled={idx === 0}
          className="font-mono text-xs text-foreground/40 hover:text-foreground disabled:opacity-20 leading-none px-0.5"
          onClick={onMoveUp}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move rule down"
          disabled={idx === total - 1}
          className="font-mono text-xs text-foreground/40 hover:text-foreground disabled:opacity-20 leading-none px-0.5"
          onClick={onMoveDown}
        >
          ↓
        </button>
      </div>

      {/* glob */}
      <Input
        aria-label="App name glob"
        placeholder="*"
        value={rule.app_name_glob}
        onChange={e => handleGlob(e.target.value)}
        spellCheck={false}
      />

      {/* urgency */}
      <Select
        aria-label="Urgency"
        value={urgencyValue}
        onChange={e => handleUrgency(e.target.value)}
      >
        <option value="any">any (default)</option>
        <option value="low">low</option>
        <option value="normal">normal</option>
        <option value="critical">critical</option>
      </Select>

      {/* animation */}
      <Select
        aria-label="Animation"
        value={rule.animation}
        onChange={e => handleAnimation(e.target.value)}
      >
        <option value="scroll">scroll</option>
        <option value="dmx">dmx</option>
        <option value="none">none</option>
      </Select>

      {/* dmx_path — only shown when animation === 'dmx' */}
      {rule.animation === 'dmx' && (
        <Input
          aria-label="DMX path"
          placeholder="path/to/file.dmx.json"
          value={rule.dmx_path ?? ''}
          onChange={e => handleDmxPath(e.target.value)}
          spellCheck={false}
        />
      )}

      {/* delete */}
      <button
        type="button"
        aria-label={`Delete rule for ${rule.app_name_glob}`}
        className="font-mono text-xs text-foreground/40 hover:text-foreground ml-auto shrink-0 px-1"
        onClick={onDelete}
      >
        ×
      </button>
    </div>
  );
}

export function NotificationsTab({ value, onChange }: NotificationsTabProps) {
  const idsRef = useRef<string[]>(value.map(() => crypto.randomUUID()));
  if (idsRef.current.length !== value.length) {
    idsRef.current = value.map(() => crypto.randomUUID());
  }

  function addRule() {
    onChange([...value, { app_name_glob: '*', animation: 'scroll' }]);
    idsRef.current = [...idsRef.current, crypto.randomUUID()];
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
    <div className="flex flex-col gap-0 p-2">
      <p className="font-mono text-xs text-white/40 mb-2">
        first match wins — default when no rules match: scroll
      </p>

      <div className="flex flex-col">
        {value.map((rule, idx) => (
          <RuleRow
            key={idsRef.current[idx] ?? String(idx)}
            rule={rule}
            idx={idx}
            total={value.length}
            onUpdate={r => updateRule(idx, r)}
            onDelete={() => deleteRule(idx)}
            onMoveUp={() => moveRule(idx, idx - 1)}
            onMoveDown={() => moveRule(idx, idx + 1)}
          />
        ))}
      </div>

      <Button variant="ghost" className="mt-2 self-start" onClick={addRule}>
        + add rule
      </Button>
    </div>
  );
}
