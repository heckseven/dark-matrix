import type { Appearance } from '../types/config-types.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const DARK: Record<string, string> = {
  background: '#000000',
  foreground: '#ffffff',
  muted: '#0f0f0f',
  'muted-foreground': '#888888',
  border: '#2a2a2a',
  input: '#0f0f0f',
  secondary: '#0f0f0f',
  'secondary-foreground': '#ffffff',
  accent: '#1a1a1a',
  'accent-foreground': '#ffffff',
  destructive: '#FF3131',
  'destructive-foreground': '#ffffff',
};

const LIGHT: Record<string, string> = {
  background: '#ffffff',
  foreground: '#000000',
  muted: '#f0f0f0',
  'muted-foreground': '#555555',
  border: '#d4d4d4',
  input: '#f0f0f0',
  secondary: '#f0f0f0',
  'secondary-foreground': '#000000',
  accent: '#e8e8e8',
  'accent-foreground': '#000000',
  destructive: '#dc2626',
  'destructive-foreground': '#ffffff',
};

const ACCENTS: Record<string, { dark: string; light: string }> = {
  'dark-matrix': { dark: '#0DC45C', light: '#059a47' },
  'phosphor':    { dark: '#F59E0B', light: '#b45309' },
  'mono':        { dark: '#ffffff', light: '#000000' },
};

function getPrimaryForeground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.35 ? '#000000' : '#ffffff';
}

export function applyTheme(appearance?: Appearance): () => void {
  const darkPreset = appearance?.dark_preset ?? 'dark-matrix';
  const lightPreset = appearance?.light_preset ?? 'dark-matrix';
  const colorScheme = appearance?.color_scheme ?? 'dark';

  function apply(isDark: boolean): void {
    const base = isDark ? DARK : LIGHT;
    const preset = isDark ? darkPreset : lightPreset;
    for (const [k, v] of Object.entries(base)) {
      document.documentElement.style.setProperty(`--color-${k}`, v);
    }
    const accentHex = appearance?.accent
      ?? (isDark ? ACCENTS[preset]?.dark : ACCENTS[preset]?.light)
      ?? base['foreground']!;
    if (HEX_RE.test(accentHex)) {
      document.documentElement.style.setProperty('--color-primary', accentHex);
      document.documentElement.style.setProperty('--color-ring', accentHex);
      document.documentElement.style.setProperty('--color-primary-foreground', getPrimaryForeground(accentHex));
    }
  }

  if (colorScheme === 'auto') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => apply(e.matches);
    apply(mq.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }

  apply(colorScheme === 'dark');
  return () => {};
}
