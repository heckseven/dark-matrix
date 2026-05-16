import { useState } from 'react';
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

function PortField({
  label,
  value,
  onChange,
  detected,
  onPick,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  detected: string[];
  onPick: (port: string) => void;
}) {
  const valid = BY_PATH_RE.test(value);
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          expandedClassName="w-96"
          onChange={e => onChange(e.target.value)}
          aria-label={label}
          spellCheck={false}
        />
        {detected.length > 0 && (
          <select
            aria-label={`Pick detected port for ${label}`}
            className="font-mono text-xs bg-background text-foreground border border-foreground/30 px-2 py-[3px] rounded-none focus:outline-none focus:border-white"
            value=""
            onChange={e => { if (e.target.value) onPick(e.target.value); }}
          >
            <option value="">pick…</option>
            {detected.map(p => <option key={p} value={p}>{p.replace('/dev/serial/by-path/', '')}</option>)}
          </select>
        )}
      </div>
      {value.length > 0 && (
        <span className={`font-mono text-xs ${valid ? 'text-green-400' : 'text-red-400'}`}>
          {valid ? '✓ valid path' : '✗ invalid path'}
        </span>
      )}
    </div>
  );
}

export function HardwareTab({ value, onChange }: HardwareTabProps) {
  const [detected, setDetected] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');

  async function detect() {
    setDetecting(true);
    setDetectError('');
    try {
      const res = await fetch('/api/serial-ports');
      const { ports } = await res.json() as { ok: boolean; ports: string[] };
      setDetected(ports);
      if (ports.length === 0) setDetectError('no serial ports found');
    } catch {
      setDetectError('request failed');
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-2">
      <div className="flex flex-col gap-4">
        <PortField
          label="left module"
          value={value.left}
          onChange={left => onChange({ ...value, left })}
          detected={detected}
          onPick={left => onChange({ ...value, left })}
        />
        <PortField
          label="right module"
          value={value.right}
          onChange={right => onChange({ ...value, right })}
          detected={detected}
          onPick={right => onChange({ ...value, right })}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void detect()}
          disabled={detecting}
          className="font-mono text-xs border border-foreground/30 px-3 py-1 hover:border-foreground/70 disabled:opacity-40 transition-colors"
        >
          {detecting ? 'detecting…' : 'autodetect ports'}
        </button>
        {detectError && <span className="font-mono text-xs text-red-400">{detectError}</span>}
        {detected.length > 0 && !detectError && (
          <span className="font-mono text-xs text-foreground/50">{detected.length} port{detected.length !== 1 ? 's' : ''} found</span>
        )}
      </div>

      <div className="font-mono text-xs text-foreground/40 flex flex-col gap-1 border-t border-foreground/10 pt-4">
        <p className="text-foreground/60 mb-1">finding the path manually</p>
        <p>prefer <span className="text-foreground/70">by-path</span> — it survives reboots:</p>
        <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1">ls /dev/serial/by-path/</pre>
        <p className="mt-2">fallback if by-path is absent:</p>
        <pre className="bg-foreground/5 px-2 py-1 rounded-sm mt-1">ls /dev/ttyACM* /dev/ttyUSB*</pre>
        <p className="mt-2">to identify which physical port is which, unplug one module and re-run — the entry that disappears is that module.</p>
      </div>
    </div>
  );
}
