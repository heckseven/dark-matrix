import { useState, useEffect, type ChangeEvent } from 'react';
import { Input } from '../ui/input.js';
import { Radio } from '../ui/radio.js';
import { Text } from '../ui/text.js';
import { TabFrame, TabRow } from './tab-frame.js';
import { CornerBrackets } from '../MatrixItem.js';
import type { Appearance } from '../../types/config-types.js';

type Preset = 'dark-matrix' | 'phosphor' | 'mono';

const PRESETS: Preset[] = ['dark-matrix', 'phosphor', 'mono'];

const PRESET_ACCENTS: Record<Preset, { dark: string; light: string }> = {
  'dark-matrix': { dark: '#0DC45C', light: '#059a47' },
  'phosphor':    { dark: '#F59E0B', light: '#b45309' },
  'mono':        { dark: '#ffffff', light: '#000000' },
};

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
      {/* Top status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 4, height: 4, background: fg, flexShrink: 0 }} />
        <div style={{ flex: 1, height: 1, background: fg }} />
        <div style={{ width: 4, height: 4, background: accent, flexShrink: 0 }} />
      </div>
      {/* Matrix center */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, flex: 1, margin: '4px 0' }}>
        {/* Left sidebar bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 1 }}>
              <div style={{ width: 2, height: 6, background: bar }} />
              <div style={{ width: 2, height: 6, background: bar }} />
            </div>
          ))}
        </div>
        {/* Matrix modules */}
        <div style={{ display: 'flex', gap: 1 }}>
          <div style={{ width: 7, height: 26, background: bar }} />
          <div style={{ width: 7, height: 26, background: bar }} />
        </div>
        {/* Right sidebar bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 1 }}>
              <div style={{ width: 2, height: 6, background: bar }} />
              <div style={{ width: 2, height: 6, background: bar }} />
            </div>
          ))}
        </div>
      </div>
      {/* Bottom status bar */}
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

export function AppearanceTab({ value, onChange }: AppearanceTabProps) {
  const appearance = value ?? DEFAULT_APPEARANCE;
  const [hexInput, setHexInput] = useState(value?.accent ?? '');

  useEffect(() => {
    setHexInput(value?.accent ?? '');
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

  function handleColorPicker(e: ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    setHexInput(hex);
    if (HEX_RE.test(hex)) onChange({ ...appearance, accent: hex });
  }

  function handleHexInput(e: ChangeEvent<HTMLInputElement>) {
    setHexInput(e.target.value);
  }

  function handleHexBlur() {
    if (hexInput === '') {
      onChange(dropAccent(appearance));
    } else if (HEX_RE.test(hexInput)) {
      onChange({ ...appearance, accent: hexInput });
    } else {
      setHexInput(value?.accent ?? '');
    }
  }

  function handleClearAccent() {
    setHexInput('');
    onChange(dropAccent(appearance));
  }

  const isLightLocked = appearance.color_scheme === 'light';
  const isDarkLocked = appearance.color_scheme === 'dark';

  // Placeholder reflects the currently active preset variant so users know what they're overriding.
  const effectiveIsDark = appearance.color_scheme !== 'light';
  const activePreset = effectiveIsDark ? appearance.dark_preset : appearance.light_preset;
  const accentPlaceholder = PRESET_ACCENTS[activePreset][effectiveIsDark ? 'dark' : 'light'];

  return (
    <TabFrame>
      {/* Style control */}
      <TabRow label="style">
        <div role="radiogroup" aria-label="Color style" className="flex items-center gap-4">
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
      </TabRow>

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

      {/* Accent override */}
      <TabRow label="accent">
        <input
          type="color"
          value={HEX_RE.test(hexInput) ? hexInput : accentPlaceholder}
          onChange={handleColorPicker}
          className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
          aria-label="Pick accent color override"
        />
        <Input
          value={hexInput}
          onChange={handleHexInput}
          onBlur={handleHexBlur}
          placeholder={accentPlaceholder}
          aria-label="Accent color hex override"
          className="w-24 font-mono uppercase"
        />
        {appearance.accent && (
          <button
            type="button"
            onClick={handleClearAccent}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:underline"
            aria-label="Clear accent override"
          >
            reset
          </button>
        )}
      </TabRow>
    </TabFrame>
  );
}
