import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';
import { Tooltip } from './tooltip.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded border text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'bg-transparent border-foreground text-foreground hover:bg-foreground hover:text-background',
        primary: 'bg-primary border-primary text-primary-foreground hover:bg-primary/90',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'border-transparent bg-transparent text-foreground hover:text-destructive focus-visible:ring-destructive focus-visible:text-destructive',
      },
      size: {
        sm: 'px-2 py-1',
        md: 'px-3 py-2',
        lg: 'px-4 py-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a tooltip on hover. Use whenever the visible label is a symbol or icon. */
  tooltip?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, tooltip, ...props }, ref) => {
    const btn = (
      <button ref={ref} type="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
    if (!tooltip) return btn;
    return <Tooltip content={tooltip}>{btn}</Tooltip>;
  }
);
Button.displayName = 'Button';

export { buttonVariants };
