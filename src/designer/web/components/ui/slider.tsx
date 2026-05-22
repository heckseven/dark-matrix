import * as React from 'react';
import { cn } from '@/lib/utils.js';

export type SliderVariant = 'cycling' | 'value';

type SliderProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: SliderVariant;
  segments?: number;
  valueLabel?: string;
};

const SEG = 24;
const CYCLE_CHARS = ['·', '∗', '✱', '●', '✱', '∗'];
const trackInput = 'absolute inset-0 opacity-0 cursor-pointer z-10';
const trackVisual = 'font-mono text-sm select-none pointer-events-none whitespace-pre';

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, variant = 'value', segments: sizeProp, value, defaultValue, min = 0, max = 100, onChange, valueLabel, ...props }, ref) => {
    const seg = sizeProp ?? SEG;
    const [localValue, setLocalValue] = React.useState(
      defaultValue !== undefined ? Number(defaultValue) : Number(min)
    );

    const current = value !== undefined ? Number(value) : localValue;
    const t = Math.min(1, Math.max(0,
      Number(max) > Number(min) ? (current - Number(min)) / (Number(max) - Number(min)) : 0
    ));

    const outerRef = React.useRef<HTMLSpanElement>(null);
    const [trackWidth, setTrackWidth] = React.useState(0);

    React.useLayoutEffect(() => {
      const el = outerRef.current;
      if (!el) return;
      setTrackWidth(el.offsetWidth);
      const ro = new ResizeObserver(() => setTrackWidth(el.offsetWidth));
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) setLocalValue(Number(e.target.value));
      onChange?.(e);
    };

    if (variant === 'cycling') {
      const cycleChar = CYCLE_CHARS[Math.floor(Math.round(t * trackWidth) / 4) % CYCLE_CHARS.length]!;
      return (
        <span ref={outerRef} className={cn('relative block min-w-0', className)}>
          <input ref={ref} type="range" min={min} max={max} value={current} onChange={handleChange} className={trackInput} {...props} />
          <span aria-hidden="true" className="font-mono text-sm select-none pointer-events-none flex items-center overflow-hidden">
            <span
              className="text-foreground shrink-0 overflow-hidden whitespace-nowrap"
              style={{ width: `calc(${t} * (100% - 1ch))` }}
            >
              {'─'.repeat(200)}
            </span>
            <span className="text-primary shrink-0" style={{ fontSize: '18px', lineHeight: 1 }}>{cycleChar}</span>
            <span className="text-muted-foreground flex-1 min-w-0 overflow-hidden whitespace-nowrap">{'─'.repeat(200)}</span>
          </span>
        </span>
      );
    }

    const label = valueLabel ?? current.toString().padStart(3);
    const thumbChars = label.length + 2;
    return (
      <span className={cn('relative block min-w-0', className)}>
        <input ref={ref} type="range" min={min} max={max} value={current} onChange={handleChange} className={trackInput} {...props} />
        <span aria-hidden="true" className="font-mono text-sm select-none pointer-events-none flex overflow-hidden">
          <span
            className="text-foreground shrink-0 overflow-hidden whitespace-nowrap"
            style={{ width: `calc(${t} * (100% - ${thumbChars}ch))` }}
          >
            {'─'.repeat(200)}
          </span>
          <span className="text-foreground shrink-0">{`[${label}]`}</span>
          <span className="text-muted-foreground flex-1 min-w-0 overflow-hidden whitespace-nowrap">{'─'.repeat(200)}</span>
        </span>
      </span>
    );
  }
);
Slider.displayName = 'Slider';
