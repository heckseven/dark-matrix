import * as React from 'react';
import { cn } from '@/lib/utils.js';

interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, pressed, onPressedChange, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      onClick={(e) => { onPressedChange?.(!pressed); onClick?.(e); }}
      className={cn(
        'inline-flex items-center justify-center px-2 py-0.5 rounded border text-xs font-medium cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-40',
        pressed
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-transparent text-foreground border-border hover:bg-accent hover:text-accent-foreground',
        className
      )}
      {...props}
    />
  )
);
Toggle.displayName = 'Toggle';
