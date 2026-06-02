import { Radio } from '../ui/radio.js';
import { Text } from '../ui/text.js';
import { TabFrame, TabRow } from './tab-frame.js';
import { CornerBrackets } from '../MatrixItem.js';
import { ColorInput } from '../ui/color-input.js';
import type { Appearance } from '../../types/config-types.js';

type Preset = 'dark-matrix' | 'phosphor' | 'mono';

const PRESETS: Preset[] = ['dark-matrix', 'phosphor', 'mono'];

const PRESET_ACCENTS: Record<Preset, { dark: string; light: string }> = {
  'dark-matrix': { dark: '#0DC45C', light: '#059a47' },
  'phosphor':    { dark: '#F59E0B', light: '#b45309' },
  'mono':        { dark: '#ffffff', light: '#000000' },
};

const DEFAULT_APPEARANCE: Appearance = {
  dark_preset: 'dark-matrix',
  light_preset: 'dark-matrix',
  color_scheme: 'dark',
};

function dropAccent(a: Appearance): Appearance {
  return {
    dark_preset: a.dark_preset,
    light_preset: a.light_preset,
    color_scheme: a.color_scheme,
  };
}

interface AppearanceTabProps {
  value?: Appearance;
  onChange: (a: Appearance) => void;
}

function ThemeAbstractPreview({ accent, fg, bg, border }: {
  accent: string; fg: string; bg: string; border: string;
}) {
  const bar = fg === '#ffffff' ? '#606060' : '#a0a0a0';
  return (
    <div
      aria-hidden="true"
      style={{
        width: 88,
        height: 68,
        background: bg,
        border: `1px solid ${border}`,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 4, height: 4, background: fg, flexShrink: 0 }} />
        <div style={{ flex: 1, height: 1, background: fg }} />
        <div style={{ width: 4, height: 4, background: accent, flexShrink: 0 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, flex: 1, margin: '4px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 1 }}>
              <div style={{ width: 2, height: 6, background: bar }} />
              <div style={{ width: 2, height: 6, background: bar }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 1 }}>
          <div style={{ width: 7, height: 26, background: bar }} />
          <div style={{ width: 7, height: 26, background: bar }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 1 }}>
              <div style={{ width: 2, height: 6, background: bar }} />
              <div style={{ width: 2, height: 6, background: bar }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 4, height: 4, background: fg, flexShrink: 0 }} />
        <div style={{ flex: 1, height: 1, background: bar }} />
        <div style={{ width: 4, height: 4, background: fg, flexShrink: 0 }} />
      </div>
    </div>
  );
}

function ThemePreviewCard({ preset, isDark, selected, onSelect, disabled }: {
  preset: Preset;
  isDark: boolean;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const bg = isDark ? '#000000' : '#ffffff';
  const fg = isDark ? '#ffffff' : '#000000';
  const border = isDark ? '#2a2a2a' : '#d4d4d4';
  const accent = PRESET_ACCENTS[preset][isDark ? 'dark' : 'light'];

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="relative group flex flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-sm"
      aria-label={`${preset} ${isDark ? 'dark' : 'light'} theme`}
      aria-pressed={selected}
    >
      <div className="relative">
        <ThemeAbstractPreview accent={accent} fg={fg} bg={bg} border={border} />
        <CornerBrackets active={selected} />
      </div>
      <Text as="span" size="sm" variant="muted">{preset}</Text>
    </button>
  );
}

const LEGEND = 'font-mono text-xs text-muted-foreground uppercase tracking-widest mb-2';

export function AppearanceTab({ value, onChange }: AppearanceTabProps) {
  const appearance = value ?? DEFAULT_APPEARANCE;

  const isLightLocked = appearance.color_scheme === 'light';
  const isDarkLocked = appearance.color_scheme === 'dark';

  return (
    <TabFrame>
      {/* Style */}
      <fieldset className="border-0 p-0 m-0">
        <legend className={LEGEND}>style</legend>
        <div className="flex flex-col gap-1.5">
          {(['dark', 'auto', 'light'] as const).map(mode => (
            <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
              <Radio
                name="color-scheme"
                value={mode}
                checked={appearance.color_scheme === mode}
                onChange={() => onChange({ ...appearance, color_scheme: mode })}
              />
              <Text as="span" size="xs">{mode}</Text>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Dark theme picker */}
      <div className={`flex flex-col gap-2 transition-opacity ${isLightLocked ? 'opacity-40 select-none' : ''}`}>
        {isLightLocked && <p className="sr-only">Dark theme is not applied in light mode.</p>}
        <span className="text-xs text-muted-foreground uppercase tracking-widest">dark theme</span>
        <div className="flex gap-3">
          {PRESETS.map(preset => (
            <ThemePreviewCard
              key={preset}
              preset={preset}
              isDark={true}
              selected={appearance.dark_preset === preset}
              onSelect={() => onChange({ ...appearance, dark_preset: preset })}
              disabled={isLightLocked}
            />
          ))}
        </div>
      </div>

      {/* Light theme picker */}
      <div className={`flex flex-col gap-2 transition-opacity ${isDarkLocked ? 'opacity-40 select-none' : ''}`}>
        {isDarkLocked && <p className="sr-only">Light theme is not applied in dark mode.</p>}
        <span className="text-xs text-muted-foreground uppercase tracking-widest">light theme</span>
        <div className="flex gap-3">
          {PRESETS.map(preset => (
            <ThemePreviewCard
              key={preset}
              preset={preset}
              isDark={false}
              selected={appearance.light_preset === preset}
              onSelect={() => onChange({ ...appearance, light_preset: preset })}
              disabled={isDarkLocked}
            />
          ))}
        </div>
      </div>

      {/* Accent */}
      <TabRow label="accent">
        <ColorInput
          value={appearance.accent}
          onChange={(hex) => onChange({ ...appearance, accent: hex })}
          onClear={appearance.accent ? () => onChange(dropAccent(appearance)) : undefined}
          aria-label="Accent color override"
        />
      </TabRow>
    </TabFrame>
  );
}
