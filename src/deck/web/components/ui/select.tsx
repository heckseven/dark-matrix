import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/lib/utils.js';

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  variant?: 'default' | 'primary';
  fluid?: boolean;
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ options, value, defaultValue, onValueChange, disabled, placeholder, variant = 'default', fluid, className, id, name, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) => {
    const primary = variant === 'primary';
    const chrome = primary ? 'text-green-400' : 'text-foreground';

    return (
      <SelectPrimitive.Root
        {...(value !== undefined && { value })}
        {...(defaultValue !== undefined && { defaultValue })}
        {...(onValueChange !== undefined && { onValueChange })}
        {...(disabled !== undefined && { disabled })}
        {...(name !== undefined && { name })}
      >
        <SelectPrimitive.Trigger
          ref={ref}
          id={id}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          className={cn(
            'font-mono text-xs inline-flex items-center p-1 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-1',
            primary
              ? 'focus-visible:ring-green-400/30'
              : 'focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-40',
            chrome,
            fluid ? 'w-full' : className,
          )}
          style={primary ? { textShadow: '0 0 8px rgba(74,222,128,0.6)' } : undefined}
        >
          <span aria-hidden="true" className="select-none">{'['}&nbsp;</span>
          <span className={cn(
            'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
            fluid ? 'flex-1 text-left' : undefined,
          )}>
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <span aria-hidden="true" className="select-none">{' ▿]'}</span>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            collisionPadding={8}
            className={cn(
              'z-50 min-w-[var(--radix-select-trigger-width)] font-mono text-xs text-foreground bg-background',
              'rounded border border-foreground p-3 outline-none',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            )}
          >
            <SelectPrimitive.Viewport className="max-h-[var(--radix-select-content-available-height)] overflow-y-auto">
              {options.map(opt => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  {...(opt.disabled !== undefined && { disabled: opt.disabled })}
                  className={cn(
                    'flex items-center w-full cursor-pointer rounded-sm px-2 py-1 select-none outline-none',
                    'text-foreground',
                    'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                    'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
                  )}
                >
                  <span aria-hidden="true" className="w-4 shrink-0 flex items-center justify-center text-green-500">
                    <SelectPrimitive.ItemIndicator>✓&nbsp;</SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  }
);
Select.displayName = 'Select';
