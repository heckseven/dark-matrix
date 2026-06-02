import * as React from 'react';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorInput } from './color-input.js';

const meta = {
  title: 'Components/ColorInput',
  component: ColorInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'A color picker built on React Aria `ColorPicker`.',
          '',
          'A 96×96 swatch shows the current color with the hex value overlaid.',
          'Clicking the swatch opens a popover containing:',
          '- `ColorArea` — 2D saturation/brightness square',
          '- `ColorSlider` — hue rail',
          '- `ColorField` — hex text entry in the `[ value ]` bracket style',
          '',
          'All three stay in sync via shared `ColorPicker` context.',
          'A "reset" button appears below the swatch when `onClear` is provided and a value is set.',
          '',
          '**Usage**',
          '- Pass `value` as a `#rrggbb` hex string.',
          '- `onChange` fires on every valid color change (drag, type, or arrow keys).',
          '- Provide `onClear` to enable the reset affordance.',
        ].join('\n'),
      },
    },
  },
  args: {
    onChange: fn(),
    onClear: fn(),
    'aria-label': 'Color',
  },
} satisfies Meta<typeof ColorInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No value — swatch shows the muted background and "—" label. */
export const Empty: Story = {};

/** A design-system green — swatch shows the color, no reset button. */
export const WithValue: Story = {
  args: { value: '#0dc45c', onClear: undefined },
};

/** Value with reset — reset button appears below the swatch. */
export const WithClear: Story = {
  args: { value: '#fe428f' },
};

/** Interactive — open the picker and drag to choose a color. */
export const Controlled: Story = {
  render: (args) => {
    const [hex, setHex] = React.useState('#0dc45c');
    return (
      <ColorInput
        {...args}
        value={hex}
        onChange={v => { setHex(v); args.onChange?.(v); }}
        onClear={() => { setHex(''); args.onClear?.(); }}
      />
    );
  },
};

/** Starts with no value — open the picker, pick a color, then reset. */
export const ControlledEmpty: Story = {
  render: (args) => {
    const [hex, setHex] = React.useState<string | undefined>(undefined);
    return (
      <ColorInput
        {...args}
        value={hex}
        onChange={v => { setHex(v); args.onChange?.(v); }}
        onClear={() => { setHex(undefined); args.onClear?.(); }}
      />
    );
  },
};
