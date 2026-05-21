import * as React from 'react';
import { cn } from '@/lib/utils.js';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  expandedClassName?: string;
  /** Text shown inside the brackets after the value, e.g. "ms". Hidden when focused or overflowing. */
  suffix?: string;
  /** Renders a <label> to the left of the bracket. Wires htmlFor automatically. */
  label?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, expandedClassName = 'w-48', suffix, label, onFocus, onBlur, onScroll, onInput, id, readOnly, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const innerRef = React.useRef<HTMLInputElement>(null);
    const [focused, setFocused] = React.useState(false);
    const [clips, setClips] = React.useState({ left: false, right: false });

    const check = () => {
      const el = innerRef.current;
      if (!el) return;
      setClips({ left: el.scrollLeft > 0, right: el.scrollLeft + el.clientWidth < el.scrollWidth });
    };

    const mergedRef = React.useCallback((node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (node) check();
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }, [ref]);

    const bracketCls = cn('select-none', readOnly ? 'text-foreground/35' : 'text-foreground');

    const bracket = (
      <span className="font-mono text-xs inline-flex items-center p-1 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background has-[:disabled]:opacity-40">
        <span aria-hidden="true" className={bracketCls}>{clips.left ? '‹' : '['}&nbsp;</span>
        <input
          id={inputId}
          ref={mergedRef}
          readOnly={readOnly}
          className={cn(
            'bg-transparent border-none outline-none text-foreground font-mono text-xs disabled:cursor-not-allowed transition-[width] duration-150',
            readOnly && 'cursor-default',
            className,
            focused ? expandedClassName : undefined,
          )}
          onFocus={e => { setFocused(true); check(); onFocus?.(e); }}
          onBlur={e => { setFocused(false); check(); onBlur?.(e); }}
          onScroll={e => { check(); onScroll?.(e); }}
          onInput={e => { check(); onInput?.(e); }}
          {...props}
        />
        <span aria-hidden="true" className={bracketCls}>{!focused && clips.right ? ' ›' : !focused && suffix ? `${suffix} ]` : ' ]'}</span>
      </span>
    );
    if (!label) return bracket;
    return (
      <span className="inline-flex items-center gap-2">
        <label htmlFor={inputId} className="font-mono text-xs text-foreground/55 whitespace-nowrap select-none">{label}</label>
        {bracket}
      </span>
    );
  }
);
Input.displayName = 'Input';
