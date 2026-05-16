import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils.js';

export type TabOption = { value: string; label?: string };

export type TabsVariant =
  | 'segment'   // clean inverted fill — the existing HudInspector style
  | 'terminal'  // green phosphor [bracket] notation
  | 'amber'     // amber CRT underline indicator
  | 'dos'       // DOS system menu, blue bg, inverted selection
  | 'c64'       // Commodore 64 dark blue / yellow
  | 'neon'      // cyberpunk cyan border glow
  | 'plasma'    // cyberpunk fuchsia border glow
  | 'crash'     // Hackers: crash override bold green blocks
  | 'acid'      // Hackers: acid burn hot pink blocks
  | 'matrix'    // Hackers/matrix: >_ prefix, deep green glow
  | 'shelf';    // box-drawing bracket underline indicator

export const TABS_VARIANTS: TabsVariant[] = [
  'segment', 'terminal', 'amber', 'dos', 'c64',
  'neon', 'plasma', 'crash', 'acid', 'matrix', 'shelf',
];

export type TabsProps = {
  options: readonly (string | TabOption)[];
  value: string;
  onChange: (value: string) => void;
  variant?: TabsVariant;
  'aria-label'?: string;
  className?: string;
};

type Def = {
  groupClass: string;
  groupStyle?: CSSProperties;
  btnClass: (active: boolean) => string;
  btnStyle?: (active: boolean) => CSSProperties;
  wrapLabel?: (text: string, active: boolean) => ReactNode;
};

const DEFS: Record<TabsVariant, Def> = {
  segment: {
    groupClass: 'flex gap-0 border border-white/30',
    btnClass: a => cn(
      'px-4 py-1 font-mono text-xs transition-colors',
      a ? 'bg-white text-black' : 'text-white/55 hover:text-white',
    ),
  },

  terminal: {
    groupClass: 'flex gap-4',
    btnClass: a => cn(
      'font-mono text-xs transition-colors',
      a ? 'text-green-400' : 'text-green-400/35 hover:text-green-400/55',
    ),
    btnStyle: a => a ? { textShadow: '0 0 8px rgba(74,222,128,0.7)' } : {},
    // brackets always present — HTML collapses whitespace so space-padding doesn't work
    wrapLabel: (t) => `[${t}]`,
  },

  amber: {
    groupClass: 'flex gap-0 border-b border-amber-700/40',
    btnClass: a => cn(
      'px-4 py-1 font-mono text-xs transition-colors border-b-2 -mb-px',
      a ? 'text-amber-400 border-amber-400' : 'text-amber-500/55 border-transparent hover:text-amber-400/75',
    ),
    btnStyle: a => a ? { textShadow: '0 0 10px rgba(251,191,36,0.6)' } : {},
  },

  dos: {
    groupClass: 'flex gap-0 bg-[#000080] border border-[#aaaaaa]',
    btnClass: a => cn(
      'px-4 py-0.5 font-mono text-xs uppercase tracking-wide transition-colors',
      a ? 'bg-[#aaaaaa] text-[#000080]' : 'text-[#aaaaaa] hover:text-white',
    ),
  },

  c64: {
    groupClass: 'flex gap-0 bg-[#0000aa] border-2 border-[#5555ff]',
    btnClass: a => cn(
      'px-4 py-1 font-mono text-xs uppercase tracking-widest transition-colors',
      a ? 'bg-[#aaaa00] text-[#0000aa]' : 'text-[#5555ff] hover:text-[#aaaaff]',
    ),
  },

  neon: {
    groupClass: 'flex gap-2',
    btnClass: a => cn(
      'px-4 py-1 font-mono text-xs border transition-colors',
      a
        ? 'border-cyan-400 text-cyan-400'
        : 'border-white/10 text-white/35 hover:border-white/25 hover:text-white/55',
    ),
    btnStyle: a => a ? {
      boxShadow: '0 0 8px rgba(34,211,238,0.35), inset 0 0 8px rgba(34,211,238,0.05)',
      textShadow: '0 0 8px rgba(34,211,238,0.8)',
    } : {},
  },

  plasma: {
    groupClass: 'flex gap-0 border border-fuchsia-500/35',
    btnClass: a => cn(
      'px-4 py-1 font-mono text-xs transition-colors',
      a ? 'bg-fuchsia-500/25 text-fuchsia-300' : 'text-fuchsia-400/55 hover:text-fuchsia-300',
    ),
    btnStyle: a => a ? {
      boxShadow: 'inset 0 0 12px rgba(217,70,239,0.2)',
      textShadow: '0 0 10px rgba(217,70,239,0.9)',
    } : {},
  },

  crash: {
    groupClass: 'flex gap-1',
    btnClass: a => cn(
      'px-4 py-1 font-mono text-xs font-bold uppercase tracking-widest border transition-colors',
      a
        ? 'bg-green-400 text-black border-green-400'
        : 'text-green-500/50 border-green-500/20 hover:border-green-500/45 hover:text-green-400/70',
    ),
    btnStyle: a => a ? {
      boxShadow: '0 0 12px rgba(74,222,128,0.5)',
      textShadow: '0 0 4px rgba(0,0,0,0.8)',
    } : {},
  },

  acid: {
    groupClass: 'flex gap-1',
    btnClass: a => cn(
      'px-4 py-1 font-mono text-xs uppercase tracking-wide border transition-colors',
      a
        ? 'bg-pink-500 text-white border-pink-500'
        : 'text-pink-400/55 border-pink-500/20 hover:border-pink-500/45 hover:text-pink-300',
    ),
    btnStyle: a => a ? {
      boxShadow: '0 0 14px rgba(236,72,153,0.5)',
      textShadow: '0 0 4px rgba(255,255,255,0.4)',
    } : {},
  },

  matrix: {
    groupClass: 'flex gap-4',
    btnClass: a => cn(
      'font-mono text-xs transition-colors',
      a ? 'text-green-400' : 'text-green-700 hover:text-green-600',
    ),
    btnStyle: a => a ? { textShadow: '0 0 8px rgba(74,222,128,0.9)' } : {},
    wrapLabel: (t, a) => a ? `>_ ${t}` : t,
  },

  shelf: {
    groupClass: 'flex gap-0',
    btnClass: a => cn(
      'font-mono text-xs transition-colors text-left',
      a ? 'text-white' : 'text-white/35 hover:text-white/60',
    ),
    wrapLabel: (t, a) => (
      <span className="flex flex-col leading-none">
        <span className="py-1">{`  ${t}  `}</span>
        <span>{a ? `┕${'━'.repeat(t.length + 2)}┙` : '​'}</span>
      </span>
    ),
  },
};

function normalize(o: string | TabOption): { value: string; label: string } {
  const x = typeof o === 'string' ? { value: o } : o;
  return { value: x.value, label: x.label ?? x.value };
}

export function Tabs({
  options,
  value,
  onChange,
  variant = 'segment',
  'aria-label': ariaLabel,
  className,
}: TabsProps) {
  const def = DEFS[variant];
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(def.groupClass, className)}
      style={def.groupStyle}
    >
      {options.map(o => {
        const { value: v, label } = normalize(o);
        const active = v === value;
        const display = def.wrapLabel ? def.wrapLabel(label, active) : label;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            className={def.btnClass(active)}
            style={def.btnStyle?.(active)}
            onClick={() => onChange(v)}
          >
            {display}
          </button>
        );
      })}
    </div>
  );
}
