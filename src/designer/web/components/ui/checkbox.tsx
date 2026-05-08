import * as React from 'react';
import { cn } from '@/lib/utils.js';

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'w-4 h-4 rounded-sm accent-primary cursor-pointer',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      'disabled:pointer-events-none disabled:opacity-40',
      className
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';
