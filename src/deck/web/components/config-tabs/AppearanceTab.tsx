import { useState, useEffect, type ChangeEvent } from 'react';
import { Input } from '../ui/input.js';
import { Radio } from '../ui/radio.js';
import { Text } from '../ui/text.js';
import { TabFrame } from './tab-frame.js';
import { CornerBrackets } from '../MatrixItem.js';
import type { Appearance } from '../../types/config-types.js';

type Preset = 'dark-matrix' | 'phosphor' | 'mono';

const PRESETS: Preset[] = ['dark-matrix', 'phosphor', 'mono'];

const PRESET_ACCENTS: Record<Preset, { dark: string; light: string }> = {
  'dark-matrix': { dark: '#0DC45C', light: '#059a47' },
  'phosphor':    { dark: '#F59E0B', light: '#b45309' },
  'mono':        { dark: '#ffffff', light: '#000000' },
};

const PALETTE = [
  { label: 'gr455',  hex: '#0dc45c' },
  { label: 'p1nk',   hex: '#fe428f' },
  { label: '5ky',    hex: '#6dc3ff' },
  { label: '5un',    hex: '#fff420' },
  { label: 'y3llow', hex: '#ffff90' },
  { label: 'cuti3',  hex: '#e6b723' },
  { label: 'red5un', hex: '#ff3131' },
  { label: 'whi7e',  hex: '#ffffff' },
  { label: 'bl4ck',  hex: '#000000' },
] as const;

type PaletteHex = typeof PALETTE[number]['hex'];
type AccentSel = 'preset' | PaletteHex | 'custom';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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

function initAccentSel(accent?: string): AccentSel {
  if (!accent) return 'preset';
  const match = PALETTE.find(p => p.hex === accent);
  if (match) return match.hex;
  return 'custom';
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
  const [accentSel, setAccentSel] = useState<AccentSel>(() => initAccentSel(value?.accent));
  const [customHex, setCustomHex] = useState(
    initAccentSel(value?.accent) === 'custom' ? (value?.accent ?? '') : '',
  );

  useEffect(() => {
    const sel = initAccentSel(value?.accent);
    setAccentSel(sel);
    setCustomHex(sel === 'custom' ? (value?.accent ?? '') : '');
  }, [value?.accent]);

  function handleSchemeChange(color_scheme: Appearance['color_scheme']) {
    onChange({ ...appearance, color_scheme });
  }

  function handleDarkPresetChange(dark_preset: Preset) {
    onChange({ ...appearance, dark_preset });
  }

  function handleLightPresetChange(light_preset: Preset) {
    onChange({ ...appearance, light_preset });
  }

  function handlePaletteSelect(hex: PaletteHex) {
    setAccentSel(hex);
    setCustomHex('');
    onChange({ ...appearance, accent: hex });
  }

  function handlePresetSelect() {
    setAccentSel('preset');
    setCustomHex('');
    onChange(dropAccent(appearance));
  }

  function handleCustomSelect() {
    setAccentSel('custom');
  }

  function handleCustomHexChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setCustomHex(val);
    if (HEX_RE.test(val)) onChange({ ...appearance, accent: val });
  }

  function handleCustomHexBlur() {
    if (customHex === '') {
      setAccentSel('preset');
      onChange(dropAccent(appearance));
    }
  }

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
                onChange={() => handleSchemeChange(mode)}
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
              onSelect={() => handleDarkPresetChange(preset)}
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
              onSelect={() => handleLightPresetChange(preset)}
              disabled={isDarkLocked}
            />
          ))}
        </div>
      </div>

      {/* Accent */}
      <fieldset className="border-0 p-0 m-0">
        <legend className={LEGEND}>accent</legend>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Radio
              name="accent"
              value="preset"
              checked={accentSel === 'preset'}
              onChange={handlePresetSelect}
            />
            <Text as="span" size="xs" variant="muted">preset</Text>
          </label>
          {PALETTE.map(({ hex, label }) => (
            <label key={hex} className="flex items-center gap-1.5 cursor-pointer">
              <Radio
                name="accent"
                value={hex}
                checked={accentSel === hex}
                onChange={() => handlePaletteSelect(hex)}
              />
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: hex,
                  flexShrink: 0,
                  ...(hex === '#ffffff' || hex === '#000000'
                    ? { border: '1px solid rgba(128,128,128,0.2)' }
                    : {}),
                }}
              />
              <Text as="span" size="xs" variant="muted">{label}</Text>
            </label>
          ))}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Radio
              name="accent"
              value="custom"
              checked={accentSel === 'custom'}
              onChange={handleCustomSelect}
            />
            <Text as="span" size="xs" variant="muted">custom</Text>
            {accentSel === 'custom' && (
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={customHex}
                onChange={handleCustomHexChange}
                onBlur={handleCustomHexBlur}
                placeholder="#000000"
                aria-label="Custom accent hex"
                className="w-24 font-mono uppercase ml-1"
              />
            )}
          </label>
        </div>
      </fieldset>
    </TabFrame>
  );
}
