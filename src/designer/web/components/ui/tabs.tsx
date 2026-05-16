import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';

export type TabOption = { value: string; label?: string };

export type TabsProps = {
  options: readonly (string | TabOption)[];
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
  className?: string;
};

function normalize(o: string | TabOption): { value: string; label: string } {
  const x = typeof o === 'string' ? { value: o } : o;
  return { value: x.value, label: x.label ?? x.value };
}

function ShelfLabel({ text, active }: { text: string; active: boolean }): ReactNode {
  const inner = '  ' + text + '  ';
  const bar = active ? `┕${'━'.repeat(text.length + 2)}┙` : '​';
  return (
    <span className="flex flex-col leading-none">
      <span className="py-1">{inner}</span>
      <span>{bar}</span>
    </span>
  );
}

export function Tabs({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: TabsProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex gap-0', className)}
    >
      {options.map(o => {
        const { value: v, label } = normalize(o);
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            className={cn(
              'font-mono text-xs transition-colors text-left',
              active ? 'text-white' : 'text-white/35 hover:text-white/60',
            )}
            onClick={() => onChange(v)}
          >
            <ShelfLabel text={label} active={active} />
          </button>
        );
      })}
    </div>
  );
}
