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
          'A hex color input built on React Aria `ColorField`.',
          '',
          'Styled to match the project\'s `[ value ]` bracket aesthetic.',
          'The color swatch updates live as the user types. Arrow keys increment',
          'individual color channels. Accepts any CSS color format and converts to hex.',
          '',
          '**Usage**',
          '- Pass `value` as a `#rrggbb` hex string.',
          '- `onChange` fires only when the entered value is a valid color.',
          '- Provide `onClear` to render a "reset" label when a value is set.',
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

/** No value — input is empty, swatch is transparent. */
export const Empty: Story = {};

/** A preset design-system color. */
export const WithValue: Story = {
  args: { value: '#0dc45c' },
};

/** Shows the reset button when both value and onClear are provided. */
export const WithClear: Story = {
  args: { value: '#fe428f' },
};

/** Interactive controlled example — type any color or use arrow keys to adjust channels. */
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

/** Disabled state. */
export const Disabled: Story = {
  args: { value: '#f59e0b', isDisabled: true },
  parameters: { a11y: { context: { exclude: ['[aria-hidden="true"]'] } } },
};
