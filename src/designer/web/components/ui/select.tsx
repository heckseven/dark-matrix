import * as React from 'react';
import { cn } from '@/lib/utils.js';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: 'default' | 'primary';
};

const base = [
  'font-mono text-xs bg-transparent outline-none appearance-none cursor-pointer',
  'disabled:cursor-not-allowed disabled:opacity-40',
  // leave room for the ▾ — truncate if constrained width is passed via className
  'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pr-2',
].join(' ');

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, variant = 'default', ...props }, ref) => {
    const primary = variant === 'primary';
    const chrome = primary ? 'text-green-400' : 'text-foreground';
    return (
      <span
        className={cn(
          'font-mono text-xs inline-flex items-center focus-within:ring-1',
          primary ? 'focus-within:ring-green-400/30' : 'focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background',
        )}
      >
        <span aria-hidden={true} className={cn('select-none', chrome)}>{'['}&nbsp;</span>
        <select
          ref={ref}
          className={cn(base, chrome, className)}
          style={primary ? { textShadow: '0 0 8px rgba(74,222,128,0.6)' } : undefined}
          {...props}
        >{children}</select>
        <span aria-hidden={true} className={cn('select-none', chrome)}>{' ▾]'}</span>
      </span>
    );
  }
);
Select.displayName = 'Select';
