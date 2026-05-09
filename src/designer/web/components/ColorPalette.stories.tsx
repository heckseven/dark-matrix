import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { ColorPalette } from './ColorPalette.js';

function ColorPaletteDemo({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
      <ColorPalette value={value} onChange={setValue} />
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#444', marginTop: 2 }}>
        active: {value}
      </span>
    </div>
  );
}

const meta = {
  title: 'Design/ColorPalette',
  component: ColorPaletteDemo,
  tags: [],
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: [
          'Preset grayscale palette with custom swatch builder.',
          '',
          '**Mouse** — click to select; click a custom swatch to re-open its scrub input.',
          '**Keyboard** — `↑`/`↓` navigate, `Enter`/`Space` select, `Escape` dismiss.',
          '**Custom swatches** — click `+` to add; drag `[128]` label to scrub value, click to type.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    initial: { control: { type: 'range', min: 0, max: 255, step: 1 }, description: 'Initial active color.' },
  },
  args: { initial: 255 },
} satisfies Meta<typeof ColorPaletteDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
