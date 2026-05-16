import * as React from 'react';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { Checkbox } from '../ui/checkbox.js';

type IdleAnimation = 'heatmap' | 'audio-eq' | 'gol-random' | 'scroll' | 'gif' | 'hud' | 'none';
type GifMode = 'bw' | 'gray';
type EqSource = 'monitor' | 'mic';

interface DaemonValue {
  poll_interval_ms: number;
  idle_animation: IdleAnimation;
  idle_after_ms: number;
  idle_gif_path?: string;
  idle_gif_mode?: GifMode;
  idle_gif_dual?: boolean;
  idle_eq_source?: EqSource;
}

interface DaemonTabProps {
  value: DaemonValue;
  onChange: (v: DaemonValue) => void;
}

const IDLE_ANIMATION_OPTIONS: { value: IdleAnimation; label: string }[] = [
  { value: 'heatmap',   label: 'heatmap' },
  { value: 'audio-eq',  label: 'audio-eq' },
  { value: 'gol-random', label: 'gol-random' },
  { value: 'scroll',    label: 'scroll' },
  { value: 'gif',       label: 'gif' },
  { value: 'hud',       label: 'hud' },
  { value: 'none',      label: 'none' },
];

const GIF_MODE_OPTIONS: { value: GifMode; label: string }[] = [
  { value: 'bw',   label: 'bw' },
  { value: 'gray', label: 'gray' },
];

const EQ_SOURCE_OPTIONS: { value: EqSource; label: string }[] = [
  { value: 'monitor', label: 'monitor' },
  { value: 'mic',     label: 'mic' },
];

export function DaemonTab({ value, onChange }: DaemonTabProps) {
  const isGif = value.idle_animation === 'gif';
  const isEq  = value.idle_animation === 'audio-eq';

  return (
    <div className="flex flex-col gap-4 p-2">
      <div className="flex flex-col gap-1">
        <label className="font-mono text-xs text-muted-foreground">poll interval (ms)</label>
        <Input
          type="number"
          value={value.poll_interval_ms}
          min={100}
          max={60000}
          suffix="ms"
          onChange={e => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) onChange({ ...value, poll_interval_ms: n });
          }}
          aria-label="poll interval ms"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-xs text-muted-foreground">idle animation</label>
        <Select
          value={value.idle_animation}
          aria-label="idle animation"
          onChange={e => onChange({ ...value, idle_animation: e.target.value as IdleAnimation })}
        >
          {IDLE_ANIMATION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-mono text-xs text-muted-foreground">idle after (ms)</label>
        <Input
          type="number"
          value={value.idle_after_ms}
          min={0}
          suffix="ms"
          onChange={e => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) onChange({ ...value, idle_after_ms: n });
          }}
          aria-label="idle after ms"
        />
      </div>

      {isGif && (
        <>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-muted-foreground">gif path (.gif)</label>
            <Input
              value={value.idle_gif_path ?? ''}
              expandedClassName="w-64"
              onChange={e => {
                const v = e.target.value;
                if (v === '') {
                  const next: DaemonValue = {
                    poll_interval_ms: value.poll_interval_ms,
                    idle_animation:   value.idle_animation,
                    idle_after_ms:    value.idle_after_ms,
                  };
                  if (value.idle_gif_mode !== undefined) next.idle_gif_mode = value.idle_gif_mode;
                  if (value.idle_gif_dual !== undefined) next.idle_gif_dual = value.idle_gif_dual;
                  if (value.idle_eq_source !== undefined) next.idle_eq_source = value.idle_eq_source;
                  onChange(next);
                } else {
                  onChange({ ...value, idle_gif_path: v });
                }
              }}
              aria-label="gif path"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-muted-foreground">gif mode</label>
            <Select
              value={value.idle_gif_mode ?? 'bw'}
              aria-label="gif mode"
              onChange={e => onChange({ ...value, idle_gif_mode: e.target.value as GifMode })}
            >
              {GIF_MODE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="font-mono text-xs text-muted-foreground flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={value.idle_gif_dual ?? false}
                onChange={e => onChange({ ...value, idle_gif_dual: e.target.checked })}
                aria-label="gif dual"
              />
              dual display
            </label>
          </div>
        </>
      )}

      {isEq && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-muted-foreground">eq source</label>
          <Select
            value={value.idle_eq_source ?? 'monitor'}
            aria-label="eq source"
            onChange={e => onChange({ ...value, idle_eq_source: e.target.value as EqSource })}
          >
            {EQ_SOURCE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
