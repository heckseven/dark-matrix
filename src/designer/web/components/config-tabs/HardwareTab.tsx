import { useState, useEffect } from 'react';
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

function portLabel(p: string): string {
  return p.replace('/dev/serial/by-path/', '').replace('/dev/', '');
}

function PortChip({ label, path: p }: { label: string; path: string }) {
  const valid = BY_PATH_RE.test(p);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{label}</span>
      <span
        className={`font-mono text-xs px-2 py-0.5 rounded-sm border ${valid ? 'border-foreground/20 text-foreground' : 'border-red-500/40 text-red-400'}`}
        title={p}
      >
        {p ? portLabel(p) : <span className="text-muted-foreground">not set</span>}
      </span>
    </div>
  );
}

export function HardwareTab({ value, onChange }: HardwareTabProps) {
  const [detected, setDetected] = useState<string[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  async function detect() {
    setDetecting(true);
    setDetectMsg('');
    try {
      const res = await fetch('/api/matrix-modules');
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json() as { ok: boolean; ports: string[] };
      const ports = data.ports ?? [];
      setDetected(ports);
      if (ports.length === 2) {
        onChange({ left: ports[0]!, right: ports[1]! });
        setDetectMsg('');
      } else if (ports.length === 1) {
        setDetectMsg('1 module found — expected 2');
        setShowOverride(true);
      } else {
        setDetectMsg('no modules found');
        setShowOverride(true);
      }
    } catch {
      setDetectMsg('detection failed');
      setShowOverride(true);
    } finally {
      setDetecting(false);
    }
  }

  useEffect(() => { void detect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const detectedOk = detected !== null && detected.length === 2;

  return (
    <div className="flex flex-col gap-5 p-2">

      {/* detect row */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => void detect()} disabled={detecting}>
          {detecting ? 'detecting…' : 're-detect'}
        </Button>
        {!detecting && detected !== null && (
          detectedOk
            ? <span className="font-mono text-xs text-green-400">● 2 modules found</span>
            : <span className="font-mono text-xs text-red-400">✗ {detectMsg}</span>
        )}
      </div>

      {/* port chips + swap */}
      {detectedOk && (
        <div className="flex flex-col gap-2">
          <PortChip label="left" path={value.left} />
          <PortChip label="right" path={value.right} />
          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Swap left and right modules"
              onClick={() => onChange({ left: value.right, right: value.left })}
            >
              ⇄ swap
            </Button>
            <span className="font-mono text-xs text-muted-foreground">if left and right are reversed</span>
          </div>
        </div>
      )}

      {/* override toggle */}
      <div className="flex flex-col gap-3">
        <button
          className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors text-left w-fit"
          onClick={() => setShowOverride(v => !v)}
          aria-expanded={showOverride}
        >
          {showOverride ? '▾' : '▸'} override paths manually
        </button>

        {showOverride && (
          <div className="flex flex-col gap-3 pl-3 border-l border-foreground/10">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-muted-foreground">left</span>
              <Input
                value={value.left}
                expandedClassName="w-96"
                onChange={e => onChange({ ...value, left: e.target.value })}
                aria-label="Left module path"
                spellCheck={false}
              />
              {value.left && !BY_PATH_RE.test(value.left) && (
                <span className="font-mono text-xs text-red-400">✗ invalid path</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-muted-foreground">right</span>
              <Input
                value={value.right}
                expandedClassName="w-96"
                onChange={e => onChange({ ...value, right: e.target.value })}
                aria-label="Right module path"
                spellCheck={false}
              />
              {value.right && !BY_PATH_RE.test(value.right) && (
                <span className="font-mono text-xs text-red-400">✗ invalid path</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* reference */}
      <div className="font-mono text-xs text-muted-foreground flex flex-col gap-1 border-t border-foreground/10 pt-4">
        <p className="text-foreground/60 mb-1">finding the path manually</p>
        <p>prefer <span className="text-foreground/70">by-path</span> — it survives reboots:</p>
        <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1">ls /dev/serial/by-path/</pre>
        <p className="mt-2">to identify which physical port is which, unplug one module and re-run — the entry that disappears is that module.</p>
      </div>
    </div>
  );
}
