import * as React from 'react';
import { cn } from '@/lib/utils.js';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const base = 'font-mono text-xs bg-transparent outline-none appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <span className="font-mono text-xs inline-flex items-center focus-within:ring-1 focus-within:ring-green-400/30">
      <span aria-hidden className="text-green-400/55 select-none">{'[ '}</span>
      <select
        ref={ref}
        className={cn(base, 'text-green-400 py-0.5', className)}
        style={{ textShadow: '0 0 8px rgba(74,222,128,0.6)' }}
        {...props}
      >{children}</select>
      <span aria-hidden className="text-green-400/55 select-none">{' ▾]'}</span>
    </span>
  )
);
Select.displayName = 'Select';
