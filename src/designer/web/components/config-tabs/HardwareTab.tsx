import * as React from 'react';
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = BY_PATH_RE.test(value);
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-xs text-muted-foreground">{label}</label>
      <Input
        value={value}
        expandedClassName="w-96"
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        spellCheck={false}
      />
      {value.length > 0 && (
        <span className={`font-mono text-xs ${valid ? 'text-green-400' : 'text-red-400'}`}>
          {valid ? '✓ valid path' : '✗ invalid path'}
        </span>
      )}
    </div>
  );
}

export function HardwareTab({ value, onChange }: HardwareTabProps) {
  return (
    <div className="flex flex-col gap-4 p-2">
      <PortField
        label="left module"
        value={value.left}
        onChange={left => onChange({ ...value, left })}
      />
      <PortField
        label="right module"
        value={value.right}
        onChange={right => onChange({ ...value, right })}
      />
    </div>
  );
}
