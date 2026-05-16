import { useRef, useState } from 'react';
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
    if (v !== 'scroll' && v !== 'dmx' && v !== 'none') return;
    const anim = v;
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
    <div role="group" aria-label={`Rule ${idx + 1}: ${rule.app_name_glob}`} className="flex items-center gap-2 flex-wrap py-1.5 border-b border-foreground/10 last:border-b-0">
      {/* reorder */}
      <div className="flex flex-col shrink-0">
        <Button variant="ghost" aria-label="Move rule up" disabled={idx === 0} className="px-1 py-0 leading-none" onClick={onMoveUp}>↑</Button>
        <Button variant="ghost" aria-label="Move rule down" disabled={idx === total - 1} className="px-1 py-0 leading-none" onClick={onMoveDown}>↓</Button>
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
      <Button variant="ghost" aria-label={`Delete rule for ${rule.app_name_glob}`} className="ml-auto shrink-0 px-1" onClick={onDelete}>×</Button>
    </div>
  );
}

export function NotificationsTab({ value, onChange }: NotificationsTabProps) {
  const idsRef = useRef<string[]>(value.map(() => crypto.randomUUID()));

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
    <div className="flex flex-col p-2">
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

      <Button variant="ghost" className="mt-2 self-start" aria-label="Add rule" onClick={addRule}>
        + add rule
      </Button>

      <div className="font-mono text-xs text-foreground/40 flex flex-col gap-1 border-t border-foreground/10 mt-4 pt-4">
        <p className="text-foreground/60 mb-1">finding an app name</p>
        <p>sniff the next real notification from any app:</p>
        <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1 whitespace-pre-wrap">{'dbus-monitor --session "interface=\'org.freedesktop.Notifications\',member=\'Notify\'"'}</pre>
        <p className="mt-1">the first string argument on each <span className="text-foreground/70">Notify</span> call is the app name.</p>
        <p className="mt-2">or fire a synthetic one to test a specific name:</p>
        <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1">{'notify-send --app-name="Slack" "hello"'}</pre>

        <p className="text-foreground/60 mt-3 mb-1">glob patterns</p>
        <p><span className="text-foreground/70">*</span> matches any sequence — <span className="text-foreground/70">Slack*</span> matches Slack, SlackBot, etc.</p>
        <p className="mt-1"><span className="text-foreground/70">?</span> matches exactly one character — <span className="text-foreground/70">app?</span> matches app1, appX, etc.</p>
        <p className="mt-1">an exact string matches only that name — case-sensitive.</p>
        <p className="mt-1"><span className="text-foreground/70">*</span> alone matches everything and acts as a catch-all.</p>
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
    const glob = r.app_name_glob;
    const name = appName || '*';
    if (glob === '*') return true;
    if (glob === name) return true;
    return false;
  });

  return (
    <div className="mt-4 pt-4 border-t border-foreground/10 flex flex-col gap-2">
      <span className="font-mono text-xs text-foreground/50">test notification</span>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Test app name"
          placeholder="app name (or * for default)"
          value={appName}
          onChange={e => { setAppName(e.target.value); setResult(null); }}
          spellCheck={false}
        />
        <Button variant="ghost" disabled={firing} onClick={() => void fire()}>
          {firing ? 'firing…' : 'fire'}
        </Button>
        {result && (
          'error' in result
            ? <span className="font-mono text-xs text-red-400">{result.error}</span>
            : <span className="font-mono text-xs text-foreground/60">→ {result.action}{result.action === 'none' ? ' (suppressed)' : ''}</span>
        )}
      </div>
      {appName && matchedRule && !result && (
        <span className="font-mono text-xs text-foreground/40">
          matches rule: {matchedRule.app_name_glob} → {matchedRule.animation}
        </span>
      )}
    </div>
  );
}
