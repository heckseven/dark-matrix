import * as React from 'react';
import {
  ColorPicker,
  ColorArea,
  ColorSlider,
  ColorThumb,
  SliderTrack,
  ColorField,
  Input as AriaInput,
  parseColor,
} from 'react-aria-components';
import type { Color } from 'react-aria-components';
import { CornerBrackets } from '../MatrixItem.js';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';
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

const FALLBACK = parseColor('#000000');

export interface ColorInputProps {
  /** Hex color string (#rrggbb). */
  value?: string;
  onChange?: (hex: string) => void;
  /** Renders a "reset" label beside the swatch when value is set. */
  onClear?: () => void;
  'aria-label'?: string;
  className?: string;
}

export function ColorInput({
  value,
  onChange,
  onClear,
  className,
  'aria-label': ariaLabel,
}: ColorInputProps) {
  const [color, setColor] = React.useState<Color>(() => safeParseColor(value) ?? FALLBACK);

  React.useEffect(() => {
    setColor(safeParseColor(value) ?? FALLBACK);
  }, [value]);

  function handleChange(c: Color) {
    setColor(c);
    onChange?.(c.toString('hex'));
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <ColorPicker value={color} onChange={handleChange} className="inline-flex">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="relative group focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-sm"
              aria-label={ariaLabel ?? 'Pick color'}
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
            </button>
          </PopoverTrigger>

          <PopoverContent align="start" className="flex flex-col gap-3 p-3" style={{ width: 208 }}>
            {/* Saturation / brightness */}
            <ColorArea
              colorSpace="hsb"
              xChannel="saturation"
              yChannel="brightness"
              className="border border-border outline-none"
              style={{ width: '100%', height: 140 }}
            >
              <ColorThumb
                style={{
                  width: 12,
                  height: 12,
                  border: '2px solid white',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                }}
              />
            </ColorArea>

            {/* Hue */}
            <ColorSlider colorSpace="hsb" channel="hue">
              <SliderTrack
                className="border border-border outline-none"
                style={{ height: 12, position: 'relative' }}
              >
                <ColorThumb
                  style={{
                    width: 6,
                    height: 20,
                    border: '2px solid white',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
                    top: '50%',
                  }}
                />
              </SliderTrack>
            </ColorSlider>

            {/* Hex text entry */}
            <ColorField aria-label="Hex color">
              <span className="font-mono text-xs inline-flex items-center p-1 w-full focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
                <span aria-hidden="true" className="select-none text-foreground">[&nbsp;</span>
                <AriaInput className="bg-transparent border-none outline-none text-foreground font-mono text-xs flex-1 min-w-0 uppercase" />
                <span aria-hidden="true" className="select-none text-foreground">&nbsp;]</span>
              </span>
            </ColorField>
          </PopoverContent>
        </Popover>
      </ColorPicker>

      {value && (
        <span className="font-mono text-xs text-muted-foreground uppercase">{value}</span>
      )}

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
