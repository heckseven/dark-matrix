import * as React from 'react';
import { cn } from '@/lib/utils.js';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  expandedClassName?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, expandedClassName = 'w-48', onFocus, onBlur, onScroll, onInput, ...props }, ref) => {
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

    return (
      <span className="font-mono text-xs inline-flex items-center p-1 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background has-[:disabled]:opacity-40">
        <span aria-hidden="true" className="text-foreground select-none">{clips.left ? '‹' : '['}&nbsp;</span>
        <input
          ref={mergedRef}
          className={cn(
            'bg-transparent border-none outline-none text-foreground font-mono text-xs disabled:cursor-not-allowed transition-[width] duration-150',
            className,
            focused ? expandedClassName : undefined,
          )}
          onFocus={e => { setFocused(true); check(); onFocus?.(e); }}
          onBlur={e => { setFocused(false); check(); onBlur?.(e); }}
          onScroll={e => { check(); onScroll?.(e); }}
          onInput={e => { check(); onInput?.(e); }}
          {...props}
        />
        <span aria-hidden="true" className="text-foreground select-none">&nbsp;{!focused && clips.right ? '›' : ']'}</span>
      </span>
    );
  }
);
Input.displayName = 'Input';
