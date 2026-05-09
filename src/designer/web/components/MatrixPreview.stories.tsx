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
          'Canvas thumbnail of a pixel matrix frame. No text glyphs — pure pixel blocks.',
          'Colors match `PixelCanvas` (minimum luminance `MIN_L=48` for non-zero values).',
          '',
          '**Usage**',
          '```tsx',
          '<MatrixPreview pixels={frame.pixels} width={9} />',
          '```',
          '',
          'Default size is `width × 3` × `ROWS × 3` (27 × 102 px for a 9-wide matrix).',
          'Pass `displayWidth` / `displayHeight` to override.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    width: { control: 'radio', options: [9, 18], description: 'Matrix width.' },
    displayWidth:  { control: { type: 'range', min: 9,  max: 200, step: 1 }, description: 'CSS display width in px.' },
    displayHeight: { control: { type: 'range', min: 17, max: 400, step: 1 }, description: 'CSS display height in px.' },
  },
  args: { pixels: GRADIENT_9, width: 9 },
} satisfies Meta<typeof MatrixPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Drag the controls to explore dimensions and pixel data. */
export const Playground: Story = {};

/** Column-major gradient, 18-wide matrix. */
export const Wide: Story = {
  args: { pixels: GRADIENT_18, width: 18 },
};

/** All pixels at maximum brightness. */
export const Full: Story = {
  args: { pixels: makePixels(9, () => 255) },
};

/** All pixels off. */
export const Empty: Story = {
  args: { pixels: EMPTY_9 },
};

/** Checkerboard — maximum contrast between adjacent cells. */
export const Checkerboard: Story = {
  args: { pixels: CHECKER_9 },
};

/** Matches the size used in FrameStrip thumbnails. */
export const FrameStripSize: Story = {
  args: { pixels: GRADIENT_9, displayWidth: 36, displayHeight: 68 },
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
