import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils.js';

export const TooltipProvider = TooltipPrimitive.Provider;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'z-50 font-mono text-xs bg-background/80 backdrop-blur-sm text-foreground rounded-sm px-1.5 py-0.5',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

type ContentProps = Pick<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>,
  'side' | 'align' | 'sideOffset' | 'collisionPadding'
>;

/** Convenience wrapper — pass `content` as the tooltip label. */
export function Tooltip({
  children,
  content,
  delayDuration = 400,
  side,
  align,
  sideOffset,
  collisionPadding,
  ...rootProps
}: {
  children: React.ReactNode;
  content: React.ReactNode;
} & ContentProps
  & Omit<React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>, 'children'>) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration} {...rootProps}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent
        {...(side !== undefined ? { side } : {})}
        {...(align !== undefined ? { align } : {})}
        {...(sideOffset !== undefined ? { sideOffset } : {})}
        {...(collisionPadding !== undefined ? { collisionPadding } : {})}
      >
        {content}
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}
