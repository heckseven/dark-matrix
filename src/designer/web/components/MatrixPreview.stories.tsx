import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { MatrixPreview } from './MatrixPreview.js';

const ROWS = 34;

function makePixels(width: number, fn: (c: number, r: number) => number): string {
  const data = new Uint8Array(width * ROWS);
  for (let c = 0; c < width; c++)
    for (let r = 0; r < ROWS; r++)
      data[c * ROWS + r] = fn(c, r);
  return btoa(String.fromCharCode(...data));
}

const GRADIENT_9  = makePixels(9,  (c, r) => Math.round(((c * ROWS + r) / (9  * ROWS - 1)) * 255));
const GRADIENT_18 = makePixels(18, (c, r) => Math.round(((c * ROWS + r) / (18 * ROWS - 1)) * 255));
const CHECKER_9   = makePixels(9,  (c, r) => ((c + r) % 2 === 0 ? 255 : 0));
const EMPTY_9     = makePixels(9,  () => 0);

const FRAMES = [
  makePixels(9, (c, r) => (r < 17 ? 255 : 0)),
  makePixels(9, (c, r) => (r < 17 + c ? 255 : 0)),
  makePixels(9, () => 255),
  makePixels(9, (c, r) => (r > c ? 255 : 0)),
  makePixels(9, (c, r) => (r > 17 ? 255 : 0)),
  makePixels(9, () => 0),
];

const meta = {
  title: 'Components/MatrixPreview',
  component: MatrixPreview,
  tags: ['autodocs'],
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: [
          'Canvas thumbnail of a pixel matrix frame.',
          'Each cell is a 3×3 px block with a 1×1 px center dot representing the pixel value.',
          'Colors match `PixelCanvas` — `MIN_L=48` floor for non-zero values, black for zero.',
          '',
          '**Usage**',
          '```tsx',
          '<MatrixPreview pixels={frame.pixels} width={9} />',
          '```',
          '',
          'Canvas is always `width × 3` by `ROWS × 3` px (27 × 102 for 9-wide, 54 × 102 for 18-wide).',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    width: { control: 'radio', options: [9, 18], description: 'Matrix width.' },
  },
  args: { pixels: GRADIENT_9, width: 9 },
} satisfies Meta<typeof MatrixPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Column-major gradient across all 9 × 34 cells. */
export const Playground: Story = {};

/** 18-wide matrix — 54 × 102 px. */
export const Wide: Story = {
  args: { pixels: GRADIENT_18, width: 18 },
};

/** All pixels at maximum brightness. */
export const Full: Story = {
  args: { pixels: makePixels(9, () => 255) },
};

/** All pixels off — only the black grid visible. */
export const Empty: Story = {
  args: { pixels: EMPTY_9 },
};

/** Checkerboard — every other dot lit. */
export const Checkerboard: Story = {
  args: { pixels: CHECKER_9 },
};

/** Animated — cycles through frames to verify smooth redraws. */
export const Animated: Story = {
  render: args => {
    const [idx, setIdx] = useState(0);
    useEffect(() => {
      const id = setInterval(() => setIdx(i => (i + 1) % FRAMES.length), 120);
      return () => clearInterval(id);
    }, []);
    return <MatrixPreview {...args} pixels={FRAMES[idx]!} />;
  },
};
