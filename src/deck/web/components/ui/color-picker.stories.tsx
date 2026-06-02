/**
 * Design explorations for an accent color picker.
 * No component exists yet — these are interactive renders for design review.
 *
 * Palette sourced from Heck Systems Figma + existing design system accents.
 * Three directions: swatch grid, radio list, compact strip.
 */
import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CornerBrackets } from '../MatrixItem.js';
import { Radio } from './radio.js';
import { Text } from './text.js';
import { Input } from './input.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const PALETTE = [
  { label: 'matrix',   hex: '#0DC45C' },
  { label: 'amber',    hex: '#F59E0B' },
  { label: 'volt',     hex: '#D4FF00' },
  { label: 'cyan',     hex: '#22D3EE' },
  { label: 'blue',     hex: '#1B8BFF' },
  { label: 'pink',     hex: '#FF1870' },
  { label: 'red',      hex: '#FF3131' },
  { label: 'white',    hex: '#FFFFFF' },
] as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------------------
// Storybook meta — placeholder component; stories use render functions
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AccentPickerPlaceholder(_: { value?: string; onChange?: (hex: string) => void }) {
  return null;
}

const meta = {
  title: 'Design/Accent Picker',
  component: AccentPickerPlaceholder,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AccentPickerPlaceholder>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Design A — Swatch grid
// Square swatches in a row, CornerBrackets on the selected one, hex below.
// Same selection idiom as the theme preview cards — high visual consistency.
// ---------------------------------------------------------------------------

/** Square swatch row with corner-bracket selection + hex display.
 *  Consistent with how theme presets are picked. */
export const SwatchGrid: Story = {
  render: () => {
    const [preset, setPreset] = React.useState<string>(PALETTE[0].hex);
    const [hexInput, setHexInput] = React.useState('');

    const isCustomActive = HEX_RE.test(hexInput);
    const displayHex = isCustomActive ? hexInput : preset;

    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          {PALETTE.map(({ hex, label }) => {
            const active = preset === hex && !isCustomActive;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => { setPreset(hex); setHexInput(''); }}
                className="relative group focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
                aria-label={label}
                aria-pressed={active}
              >
                <div className="relative" style={{ width: 24, height: 24 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      background: hex,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                  <CornerBrackets active={active} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Text as="code" size="xs" variant="muted" className="font-mono uppercase tracking-widest">
            {displayHex}
          </Text>
          <span className="text-border">·</span>
          <Input
            value={hexInput}
            onChange={e => setHexInput(e.target.value)}
            placeholder="custom"
            className="w-24 font-mono uppercase text-xs h-6"
            aria-label="Custom hex override"
          />
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Design B — Radio list
// Each colour as a Radio option with a small dot swatch + name label.
// Identical pattern to brightness mode / urgency — maximum form consistency.
// ---------------------------------------------------------------------------

/** Radio group with coloured dot + name label.
 *  Same pattern as brightness mode and urgency selectors. */
export const RadioList: Story = {
  render: () => {
    const [selected, setSelected] = React.useState<string>(PALETTE[0].hex);

    return (
      <fieldset className="border-0 p-0 m-0">
        <legend className="font-mono text-xs text-muted-foreground mb-2">accent</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {PALETTE.map(({ hex, label }) => (
            <label key={hex} className="flex items-center gap-1.5 cursor-pointer">
              <Radio
                name="accent-radio"
                value={hex}
                checked={selected === hex}
                onChange={() => setSelected(hex)}
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
                  border: hex === '#FFFFFF' ? '1px solid rgba(255,255,255,0.2)' : undefined,
                }}
              />
              <Text as="span" size="xs" variant="muted">{label}</Text>
            </label>
          ))}
        </div>
      </fieldset>
    );
  },
};

// ---------------------------------------------------------------------------
// Design C — Compact strip
// Tight row of small squares, selected gets a foreground outline ring.
// No labels; hex shown below. Minimal inline footprint — fits in a TabRow.
// ---------------------------------------------------------------------------

/** Tight 16 px strip of swatches with outline ring on selected + hex below.
 *  Most compact — designed to sit inline in a single config row. */
export const CompactStrip: Story = {
  render: () => {
    const [selected, setSelected] = React.useState<string>(PALETTE[0].hex);

    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-1">
          {PALETTE.map(({ hex, label }) => {
            const active = selected === hex;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => setSelected(hex)}
                className="focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
                aria-label={label}
                aria-pressed={active}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    background: hex,
                    outline: active ? '2px solid var(--color-foreground)' : undefined,
                    outlineOffset: active ? '2px' : undefined,
                    border: hex === '#FFFFFF' ? '1px solid rgba(255,255,255,0.15)' : undefined,
                  }}
                />
              </button>
            );
          })}
        </div>
        <Text as="code" size="xs" variant="muted" className="font-mono uppercase tracking-widest">
          {selected}
        </Text>
      </div>
    );
  },
};
