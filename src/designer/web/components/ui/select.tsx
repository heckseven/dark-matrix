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

// Inline paddingRight is used instead of Tailwind pr-* because Chrome doesn't
// reliably honour padding-right on <select appearance:none> via stylesheet rules.
const SELECT_PR = '1.5rem';

type IndicatorProps = { char?: string; className?: string };

function Indicator({ char = '▾', className }: IndicatorProps) {
  return (
    <span
      aria-hidden
      className={cn('absolute inset-y-0 right-1.5 flex items-center pointer-events-none select-none', className)}
    >
      {char}
    </span>
  );
}

function Wrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      {children}
    </span>
  );
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, variant = 'segment', children, ...props }, ref) => {
    const sel = (extra?: string, style?: React.CSSProperties) => (
      <select
        ref={ref}
        className={cn(base, extra, className)}
        style={{ paddingRight: SELECT_PR, ...style }}
        {...props}
      >
        {children}
      </select>
    );

    switch (variant) {

      case 'bracket':
        return (
          <span className="font-mono text-xs inline-flex items-center focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
            <span aria-hidden className="text-foreground select-none">{'[ '}</span>
            <Wrap>
              {sel('text-foreground px-0 py-0.5')}
              <Indicator className="text-foreground/55" />
            </Wrap>
            <span aria-hidden className="text-foreground select-none">{' ]'}</span>
          </span>
        );

      case 'segment':
        return (
          <Wrap className="border border-foreground/30 focus-within:border-foreground transition-colors">
            {sel('text-foreground px-2 py-1')}
            <Indicator className="text-foreground/55" />
          </Wrap>
        );

      case 'underline':
        return (
          <Wrap className="border-b border-foreground/30 focus-within:border-foreground transition-colors">
            {sel('text-foreground px-1 py-1')}
            <Indicator className="text-foreground/55" />
          </Wrap>
        );

      case 'ghost':
        return (
          <Wrap className="focus-within:ring-1 focus-within:ring-ring/40">
            {sel('text-foreground/50 hover:text-foreground px-1 py-1 transition-colors')}
            <Indicator className="text-foreground/25" />
          </Wrap>
        );

      case 'terminal':
        return (
          <span className="font-mono text-xs inline-flex items-center focus-within:ring-1 focus-within:ring-green-400/30">
            <span aria-hidden className="text-green-400/55 select-none">{'['}</span>
            <Wrap>
              {sel('text-green-400 px-0.5 py-0.5', { textShadow: '0 0 8px rgba(74,222,128,0.6)' })}
              <Indicator className="text-green-400/55" />
            </Wrap>
            <span aria-hidden className="text-green-400/55 select-none">{']'}</span>
          </span>
        );

      case 'amber':
        return (
          <Wrap className="border-b-2 border-amber-600/40 focus-within:border-amber-400 transition-colors">
            {sel('text-amber-400 px-1 py-1', { textShadow: '0 0 8px rgba(251,191,36,0.45)' })}
            <Indicator className="text-amber-500/55" />
          </Wrap>
        );

      case 'dos':
        return (
          <Wrap className="bg-[#000080] border border-[#aaaaaa]">
            {sel('text-[#aaaaaa] bg-[#000080] px-3 py-0.5 uppercase tracking-wide')}
            <Indicator char="▼" className="text-[#aaaaaa] right-2" />
          </Wrap>
        );

      case 'matrix':
        return (
          <span className="font-mono text-xs inline-flex items-center focus-within:ring-1 focus-within:ring-green-900/60">
            <span aria-hidden className="text-green-700 select-none mr-1 shrink-0">{'>_'}</span>
            <Wrap>
              {sel('text-green-400 px-0 py-0.5', { textShadow: '0 0 8px rgba(74,222,128,0.8)' })}
              <Indicator className="text-green-700" />
            </Wrap>
          </span>
        );

      case 'pipe':
        return (
          <Wrap className="border-l-2 border-foreground/20 focus-within:border-foreground/60 transition-colors pl-2">
            {sel('text-foreground py-1 px-1')}
            <Indicator className="text-foreground/40" />
          </Wrap>
        );

      case 'slash':
        return (
          <span className="font-mono text-xs inline-flex items-center focus-within:ring-1 focus-within:ring-ring/40">
            <span aria-hidden className="text-foreground/25 select-none mr-1 shrink-0">{'//'}</span>
            <Wrap>
              {sel('text-foreground/65 hover:text-foreground transition-colors px-0 py-0.5')}
              <Indicator className="text-foreground/25" />
            </Wrap>
          </span>
        );
    }
  }
);
Select.displayName = 'Select';
