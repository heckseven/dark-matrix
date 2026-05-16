import * as React from 'react';
import { cn } from '@/lib/utils.js';

export type RadioVariant =
  | 'paren'    // ( ) / (•)
  | 'bracket'  // [ ] / [•]
  | 'green'    // ( ) / (•) green glow — matches Select
  | 'cursor'   //    / ›   right-pointing cursor prefix
  | 'circle'   // ○  / ●   unicode circles
  | 'angle'    // <·> / <•> angle brackets
  | 'block'    // [ ] / [■] solid fill
  | 'asterisk' // ( ) / (*) asterisk
  | 'dot'      // ·  / ●   minimal dot
  | 'track';   // ─·─ / ─●─ inline track

type VariantDef = {
  off: string;
  on: string;
  offCls: string;
  onCls: string;
  onStyle?: React.CSSProperties;
};

const VARIANTS: Record<RadioVariant, VariantDef> = {
  paren:    { off: '( )', on: '(●)', offCls: 'text-foreground',       onCls: 'text-foreground' },
  bracket:  { off: '[ ]', on: '[•]', offCls: 'text-muted-foreground', onCls: 'text-foreground' },
  green:    { off: '( )', on: '(•)', offCls: 'text-green-400/40',     onCls: 'text-green-400', onStyle: { textShadow: '0 0 8px rgba(74,222,128,0.6)' } },
  cursor:   { off: '  ' , on: '› ',  offCls: 'text-muted-foreground', onCls: 'text-foreground' },
  circle:   { off: '○',  on: '●',   offCls: 'text-muted-foreground', onCls: 'text-foreground' },
  angle:    { off: '<·>', on: '<•>', offCls: 'text-muted-foreground', onCls: 'text-foreground' },
  block:    { off: '[ ]', on: '[■]', offCls: 'text-muted-foreground', onCls: 'text-foreground' },
  asterisk: { off: '( )', on: '(*)', offCls: 'text-muted-foreground', onCls: 'text-foreground' },
  dot:      { off: '·',  on: '●',   offCls: 'text-muted-foreground', onCls: 'text-foreground' },
  track:    { off: '─·─', on: '─●─', offCls: 'text-muted-foreground', onCls: 'text-foreground' },
};

const focusCls = [
  'peer-focus-visible:ring-1',
  'peer-focus-visible:ring-ring',
  'peer-focus-visible:ring-offset-1',
  'peer-focus-visible:ring-offset-background',
  'rounded-sm',
].join(' ');

const baseCls = cn('font-mono text-sm select-none transition-colors', focusCls, 'peer-disabled:opacity-40');

export type RadioProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: RadioVariant;
};

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, variant = 'paren', ...props }, ref) => {
    const v = VARIANTS[variant];
    return (
      <span className={cn('inline-flex items-center', className)}>
        <input ref={ref} type="radio" className="sr-only peer" {...props} />
        <span aria-hidden="true" className={cn(baseCls, v.offCls, 'peer-checked:hidden')}>{v.off}</span>
        <span aria-hidden="true" className={cn(baseCls, v.onCls, 'hidden peer-checked:inline')} style={v.onStyle}>{v.on}</span>
      </span>
    );
  }
);
Radio.displayName = 'Radio';
