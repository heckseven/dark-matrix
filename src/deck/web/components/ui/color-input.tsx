import * as React from 'react';
import { ColorField, Input as AriaInput, parseColor } from 'react-aria-components';
import type { ColorFieldProps, Color } from 'react-aria-components';
import { CornerBrackets } from '../MatrixItem.js';
import { cn } from '@/lib/utils.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function safeParseColor(hex?: string): Color | null {
  if (!hex || !HEX_RE.test(hex)) return null;
  try {
    return parseColor(hex);
  } catch {
    return null;
  }
}

export interface ColorInputProps
  extends Omit<ColorFieldProps, 'value' | 'defaultValue' | 'onChange' | 'children'> {
  /** Hex color string (#rrggbb). */
  value?: string;
  onChange?: (hex: string) => void;
  /** Renders a "reset" label beside the input when value is set. */
  onClear?: () => void;
  className?: string;
}

export function ColorInput({ value, onChange, onClear, className, ...props }: ColorInputProps) {
  const color = safeParseColor(value);

  // Native picker needs a valid hex; fall back to black when unset.
  const pickerValue = value && HEX_RE.test(value) ? value : '#000000';

  function handleNative(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    if (HEX_RE.test(hex)) onChange?.(hex);
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {/* Swatch — click to open native color picker */}
      <label
        className="relative group inline-block cursor-pointer focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background rounded-sm"
        aria-label="Pick color visually"
        style={{ width: 24, height: 24 }}
      >
        <div
          className="relative"
          style={{
            width: 24,
            height: 24,
            background: value ?? 'var(--color-muted)',
            border: '1px solid rgba(128,128,128,0.2)',
          }}
        >
          <CornerBrackets active={false} />
        </div>
        {/* Invisible native picker overlaid on the swatch */}
        <input
          type="color"
          value={pickerValue}
          onChange={handleNative}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
        />
      </label>

      {/* React Aria text input */}
      <ColorField
        value={color}
        onChange={(c) => onChange?.(c.toString('hex'))}
        className="inline-flex items-center"
        {...props}
      >
        <span className="font-mono text-xs inline-flex items-center p-1 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
          <span aria-hidden="true" className="select-none text-foreground">[&nbsp;</span>
          <AriaInput className="bg-transparent border-none outline-none text-foreground font-mono text-xs w-[7ch] uppercase" />
          <span aria-hidden="true" className="select-none text-foreground">&nbsp;]</span>
        </span>
      </ColorField>

      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:underline"
          aria-label="Reset color"
        >
          reset
        </button>
      )}
    </span>
  );
}
