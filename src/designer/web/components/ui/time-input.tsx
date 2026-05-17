import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils.js';

// ── helpers ────────────────────────────────────────────────────────────────

function parse(value: string): [number, number, number] {
  const parts = value.split(':').map(p => parseInt(p, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function pad2(n: number): string {
  return String(Math.max(0, n)).padStart(2, '0');
}

function emit(h: number, m: number, s: number, showSeconds: boolean): string {
  return showSeconds
    ? `${pad2(h)}:${pad2(m)}:${pad2(s)}`
    : `${pad2(h)}:${pad2(m)}`;
}

function applyCarry(
  h: number, m: number, s: number,
  maxHours: number | undefined,
): [number, number, number] {
  if (s >= 60) { const d = Math.floor(s / 60); s -= d * 60; m += d; }
  if (s <   0) { const d = Math.ceil(-s / 60);  s += d * 60; m -= d; }
  if (m >= 60) { const d = Math.floor(m / 60); m -= d * 60; h += d; }
  if (m <   0) { const d = Math.ceil(-m / 60);  m += d * 60; h -= d; }
  if (maxHours !== undefined) {
    const range = maxHours + 1;
    h = ((h % range) + range) % range;
  } else {
    h = Math.max(0, h);
  }
  return [h, m, s];
}

// ── segment ────────────────────────────────────────────────────────────────

interface SegProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}

function Seg({ value, onChange, disabled, ariaLabel }: SegProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(pad2(value));
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function onPointerDown(e: React.PointerEvent) {
    if (editing || disabled) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: value, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const delta = e.clientX - drag.current.x;
    if (Math.abs(delta) > 2) drag.current.moved = true;
    if (drag.current.moved) onChange(Math.round(drag.current.v + delta));
  }

  function onPointerUp() {
    if (drag.current && !drag.current.moved) setEditing(true);
    drag.current = null;
  }

  const displayVal = editing ? draft : pad2(value);

  return (
    <div
      style={{ display: 'inline-flex', cursor: editing || disabled ? 'default' : 'ew-resize' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={displayVal}
        aria-label={ariaLabel}
        disabled={disabled}
        readOnly={!editing}
        onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onBlur={() => {
          const parsed = parseInt(draft, 10);
          if (!isNaN(parsed)) onChange(parsed);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (editing) {
            if (e.key === 'Enter') inputRef.current?.blur();
            else if (e.key === 'Escape') { setDraft(pad2(value)); setEditing(false); }
          } else {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(value + (e.key === 'ArrowUp' ? (e.shiftKey ? 10 : 1) : (e.shiftKey ? -10 : -1)));
            }
          }
        }}
        className="text-center bg-transparent border-none outline-none font-mono text-xs text-foreground disabled:cursor-not-allowed"
        style={{
          pointerEvents: editing ? 'auto' : 'none',
          cursor: editing ? 'text' : 'ew-resize',
          width: `${Math.max(displayVal.length, 2)}ch`,
        }}
      />
    </div>
  );
}

// ── TimeInput ──────────────────────────────────────────────────────────────

export interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enable a seconds segment. Default: false. */
  showSeconds?: boolean;
  /**
   * Maximum value for the hours segment.
   * 23 = clock mode (wraps at midnight on carry).
   * Undefined = uncapped timer mode (clamps at 0, no upper wrap).
   * Default: 23.
   */
  maxHours?: number;
  /** Renders a label to the left of the bracket, wired via aria. */
  label?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function TimeInput({
  value,
  onChange,
  showSeconds = false,
  maxHours = 23,
  label,
  disabled,
  'aria-label': ariaLabel,
}: TimeInputProps) {
  const [h, m, s] = parse(value);

  function update(newH: number, newM: number, newS: number) {
    const carried = applyCarry(newH, newM, newS, maxHours);
    onChange(emit(...carried, showSeconds));
  }

  const bracket = (
    <span
      className={cn(
        'font-mono text-xs inline-flex items-center p-1 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background',
        disabled && 'opacity-40',
      )}
      aria-label={ariaLabel}
    >
      <span aria-hidden className="text-foreground select-none">{'['}&nbsp;</span>
      <Seg value={h} disabled={disabled} ariaLabel="hours"   onChange={v => update(v, m, s)} />
      <span aria-hidden className="text-foreground/40 select-none px-px">:</span>
      <Seg value={m} disabled={disabled} ariaLabel="minutes" onChange={v => update(h, v, s)} />
      {showSeconds && (
        <>
          <span aria-hidden className="text-foreground/40 select-none px-px">:</span>
          <Seg value={s} disabled={disabled} ariaLabel="seconds" onChange={v => update(h, m, v)} />
        </>
      )}
      <span aria-hidden className="text-foreground select-none">&nbsp;{']'}</span>
    </span>
  );

  if (!label) return bracket;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs text-foreground/55 whitespace-nowrap select-none">{label}</span>
      {bracket}
    </span>
  );
}
