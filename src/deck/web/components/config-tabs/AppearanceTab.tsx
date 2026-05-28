import { useState, type ChangeEvent } from 'react';
import { Select } from '../ui/select.js';
import { Input } from '../ui/input.js';
import { TabFrame, TabRow } from './tab-frame.js';
import type { Appearance } from '../../types/config-types.js';

const PRESET_OPTIONS = [
  { value: 'dark-matrix', label: 'dark-matrix' },
  { value: 'phosphor',    label: 'phosphor'    },
  { value: 'mono',        label: 'mono'        },
  { value: 'custom',      label: 'custom'      },
];

const SCHEME_OPTIONS = [
  { value: 'dark',  label: 'dark'  },
  { value: 'light', label: 'light' },
  { value: 'auto',  label: 'auto'  },
];

const PRESET_SEED_ACCENT: Record<string, string> = {
  'dark-matrix': '#0DC45C',
  'phosphor':    '#F59E0B',
  'mono':        '#ffffff',
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_APPEARANCE: Appearance = { preset: 'dark-matrix', color_scheme: 'dark' };

interface AppearanceTabProps {
  value?: Appearance;
  onChange: (a: Appearance) => void;
}

export function AppearanceTab({ value, onChange }: AppearanceTabProps) {
  const appearance = value ?? DEFAULT_APPEARANCE;
  const [hexInput, setHexInput] = useState(appearance.accent ?? '#0DC45C');

  function handlePresetChange(preset: string) {
    const next: Appearance = {
      preset: preset as Appearance['preset'],
      color_scheme: appearance.color_scheme,
      ...(preset === 'custom'
        ? { accent: appearance.accent ?? PRESET_SEED_ACCENT[appearance.preset] ?? '#0DC45C' }
        : {}),
    };
    if (next.preset === 'custom') setHexInput(next.accent!);
    onChange(next);
  }

  function handleSchemeChange(color_scheme: string) {
    onChange({ ...appearance, color_scheme: color_scheme as Appearance['color_scheme'] });
  }

  function handleColorPicker(e: ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    setHexInput(hex);
    onChange({ ...appearance, accent: hex });
  }

  function handleHexInput(e: ChangeEvent<HTMLInputElement>) {
    setHexInput(e.target.value);
  }

  function handleHexBlur() {
    if (HEX_RE.test(hexInput)) {
      onChange({ ...appearance, accent: hexInput });
    } else {
      setHexInput(appearance.accent ?? '#0DC45C');
    }
  }

  return (
    <TabFrame>
      <TabRow label="preset">
        <Select
          aria-label="Theme preset"
          options={PRESET_OPTIONS}
          value={appearance.preset}
          onValueChange={handlePresetChange}
        />
      </TabRow>

      <TabRow label="color scheme">
        <Select
          aria-label="Color scheme"
          options={SCHEME_OPTIONS}
          value={appearance.color_scheme}
          onValueChange={handleSchemeChange}
        />
      </TabRow>

      {appearance.preset === 'custom' && (
        <TabRow label="accent">
          <input
            type="color"
            value={HEX_RE.test(hexInput) ? hexInput : '#0DC45C'}
            onChange={handleColorPicker}
            className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
            aria-label="Pick accent color"
          />
          <Input
            value={hexInput}
            onChange={handleHexInput}
            onBlur={handleHexBlur}
            aria-label="Accent color hex value"
            className="w-24 font-mono uppercase"
          />
        </TabRow>
      )}
    </TabFrame>
  );
}
