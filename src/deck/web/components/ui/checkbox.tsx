import * as React from 'react';
import { cn } from '@/lib/utils.js';

const visual = cn(
  'font-mono text-sm select-none transition-colors',
  'peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background rounded-sm',
  'peer-disabled:opacity-40',
);

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <span className={cn('inline-flex items-center', className)}>
    <input ref={ref} type="checkbox" className="sr-only peer" {...props} />
    <span aria-hidden="true" className={cn(visual, 'text-muted-foreground peer-checked:hidden')}>
      {'[ ]'}
    </span>
    <span aria-hidden="true" className={cn(visual, 'text-primary hidden peer-checked:inline')}>
      {'[×]'}
    </span>
  </span>
));
Checkbox.displayName = 'Checkbox';
