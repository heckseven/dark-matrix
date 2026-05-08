import * as React from 'react';
import { cn } from '@/lib/utils.js';

export const Slider = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="range"
    className={cn('w-20 accent-primary', className)}
    {...props}
  />
));
Slider.displayName = 'Slider';
