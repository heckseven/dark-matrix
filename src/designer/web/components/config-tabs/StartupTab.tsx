import * as React from 'react';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';

type StartupAnimation = 'gol-random' | 'scroll' | 'dmx' | 'none';

interface StartupValue {
  animation: StartupAnimation;
  scroll_text: string;
  dmx_path?: string;
}

interface StartupTabProps {
  value: StartupValue;
  onChange: (v: StartupValue) => void;
}

const ANIMATION_OPTIONS: { value: StartupAnimation; label: string }[] = [
  { value: 'gol-random', label: 'gol-random' },
  { value: 'scroll',     label: 'scroll' },
  { value: 'dmx',        label: 'dmx' },
  { value: 'none',       label: 'none' },
];

export function StartupTab({ value, onChange }: StartupTabProps) {
  return (
    <div className="flex flex-col gap-4 p-2">
      <div className="flex flex-col gap-1">
        <label className="font-mono text-xs text-muted-foreground">animation</label>
        <Select
          value={value.animation}
          aria-label="startup animation"
          onChange={e => onChange({ ...value, animation: e.target.value as StartupAnimation })}
        >
          {ANIMATION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>

      {value.animation === 'scroll' && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-muted-foreground">
            scroll text ({value.scroll_text.length}/100)
          </label>
          <Input
            value={value.scroll_text}
            maxLength={100}
            expandedClassName="w-64"
            onChange={e => onChange({ ...value, scroll_text: e.target.value })}
            aria-label="scroll text"
          />
        </div>
      )}

      {value.animation === 'dmx' && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-muted-foreground">dmx path (.dmx.json)</label>
          <Input
            value={value.dmx_path ?? ''}
            expandedClassName="w-64"
            onChange={e => {
              const v = e.target.value;
              if (v === '') {
                const next: StartupValue = { animation: value.animation, scroll_text: value.scroll_text };
                onChange(next);
              } else {
                onChange({ ...value, dmx_path: v });
              }
            }}
            aria-label="dmx path"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
