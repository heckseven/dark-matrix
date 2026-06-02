import * as React from 'react';
import { ColorField, Input as AriaInput, parseColor } from 'react-aria-components';
import type { ColorFieldProps, Color } from 'react-aria-components';
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
  /** If provided, renders a "reset" label beside the input when value is set. */
  onClear?: () => void;
  className?: string;
}

export function ColorInput({ value, onChange, onClear, className, ...props }: ColorInputProps) {
  const color = safeParseColor(value);

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <ColorField
        value={color}
        onChange={(c) => onChange?.(c.toString('hex'))}
        className="inline-flex items-center"
        {...props}
      >
        <span className="font-mono text-xs inline-flex items-center p-1 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
          <span aria-hidden="true" className="select-none text-foreground">[&nbsp;</span>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: value ?? 'transparent',
              border: '1px solid rgba(128,128,128,0.2)',
              flexShrink: 0,
              marginRight: 4,
            }}
          />
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
