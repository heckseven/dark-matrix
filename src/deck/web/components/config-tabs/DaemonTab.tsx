import * as React from 'react';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { Checkbox } from '../ui/checkbox.js';
import { ScrubInput } from '../ui/scrub-input.js';
import { TabFrame, TabRow } from './tab-frame.js';

type IdleAnimation = 'audio-eq' | 'gol-random' | 'scroll' | 'gif' | 'hud' | 'none';
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
    <TabFrame>

      <TabRow label="poll interval">
        <Input
          fluid
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
      </TabRow>

      <TabRow label="idle animation">
        <Select
          fluid
          value={value.idle_animation}
          aria-label="idle animation"
          options={IDLE_ANIMATION_OPTIONS}
          onValueChange={v => onChange({ ...value, idle_animation: v as IdleAnimation })}
        />
      </TabRow>

      <TabRow label="idle after">
        <ScrubInput
          value={value.idle_after_ms}
          min={0}
          max={3600000}
          pixelsPerUnit={0.01}
          onChange={n => onChange({ ...value, idle_after_ms: n })}
          aria-label="idle after ms"
          suffix="ms"
          className="w-20 text-center"
          expandedClassName="w-28"
        />
      </TabRow>

      {isGif && (
        <>
          <TabRow label="gif path (.gif)">
            <Input
              fluid
              value={value.idle_gif_path ?? ''}
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
          </TabRow>

          <TabRow label="gif mode">
            <Select
              fluid
              value={value.idle_gif_mode ?? 'bw'}
              aria-label="gif mode"
              options={GIF_MODE_OPTIONS}
              onValueChange={v => onChange({ ...value, idle_gif_mode: v as GifMode })}
            />
          </TabRow>

          <TabRow label="dual display">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={value.idle_gif_dual ?? false}
                onChange={e => onChange({ ...value, idle_gif_dual: e.target.checked })}
                aria-label="dual display"
              />
            </label>
          </TabRow>
        </>
      )}

      {isEq && (
        <TabRow label="eq source">
          <Select
            fluid
            value={value.idle_eq_source ?? 'monitor'}
            aria-label="eq source"
            options={EQ_SOURCE_OPTIONS}
            onValueChange={v => onChange({ ...value, idle_eq_source: v as EqSource })}
          />
        </TabRow>
      )}

    </TabFrame>
  );
}
