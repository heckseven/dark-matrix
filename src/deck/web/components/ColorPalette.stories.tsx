import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ColorPalette } from './ColorPalette.js';

function Controlled({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
      <ColorPalette value={v} onChange={next => { setV(next); onChange(next); }} />
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888', marginTop: 2 }}>
        active: {v}
      </span>
    </div>
  );
}

const meta = {
  title: 'App/Design/ColorPalette',
  component: ColorPalette,
  tags: ['autodocs'],
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: [
          'Grayscale color picker. Six preset swatches (255 → 0) plus user-defined custom swatches.',
          '',
          '**Mouse** — click a swatch to select it. Click `+` to add a custom swatch; drag the `[  ]` label to scrub its value, or click to type.',
          '',
          '**Keyboard** — `↑`/`↓` navigate rows, `Enter`/`Space` select, `Escape` dismiss. Arrow keys also step a focused custom swatch value; hold `Shift` for ×10.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 255, step: 1 },
      description: 'Currently selected color value (0–255).',
    },
    onChange: { description: 'Called whenever the selected color changes.' },
  },
  args: { value: 255, onChange: fn() },
} satisfies Meta<typeof ColorPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full interaction: presets, custom swatches, keyboard navigation. */
export const Playground: Story = {
  render: args => <Controlled {...args} />,
};

function MinimalDemo({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return <ColorPalette value={v} onChange={next => { setV(next); onChange(next); }} />;
}

/** Component alone, no value readout. */
export const Minimal: Story = {
  render: args => <MinimalDemo {...args} />,
};
