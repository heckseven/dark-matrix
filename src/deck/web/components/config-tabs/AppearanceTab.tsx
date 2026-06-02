import { Radio } from '../ui/radio.js';
import { Text } from '../ui/text.js';
import { TabFrame } from './tab-frame.js';
import { CornerBrackets } from '../MatrixItem.js';
import { ColorInput } from '../ui/color-input.js';
import type { Appearance } from '../../types/config-types.js';

type Preset = 'dark-matrix' | 'phosphor' | 'mono';

const PRESETS: Preset[] = ['dark-matrix', 'phosphor', 'mono'];

const PRESET_ACCENTS: Record<Preset, { dark: string; light: string }> = {
  'dark-matrix': { dark: '#0DC45C', light: '#059a47' },
  'phosphor':    { dark: '#F59E0B', light: '#5B21B6' },
  'mono':        { dark: '#ffffff', light: '#000000' },
};

// Display names for each preset per scheme variant.
const DARK_LABELS: Record<Preset, string> = {
  'dark-matrix': 'dark-matrix',
  'phosphor':    'phosphor',
  'mono':        '0',
};

const LIGHT_LABELS: Record<Preset, string> = {
  'dark-matrix': 'light-matrix',
  'phosphor':    'vio1et',
  'mono':        '1',
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
        width: 176,
        height: 136,
        background: bg,
        border: `1px solid ${border}`,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 8, height: 8, background: fg, flexShrink: 0 }} />
        <div style={{ flex: 1, height: 2, background: fg }} />
        <div style={{ width: 8, height: 8, background: accent, flexShrink: 0 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, margin: '8px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 2 }}>
              <div style={{ width: 4, height: 12, background: bar }} />
              <div style={{ width: 4, height: 12, background: bar }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <div style={{ width: 14, height: 52, background: bar }} />
          <div style={{ width: 14, height: 52, background: bar }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 2 }}>
              <div style={{ width: 4, height: 12, background: bar }} />
              <div style={{ width: 4, height: 12, background: bar }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 8, height: 8, background: fg, flexShrink: 0 }} />
        <div style={{ flex: 1, height: 2, background: bar }} />
        <div style={{ width: 8, height: 8, background: fg, flexShrink: 0 }} />
      </div>
    </div>
  );
}

function ThemePreviewCard({ preset, isDark, label, selected, onSelect, disabled }: {
  preset: Preset;
  isDark: boolean;
  label: string;
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
      aria-label={`${label} theme`}
      aria-pressed={selected}
    >
      <div className="relative">
        <ThemeAbstractPreview accent={accent} fg={fg} bg={bg} border={border} />
        <CornerBrackets active={selected} />
      </div>
      <Text as="span" size="sm" variant="muted">{label}</Text>
    </button>
  );
}

const LEGEND = 'font-mono text-xs text-muted-foreground uppercase tracking-widest mb-2';

export function AppearanceTab({ value, onChange }: AppearanceTabProps) {
  const appearance = value ?? DEFAULT_APPEARANCE;

  const showDark = appearance.color_scheme !== 'light';
  const showLight = appearance.color_scheme !== 'dark';

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

      {/* Dark theme picker — hidden in light-only mode */}
      {showDark && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-widest">dark theme</span>
          <div className="flex gap-3">
            {PRESETS.map(preset => (
              <ThemePreviewCard
                key={preset}
                preset={preset}
                isDark={true}
                label={DARK_LABELS[preset]}
                selected={appearance.dark_preset === preset}
                onSelect={() => onChange({ ...appearance, dark_preset: preset })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Light theme picker — hidden in dark-only mode */}
      {showLight && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-widest">light theme</span>
          <div className="flex gap-3">
            {PRESETS.map(preset => (
              <ThemePreviewCard
                key={preset}
                preset={preset}
                isDark={false}
                label={LIGHT_LABELS[preset]}
                selected={appearance.light_preset === preset}
                onSelect={() => onChange({ ...appearance, light_preset: preset })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Accent */}
      <fieldset className="border-0 p-0 m-0">
        <legend className={LEGEND}>accent</legend>
        <ColorInput
          {...(appearance.accent !== undefined ? { value: appearance.accent } : {})}
          onChange={(hex) => onChange({ ...appearance, accent: hex })}
          {...(appearance.accent !== undefined ? { onClear: () => onChange(dropAccent(appearance)) } : {})}
          aria-label="Accent color override"
        />
      </fieldset>
    </TabFrame>
  );
}
