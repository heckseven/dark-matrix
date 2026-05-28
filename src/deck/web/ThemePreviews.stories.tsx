import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';

// ── palette definitions ───────────────────────────────────────────────────────

const DARK: Record<string, string> = {
  '--color-background':            '#000000',
  '--color-foreground':            '#ffffff',
  '--color-muted':                 '#0f0f0f',
  '--color-muted-foreground':      '#888888',
  '--color-border':                '#2a2a2a',
  '--color-input':                 '#0f0f0f',
  '--color-secondary':             '#0f0f0f',
  '--color-secondary-foreground':  '#ffffff',
  '--color-accent':                '#1a1a1a',
  '--color-accent-foreground':     '#ffffff',
  '--color-destructive':           '#FF3131',
  '--color-destructive-foreground':'#ffffff',
};

const LIGHT: Record<string, string> = {
  '--color-background':            '#ffffff',
  '--color-foreground':            '#000000',
  '--color-muted':                 '#f0f0f0',
  '--color-muted-foreground':      '#555555',
  '--color-border':                '#d4d4d4',
  '--color-input':                 '#f0f0f0',
  '--color-secondary':             '#f0f0f0',
  '--color-secondary-foreground':  '#000000',
  '--color-accent':                '#e8e8e8',
  '--color-accent-foreground':     '#000000',
  '--color-destructive':           '#dc2626',
  '--color-destructive-foreground':'#ffffff',
};

function scoped(dark: boolean, accent: string, accentFg: string): CSSProperties {
  return {
    ...(dark ? DARK : LIGHT),
    '--color-primary':            accent,
    '--color-ring':               accent,
    '--color-primary-foreground': accentFg,
  } as CSSProperties;
}

// ── pixel grid pattern ────────────────────────────────────────────────────────
// 0 = unlit (border), 1 = lit (foreground), 2 = peak (primary)
// Bell-curve EQ bars: heights [1,3,5,7,8,6,4,2,1] — accent marks each column top

const GRID: (0|1|2)[][] = [
  [0,0,0,0,2,0,0,0,0],
  [0,0,0,2,1,0,0,0,0],
  [0,0,0,1,1,2,0,0,0],
  [0,0,2,1,1,1,0,0,0],
  [0,0,1,1,1,1,2,0,0],
  [0,2,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,2,0],
  [2,1,1,1,1,1,1,1,2],
];

const CELLS = GRID.flat();

// ── theme card ────────────────────────────────────────────────────────────────

type ThemeConfig = { label: string; dark: boolean; accent: string; accentFg: string };

function ThemeCard({ label, dark, accent, accentFg }: ThemeConfig) {
  const vars = scoped(dark, accent, accentFg);

  return (
    <div
      style={vars}
      className="w-44 overflow-hidden rounded border border-border bg-background font-mono"
    >
      {/* header */}
      <div
        className="flex items-center gap-1.5 border-b border-border px-2 py-1.5"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-background) 80%, transparent)' }}
      >
        <span className="text-[10px] leading-none text-primary">●</span>
        <span className="truncate text-[8px] uppercase tracking-widest text-foreground/70 leading-none">
          {label}
        </span>
      </div>

      {/* pixel grid */}
      <div
        className="grid gap-px p-2"
        style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}
      >
        {CELLS.map((v, i) => (
          <div
            key={i}
            className="aspect-square"
            style={{
              backgroundColor:
                v === 2 ? 'var(--color-primary)'
                : v === 1 ? 'var(--color-foreground)'
                : 'var(--color-border)',
            }}
          />
        ))}
      </div>

      {/* footer */}
      <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
        <span
          className="px-1 text-[8px] leading-relaxed font-mono"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-primary-foreground)',
          }}
        >
          live
        </span>
        <span className="text-[8px] text-muted-foreground leading-none">config</span>
        <span className="ml-auto text-[8px] leading-none text-muted-foreground">
          {dark ? 'dark' : 'light'}
        </span>
      </div>
    </div>
  );
}

// ── theme catalogue ───────────────────────────────────────────────────────────

const THEMES: ThemeConfig[] = [
  { label: 'dark-matrix',  dark: true,  accent: '#0DC45C', accentFg: '#000000' },
  { label: 'dark-matrix',  dark: false, accent: '#059a47', accentFg: '#ffffff' },
  { label: 'phosphor',     dark: true,  accent: '#F59E0B', accentFg: '#000000' },
  { label: 'phosphor',     dark: false, accent: '#b45309', accentFg: '#ffffff' },
  { label: 'mono',         dark: true,  accent: '#ffffff', accentFg: '#000000' },
  { label: 'mono',         dark: false, accent: '#000000', accentFg: '#ffffff' },
  { label: 'custom · cyan',    dark: true,  accent: '#22D3EE', accentFg: '#000000' },
  { label: 'custom · violet',  dark: true,  accent: '#A855F7', accentFg: '#ffffff' },
  { label: 'custom · rose',    dark: true,  accent: '#F43F5E', accentFg: '#ffffff' },
  { label: 'custom · orange',  dark: true,  accent: '#F97316', accentFg: '#000000' },
  { label: 'custom · teal',    dark: false, accent: '#0D9488', accentFg: '#ffffff' },
  { label: 'custom · pink',    dark: false, accent: '#DB2777', accentFg: '#ffffff' },
];

// ── story ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Design/Theme Previews',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;

export const AllThemes: StoryObj = {
  name: 'All Themes',
  render: () => (
    <div
      className="p-8 min-h-screen font-mono"
      style={{ backgroundColor: '#111' }}
    >
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(176px, max-content))' }}>
        {THEMES.map(t => (
          <ThemeCard key={`${t.label}-${t.dark}`} {...t} />
        ))}
      </div>
    </div>
  ),
};
