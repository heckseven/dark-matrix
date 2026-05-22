import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const textVariants = cva('', {
  variants: {
    size: {
      xs: 'text-xs leading-4',
      sm: 'text-sm leading-5',
      md: 'text-base leading-6',
      lg: 'text-lg leading-7',
      xl: 'text-xl leading-7',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    variant: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      primary: 'text-primary',
      destructive: 'text-destructive',
    },
  },
  defaultVariants: {
    size: 'sm',
    weight: 'normal',
    variant: 'default',
  },
});

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  as?: React.ElementType;
}

export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ as: Tag = 'p', className, size, weight, variant, ...props }, ref) => (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={cn(textVariants({ size, weight, variant }), className)} {...props} />
  )
);
Text.displayName = 'Text';

export { textVariants };
