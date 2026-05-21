import * as React from 'react';
import { cn } from '@/lib/utils.js';

export type SliderVariant = 'cycling' | 'value';

type SliderProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: SliderVariant;
  /** Track segment count. Default: 24. */
  size?: number;
};

const SEG = 24;
const CYCLE_CHARS = ['·', '∗', '✱', '●', '✱', '∗'];
const trackInput = 'absolute inset-0 opacity-0 cursor-pointer z-10';
const trackVisual = 'font-mono text-sm select-none pointer-events-none whitespace-pre';

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, variant = 'value', size: sizeProp, value, defaultValue, min = 0, max = 100, onChange, ...props }, ref) => {
    const seg = sizeProp ?? SEG;
    const [localValue, setLocalValue] = React.useState(
      defaultValue !== undefined ? Number(defaultValue) : Number(min)
    );

    const current = value !== undefined ? Number(value) : localValue;
    const t = Math.min(1, Math.max(0,
      Number(max) > Number(min) ? (current - Number(min)) / (Number(max) - Number(min)) : 0
    ));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) setLocalValue(Number(e.target.value));
      onChange?.(e);
    };

    if (variant === 'cycling') {
      const pos = Math.round(t * (seg - 1));
      return (
        <span className={cn('relative inline-block self-start', className)}>
          <input ref={ref} type="range" min={min} max={max} value={current} onChange={handleChange} className={trackInput} {...props} />
          <span aria-hidden="true" className={trackVisual}>
            <span className="text-foreground">{'─'.repeat(pos)}</span>
            <span className="text-foreground inline-block scale-[1.5]">{CYCLE_CHARS[Math.floor(pos / 2) % CYCLE_CHARS.length]}</span>
            <span className="text-muted-foreground">{'─'.repeat(seg - 1 - pos)}</span>
          </span>
        </span>
      );
    }

    const trackLen = seg - 5;
    const pos = Math.round(t * trackLen);
    return (
      <span className={cn('relative inline-block self-start', className)}>
        <input ref={ref} type="range" min={min} max={max} value={current} onChange={handleChange} className={trackInput} {...props} />
        <span aria-hidden="true" className={trackVisual}>
          <span className="text-foreground">{'─'.repeat(pos)}</span>
          <span className="text-foreground">{`[${current.toString().padStart(3)}]`}</span>
          <span className="text-muted-foreground">{'─'.repeat(trackLen - pos)}</span>
        </span>
      </span>
    );
  }
);
Slider.displayName = 'Slider';
