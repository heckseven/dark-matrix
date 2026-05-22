import * as React from 'react';
import { cn } from '@/lib/utils.js';

const focusCls = [
  'peer-focus-visible:ring-1',
  'peer-focus-visible:ring-ring',
  'peer-focus-visible:ring-offset-1',
  'peer-focus-visible:ring-offset-background',
  'rounded-sm',
].join(' ');

const visual = cn('font-mono text-sm select-none transition-colors text-foreground', focusCls, 'peer-disabled:opacity-40');

export const Radio = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <span className={cn('inline-flex items-center', className)}>
    <input ref={ref} type="radio" className="sr-only peer" {...props} />
    <span aria-hidden="true" className={cn(visual, 'peer-checked:hidden')}>{'( )'}</span>
    <span aria-hidden="true" className={cn(visual, 'hidden peer-checked:inline')}>{'(●)'}</span>
  </span>
));
Radio.displayName = 'Radio';
