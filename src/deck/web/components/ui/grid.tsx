import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const gridVariants = cva('grid', {
  variants: {
    cols: {
      '1': 'grid-cols-1',
      '2': 'grid-cols-2',
      '3': 'grid-cols-3',
      '4': 'grid-cols-4',
      '6': 'grid-cols-6',
      '12': 'grid-cols-12',
    },
    gap: {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
    },
  },
  defaultVariants: {
    cols: '1',
    gap: 'sm',
  },
});

export interface GridProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof gridVariants> {
  as?: React.ElementType;
}

export function Grid({ as: Tag = 'div', className, cols, gap, ...props }: GridProps) {
  return <Tag className={cn(gridVariants({ cols, gap }), className)} {...props} />;
}
Grid.displayName = 'Grid';

export { gridVariants };
