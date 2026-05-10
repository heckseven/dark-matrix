import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils.js';

export const Menu = DropdownMenuPrimitive.Root;
export const MenuTrigger = DropdownMenuPrimitive.Trigger;

export const MenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'z-50 min-w-[238px] font-mono text-xs text-foreground bg-background',
        'rounded border border-foreground p-3 outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
MenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export interface MenuItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
  shortcut?: React.ReactNode;
}

export const MenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  MenuItemProps
>(({ className, children, shortcut, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'flex items-center w-full cursor-pointer rounded-sm px-2 py-1 select-none outline-none',
      'text-foreground',
      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
      className,
    )}
    {...props}
  >
    <span className="flex-1">{children}</span>
    {shortcut && (
      <span aria-hidden="true" className="ml-4 text-muted-foreground">{shortcut}</span>
    )}
  </DropdownMenuPrimitive.Item>
));
MenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export const MenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const MenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'flex items-center w-full cursor-pointer rounded-sm px-2 py-1 select-none outline-none',
      'text-foreground',
      'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      className,
    )}
    {...props}
  >
    <span className="w-4 shrink-0 flex items-center justify-center text-green-500">
      <DropdownMenuPrimitive.ItemIndicator aria-hidden="true">✓&nbsp;</DropdownMenuPrimitive.ItemIndicator>
    </span>
    <span className="flex-1">{children}</span>
  </DropdownMenuPrimitive.RadioItem>
));
MenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

export const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-3 my-2 h-px bg-border', className)}
    {...props}
  />
));
MenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
