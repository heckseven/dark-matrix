import { useState, useEffect } from 'react';
import { useDesignerStore } from '../../store.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';

const BY_PATH_RE = /^\/dev\/(serial\/by-path\/[a-zA-Z0-9:._-]+|ttyACM\d+|ttyUSB\d+)$/;

interface HardwareValue {
  left: string;
  right: string;
}

interface HardwareTabProps {
  value: HardwareValue;
  onChange: (v: HardwareValue) => void;
}

type DetectState = 'idle' | 'running' | 'ok' | 'partial' | 'none' | 'error';

function PortRow({
  label, path, editing, onEdit, onChange,
}: {
  label: string; path: string; editing: boolean;
  onEdit: () => void; onChange: (v: string) => void;
}) {
  const valid = !path || BY_PATH_RE.test(path);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{label}</span>
        <Input
          value={path}
          readOnly={!editing}
          expandedClassName="w-80"
          onChange={e => onChange(e.target.value)}
          placeholder="not set"
          aria-label={`${label.charAt(0).toUpperCase() + label.slice(1)} module path`}
          spellCheck={false}
        />
        <Button variant="ghost" size="sm" onClick={onEdit}>
          {editing ? 'done' : 'edit'}
        </Button>
      </div>
      {editing && path && !valid && (
        <span className="font-mono text-xs text-red-400 pl-12">✗ invalid path</span>
      )}
    </div>
  );
}

export function HardwareTab({ value, onChange }: HardwareTabProps) {
  const saveConfig = useDesignerStore(s => s.saveConfig);
  const [detectState, setDetectState] = useState<DetectState>('idle');
  const [detectMsg, setDetectMsg] = useState('');
  const [editing, setEditing] = useState<'left' | 'right' | null>(null);

  async function detect() {
    setDetectState('running');
    setDetectMsg('');
    try {
      const res = await fetch('/api/matrix-modules');
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json() as { ok: boolean; ports: string[] };
      const ports = (data.ports ?? []).sort();
      if (ports.length === 2) {
        const [p0, p1] = [ports[0]!, ports[1]!];
        const alreadyAssigned =
          (value.left === p0 && value.right === p1) ||
          (value.left === p1 && value.right === p0);
        if (!alreadyAssigned) onChange({ left: p0, right: p1 });
        setDetectState('ok');
        setEditing(null);
      } else if (ports.length === 1) {
        setDetectState('partial');
        setDetectMsg('1 module found — expected 2');
      } else {
        setDetectState('none');
        setDetectMsg('no modules found — verify paths manually');
      }
    } catch {
      setDetectState('error');
      setDetectMsg('detection request failed');
    }
  }

  useEffect(() => { void detect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const configured = BY_PATH_RE.test(value.left) && BY_PATH_RE.test(value.right);

  return (
    <div className="flex flex-col gap-5 p-2">

      {/* detect row */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => void detect()} disabled={detectState === 'running'}>
            {detectState === 'running' ? 'detecting…' : 're-detect'}
          </Button>
          {detectState === 'ok' && (
            <span className="font-mono text-xs text-green-400">● 2 modules found</span>
          )}
          {(detectState === 'partial' || detectState === 'none' || detectState === 'error') && (
            <span className="font-mono text-xs text-amber-400">◐ {detectMsg}</span>
          )}
        </div>
        {configured && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Swap left and right modules"
              onClick={() => { onChange({ left: value.right, right: value.left }); void saveConfig(); }}
            >
              ⇄ swap
            </Button>
            <span className="font-mono text-xs text-muted-foreground">if left and right are reversed</span>
          </div>
        )}
      </div>

      {/* port rows */}
      <div className="flex flex-col gap-3">
        <PortRow
          label="left"
          path={value.left}
          editing={editing === 'left'}
          onEdit={() => setEditing(editing === 'left' ? null : 'left')}
          onChange={v => onChange({ ...value, left: v })}
        />
        <PortRow
          label="right"
          path={value.right}
          editing={editing === 'right'}
          onEdit={() => setEditing(editing === 'right' ? null : 'right')}
          onChange={v => onChange({ ...value, right: v })}
        />
      </div>

      {/* path reference — shown while editing */}
      {editing !== null && (
        <div className="font-mono text-xs text-muted-foreground flex flex-col gap-1 border-t border-foreground/10 pt-4">
          <p className="text-foreground/60 mb-1">finding the path manually</p>
          <p>prefer <span className="text-foreground/70">by-path</span> — stable across reboots:</p>
          <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1">ls /dev/serial/by-path/</pre>
          <p className="mt-2">to see which ttyACM* each entry maps to:</p>
          <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1">ls -la /dev/serial/by-path/</pre>
          <p className="mt-2">to identify which physical port is which, unplug one module and re-run — the entry that disappears is that module.</p>
        </div>
      )}
    </div>
  );
}
