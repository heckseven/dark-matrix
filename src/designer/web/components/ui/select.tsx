import * as React from 'react';
import { cn } from '@/lib/utils.js';

export type SelectVariant =
  | 'bracket'    // [ value ▾ ] — mirrors Input style
  | 'segment'    // bordered box, like segment Tabs
  | 'underline'  // bottom border only
  | 'ghost'      // invisible at rest, appears on focus/hover
  | 'terminal'   // green phosphor [brackets]
  | 'amber'      // amber CRT underline
  | 'dos'        // DOS blue background box
  | 'matrix'     // >_ prefix, dark green glow
  | 'pipe'       // left-bar accent
  | 'slash';     // // comment prefix

export const SELECT_VARIANTS: SelectVariant[] = [
  'bracket', 'segment', 'underline', 'ghost',
  'terminal', 'amber', 'dos', 'matrix', 'pipe', 'slash',
];

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: SelectVariant;
};

const base = 'font-mono text-xs bg-transparent outline-none appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, variant = 'segment', children, ...props }, ref) => {

    switch (variant) {

      case 'bracket':
        return (
          <span className="font-mono text-xs inline-flex items-center focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
            <span aria-hidden className="text-foreground select-none">{'[ '}</span>
            <span className="relative inline-flex items-center">
              <select ref={ref} className={cn(base, 'text-foreground pr-4', className)} {...props}>{children}</select>
              <span aria-hidden className="absolute right-0 pointer-events-none text-foreground/55 select-none">▾</span>
            </span>
            <span aria-hidden className="text-foreground select-none">{' ]'}</span>
          </span>
        );

      case 'segment':
        return (
          <span className="relative inline-flex items-center border border-foreground/30 focus-within:border-foreground transition-colors">
            <select ref={ref} className={cn(base, 'text-foreground px-2 py-1 pr-6', className)} {...props}>{children}</select>
            <span aria-hidden className="absolute right-2 pointer-events-none text-foreground/55 select-none">▾</span>
          </span>
        );

      case 'underline':
        return (
          <span className="relative inline-flex items-center border-b border-foreground/30 focus-within:border-foreground transition-colors">
            <select ref={ref} className={cn(base, 'text-foreground px-1 py-1 pr-5', className)} {...props}>{children}</select>
            <span aria-hidden className="absolute right-0 pointer-events-none text-foreground/55 select-none">▾</span>
          </span>
        );

      case 'ghost':
        return (
          <span className="relative inline-flex items-center focus-within:ring-1 focus-within:ring-ring/40">
            <select ref={ref} className={cn(base, 'text-foreground/50 hover:text-foreground pr-5 py-1 transition-colors', className)} {...props}>{children}</select>
            <span aria-hidden className="absolute right-0 pointer-events-none text-foreground/25 select-none">▾</span>
          </span>
        );

      case 'terminal':
        return (
          <span className="relative inline-flex items-center focus-within:ring-1 focus-within:ring-green-400/30">
            <span aria-hidden className="text-green-400/55 select-none mr-0.5">{'['}</span>
            <span className="relative inline-flex items-center">
              <select
                ref={ref}
                className={cn(base, 'text-green-400 pr-4', className)}
                style={{ textShadow: '0 0 8px rgba(74,222,128,0.6)' }}
                {...props}
              >{children}</select>
              <span aria-hidden className="absolute right-0 pointer-events-none text-green-400/55 select-none">▾</span>
            </span>
            <span aria-hidden className="text-green-400/55 select-none ml-0.5">{']'}</span>
          </span>
        );

      case 'amber':
        return (
          <span className="relative inline-flex items-center border-b-2 border-amber-600/40 focus-within:border-amber-400 transition-colors">
            <select
              ref={ref}
              className={cn(base, 'text-amber-400 px-1 py-1 pr-5', className)}
              style={{ textShadow: '0 0 8px rgba(251,191,36,0.45)' }}
              {...props}
            >{children}</select>
            <span aria-hidden className="absolute right-0 pointer-events-none text-amber-500/55 select-none">▾</span>
          </span>
        );

      case 'dos':
        return (
          <span className="relative inline-flex items-center bg-[#000080] border border-[#aaaaaa]">
            <select
              ref={ref}
              className={cn(base, 'text-[#aaaaaa] bg-[#000080] px-3 py-0.5 pr-6 uppercase tracking-wide', className)}
              {...props}
            >{children}</select>
            <span aria-hidden className="absolute right-2 pointer-events-none text-[#aaaaaa] select-none">▼</span>
          </span>
        );

      case 'matrix':
        return (
          <span className="relative inline-flex items-center focus-within:ring-1 focus-within:ring-green-900/60">
            <span aria-hidden className="text-green-700 select-none mr-1 shrink-0">{'>_'}</span>
            <span className="relative inline-flex items-center">
              <select
                ref={ref}
                className={cn(base, 'text-green-400 pr-4', className)}
                style={{ textShadow: '0 0 8px rgba(74,222,128,0.8)' }}
                {...props}
              >{children}</select>
              <span aria-hidden className="absolute right-0 pointer-events-none text-green-700 select-none">▾</span>
            </span>
          </span>
        );

      case 'pipe':
        return (
          <span className="relative inline-flex items-center border-l-2 border-foreground/20 focus-within:border-foreground/60 transition-colors pl-2">
            <select ref={ref} className={cn(base, 'text-foreground pr-5 py-1', className)} {...props}>{children}</select>
            <span aria-hidden className="absolute right-0 pointer-events-none text-foreground/40 select-none">▾</span>
          </span>
        );

      case 'slash':
        return (
          <span className="relative inline-flex items-center focus-within:ring-1 focus-within:ring-ring/40">
            <span aria-hidden className="text-foreground/25 select-none mr-1 shrink-0">{'//'}</span>
            <span className="relative inline-flex items-center">
              <select ref={ref} className={cn(base, 'text-foreground/65 hover:text-foreground pr-4 transition-colors', className)} {...props}>{children}</select>
              <span aria-hidden className="absolute right-0 pointer-events-none text-foreground/25 select-none">▾</span>
            </span>
          </span>
        );
    }
  }
);
Select.displayName = 'Select';
