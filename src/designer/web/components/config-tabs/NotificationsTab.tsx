import { useRef, useState } from 'react';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { Button } from '../ui/button.js';
import { AssetPickerModal } from '../AssetPickerModal.js';

export type NotificationRule = {
  source?: 'ec-switch' | 'vm' | 'claude' | 'desktop-notification' | 'manual';
  app_name_glob?: string;
  urgency?: 'low' | 'normal' | 'critical' | 'any';
  content_glob?: string;
  animation: 'scroll' | 'dmx' | 'none';
  asset_path?: string;
  composite?: 'replace' | 'overlay';
  overlay_mode?: 'or' | 'replace' | 'xor' | 'halo';
  transition?: 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
  duration_ms_override?: number;
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
// The UI exposes these as "mic switch" and "cam switch" source options with an on/off/any state
// select, rather than making the user type a content glob.

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

function RuleRow({ rule, idx, total, onUpdate, onDelete, onMoveUp, onMoveDown }: RowProps) {
  const src = rule.source;
  const isDesktop = src === 'desktop-notification' || src === undefined;
  const needsAsset = rule.animation === 'dmx';
  const assetDisplay = rule.asset_path ?? rule.dmx_path ?? '';
  const durationDisplay = rule.duration_ms_override !== undefined ? String(rule.duration_ms_override) : '';
  const [pickerOpen, setPickerOpen] = useState(false);
  const vSrc = virtualSource(rule);
  const isMicSwitch = vSrc === 'mic-switch';
  const isCamSwitch = vSrc === 'cam-switch';

  function handleSourceChange(newVirt: string) {
    if (newVirt === 'mic-switch') {
      const state = (isMicSwitch || isCamSwitch) ? switchState(rule.content_glob) : 'any';
      onUpdate(buildRule(rule, { source: 'ec-switch', content_glob: toSwitchGlob('MIC', state) }));
    } else if (newVirt === 'cam-switch') {
      const state = (isMicSwitch || isCamSwitch) ? switchState(rule.content_glob) : 'any';
      onUpdate(buildRule(rule, { source: 'ec-switch', content_glob: toSwitchGlob('CAM', state) }));
    } else {
      const newSrc = newVirt === '' ? undefined : newVirt as NotificationRule['source'];
      const patch: RulePatch = { source: newSrc };
      if (isMicSwitch || isCamSwitch) patch.content_glob = '';
      onUpdate(buildRule(rule, patch));
    }
  }

  return (
    <div role="group" aria-label={`Rule ${idx + 1}`} className="flex items-center gap-2 flex-wrap py-1.5 border-b border-foreground/10 last:border-b-0">
      {/* reorder */}
      <div className="flex flex-col shrink-0">
        <Button variant="ghost" aria-label={`Move rule ${idx + 1} up`} disabled={idx === 0} className="px-1 py-0 leading-none" onClick={onMoveUp}>↑</Button>
        <Button variant="ghost" aria-label={`Move rule ${idx + 1} down`} disabled={idx === total - 1} className="px-1 py-0 leading-none" onClick={onMoveDown}>↓</Button>
      </div>

      {/* source */}
      <Select
        aria-label="Source"
        value={vSrc}
        onChange={e => handleSourceChange(e.target.value)}
      >
        <option value="">any source</option>
        <option value="desktop-notification">desktop-notification</option>
        <option value="mic-switch">mic switch</option>
        <option value="cam-switch">cam switch</option>
        <option value="vm">vm</option>
        <option value="claude">claude</option>
        <option value="manual">manual</option>
      </Select>

      {/* desktop-notification fields */}
      {isDesktop && (
        <>
          <Input
            aria-label="App name glob"
            placeholder="app name glob (*)"
            value={rule.app_name_glob ?? ''}
            onChange={e => onUpdate(buildRule(rule, { app_name_glob: e.target.value }))}
            spellCheck={false}
          />
          <Select
            aria-label="Urgency"
            value={rule.urgency ?? 'any'}
            onChange={e => {
              const v = e.target.value;
              onUpdate(buildRule(rule, {
                urgency: (v === 'low' || v === 'normal' || v === 'critical') ? v : 'any',
              }));
            }}
          >
            <option value="any">any urgency</option>
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="critical">critical</option>
          </Select>
        </>
      )}

      {/* switch state — mic or cam switch */}
      {(isMicSwitch || isCamSwitch) && (
        <Select
          aria-label="Switch state"
          value={switchState(rule.content_glob)}
          onChange={e => {
            const state = e.target.value as SwitchState;
            const prefix = isMicSwitch ? 'MIC' : 'CAM';
            onUpdate(buildRule(rule, { content_glob: toSwitchGlob(prefix, state) }));
          }}
        >
          <option value="any">any</option>
          <option value="on">on</option>
          <option value="off">off</option>
        </Select>
      )}

      {/* content glob — non-desktop sources other than mic/cam switch */}
      {!isDesktop && !isMicSwitch && !isCamSwitch && (
        <Input
          aria-label="Content glob"
          placeholder="content glob (*)"
          value={rule.content_glob ?? ''}
          onChange={e => onUpdate(buildRule(rule, { content_glob: e.target.value }))}
          spellCheck={false}
        />
      )}

      {/* animation */}
      <Select
        aria-label="Animation"
        value={rule.animation}
        onChange={e => {
          const v = e.target.value;
          if (v === 'dmx') {
            onUpdate(buildRule(rule, { animation: 'dmx', transition: 'dissolve', overlay_mode: 'halo', composite: 'overlay' }));
          } else if (v === 'scroll' || v === 'none') {
            onUpdate(buildRule(rule, { animation: v }));
          }
        }}
      >
        <option value="scroll">scroll</option>
        <option value="dmx">dmx</option>
        <option value="none">none</option>
      </Select>

      {/* asset picker — for dmx */}
      {needsAsset && (
        <>
          <Button
            variant="ghost"
            aria-label={assetDisplay ? `Asset: ${assetDisplay}, click to change` : 'Pick asset'}
            className="font-mono text-xs max-w-[10rem] truncate"
            onClick={() => setPickerOpen(true)}
          >
            {assetDisplay
              ? <span className="truncate">{assetDisplay.replace('.dmx.json', '')}</span>
              : <span className="text-foreground/40">pick asset…</span>}
          </Button>
          {assetDisplay && (
            <Button
              variant="ghost"
              aria-label="Clear asset"
              className="px-1 text-foreground/40 hover:text-foreground/70"
              onClick={() => onUpdate(buildRule(rule, { asset_path: undefined }))}
            >×</Button>
          )}
          <AssetPickerModal
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            {...(assetDisplay ? { current: assetDisplay } : {})}
            onPick={filename => onUpdate(buildRule(rule, { asset_path: filename }))}
          />
        </>
      )}

      {/* blend — DMX only (collapses composite + overlay_mode) */}
      {rule.animation === 'dmx' && (
        <Select
          aria-label="Blend"
          value={rule.overlay_mode ?? (rule.composite === 'overlay' ? 'or' : 'replace')}
          onChange={e => {
            const v = e.target.value as 'replace' | 'or' | 'xor' | 'halo';
            if (v === 'replace') {
              onUpdate(buildRule(rule, { composite: 'replace', overlay_mode: undefined }));
            } else {
              onUpdate(buildRule(rule, { composite: 'overlay', overlay_mode: v }));
            }
          }}
        >
          <option value="replace">replace</option>
          <option value="or">additive</option>
          <option value="xor">xor</option>
          <option value="halo">halo</option>
        </Select>
      )}

      {/* transition — DMX only */}
      {rule.animation === 'dmx' && (
        <Select
          aria-label="Transition"
          value={rule.transition ?? 'none'}
          onChange={e => {
            const v = e.target.value;
            onUpdate(buildRule(rule, { transition: v === 'none' ? undefined : v as NotificationRule['transition'] }));
          }}
        >
          <option value="none">no transition</option>
          <option value="wipe">wipe</option>
          <option value="scan">scan</option>
          <option value="slide">slide</option>
          <option value="dissolve">dissolve</option>
          <option value="flash">flash</option>
        </Select>
      )}

      {/* composite — scroll only */}
      {rule.animation === 'scroll' && (
        <Select
          aria-label="Composite"
          value={rule.composite ?? 'replace'}
          onChange={e => {
            const v = e.target.value;
            onUpdate(buildRule(rule, { composite: v === 'overlay' ? 'overlay' : 'replace' }));
          }}
        >
          <option value="replace">replace</option>
          <option value="overlay">overlay</option>
        </Select>
      )}

      {/* duration override */}
      <Input
        aria-label="Duration override ms"
        placeholder="duration ms"
        type="number"
        min="100"
        value={durationDisplay}
        onChange={e => {
          const n = parseInt(e.target.value, 10);
          onUpdate(buildRule(rule, { duration_ms_override: isNaN(n) || n <= 0 ? undefined : n }));
        }}
        style={{ width: '7rem' }}
        spellCheck={false}
      />

      {/* delete */}
      <Button variant="ghost" aria-label={`Delete rule ${idx + 1}`} className="ml-auto shrink-0 px-1" onClick={onDelete}>×</Button>
    </div>
  );
}

export function NotificationsTab({ value, onChange }: NotificationsTabProps) {
  const idsRef = useRef<string[]>(value.map(() => crypto.randomUUID()));

  function addRule() {
    onChange([...value, { animation: 'scroll' as const }]);
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
      <p className="font-mono text-xs text-white/55 mb-2">
        first match wins — default when no rules match: scroll (replace)
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

      <div className="font-mono text-xs text-foreground/55 flex flex-col gap-1 border-t border-foreground/10 mt-4 pt-4">
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
      <span className="font-mono text-xs text-foreground/50">test notification</span>
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
      <span aria-live="polite" className="font-mono text-xs text-foreground/55">
        {appName && matchedRule && !result && (
          <>matches rule: {matchedRule.app_name_glob ?? matchedRule.content_glob ?? '*'} → {matchedRule.animation}</>
        )}
      </span>
    </div>
  );
}
