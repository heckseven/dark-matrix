import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const stackVariants = cva('flex', {
  variants: {
    direction: {
      row: 'flex-row',
      col: 'flex-col',
    },
    gap: {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
      '2xl': 'gap-10',
    },
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
      baseline: 'items-baseline',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
    },
    wrap: {
      true: 'flex-wrap',
      false: 'flex-nowrap',
    },
  },
  defaultVariants: {
    direction: 'col',
    gap: 'sm',
    align: 'stretch',
    justify: 'start',
    wrap: false,
  },
});

export interface StackProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof stackVariants> {
  as?: React.ElementType;
}

export function Stack({ as: Tag = 'div', className, direction, gap, align, justify, wrap, ...props }: StackProps) {
  return (
    <Tag
      className={cn(stackVariants({ direction, gap, align, justify, wrap }), className)}
      {...props}
    />
  );
}
Stack.displayName = 'Stack';

export { stackVariants };
