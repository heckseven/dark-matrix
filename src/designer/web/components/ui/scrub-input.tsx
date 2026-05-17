import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Input } from './input.js';

export interface ScrubInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Pointer pixels required to change value by 1. Default: 1. */
  pixelsPerUnit?: number;
  /** Width class applied to the inner input when collapsed. */
  className?: string;
  /** Width class applied to the inner input when focused for typing. */
  expandedClassName?: string;
  disabled?: boolean;
  'aria-label'?: string;
  /** Text appended after the input (e.g. "ms"). */
  suffix?: string;
  /** Renders a <label> to the left of the bracket. Wires htmlFor automatically. */
  label?: string;
}

export function ScrubInput({
  value,
  onChange,
  min = 0,
  max = 100,
  pixelsPerUnit = 1,
  className = 'w-8 text-center',
  expandedClassName,
  disabled,
  'aria-label': ariaLabel,
  suffix,
  label,
}: ScrubInputProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const generatedId = useId();

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  function clamp(v: number) { return Math.max(min, Math.min(max, v)); }

  function onPointerDown(e: React.PointerEvent) {
    if (editing || disabled) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: value, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const delta = e.clientX - drag.current.x;
    if (Math.abs(delta) > 2) drag.current.moved = true;
    if (drag.current.moved) onChange(clamp(Math.round(drag.current.v + delta / pixelsPerUnit)));
  }

  function onPointerUp() {
    if (drag.current && !drag.current.moved) setEditing(true);
    drag.current = null;
  }

  const dragDiv = (
    <div
      style={{ display: 'inline-flex', cursor: editing || disabled ? 'default' : 'ew-resize' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <Input
        ref={inputRef}
        id={generatedId}
        type="number"
        min={min}
        max={max}
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        readOnly={!editing}
        onChange={e => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(clamp(v));
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={e => {
          if (!editing && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setEditing(true);
          } else if (e.key === 'Enter' || e.key === 'Escape') {
            inputRef.current?.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            onChange(clamp(value + (e.key === 'ArrowUp' ? step : -step)));
          }
        }}
        {...(suffix !== undefined ? { suffix } : {})}
        className={className}
        expandedClassName={expandedClassName ?? className}
        style={{ pointerEvents: editing ? 'auto' : 'none', cursor: editing ? 'text' : 'ew-resize' }}
      />
    </div>
  );

  if (!label) return dragDiv;
  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={generatedId} className="font-mono text-xs text-foreground/55 whitespace-nowrap select-none">{label}</label>
      {dragDiv}
    </span>
  );
}
