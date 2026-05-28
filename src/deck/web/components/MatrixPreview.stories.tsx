import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
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

const COLS = 9;

function golStep(grid: Uint8Array): Uint8Array {
  const next = new Uint8Array(grid.length);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      let n = 0;
      for (let dc = -1; dc <= 1; dc++)
        for (let dr = -1; dr <= 1; dr++) {
          if (dc === 0 && dr === 0) continue;
          const nc = (c + dc + COLS) % COLS;
          const nr = (r + dr + ROWS) % ROWS;
          if (grid[nc * ROWS + nr]) n++;
        }
      const alive = (grid[c * ROWS + r] ?? 0) > 0;
      next[c * ROWS + r] = (alive ? n === 2 || n === 3 : n === 3) ? 255 : 0;
    }
  }
  return next;
}

function randomGrid(): Uint8Array {
  const d = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.35 ? 255 : 0;
  return d;
}

function gridToPixels(grid: Uint8Array): string {
  return btoa(String.fromCharCode(...grid));
}

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
          '- `pixels` is base64-encoded column-major data; index as `col * ROWS + row`.',
          '- Canvas is `aria-hidden` — provide context for screen readers at the parent level.',
          '- CSS size is fixed: 43×168 px (9-wide) or 92×168 px (18-wide). It does not respond to layout constraints.',
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

/** Animated — Conway's Game of Life on a 9×34 toroidal grid. */
export const Animated: Story = {
  render: args => {
    const gridRef = useRef(randomGrid());
    const genRef = useRef(0);
    const [pixels, setPixels] = useState(() => gridToPixels(gridRef.current));
    useEffect(() => {
      const id = setInterval(() => {
        gridRef.current = golStep(gridRef.current);
        genRef.current++;
        const pop = gridRef.current.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
        if (pop === 0 || genRef.current > 300) {
          gridRef.current = randomGrid();
          genRef.current = 0;
        }
        setPixels(gridToPixels(gridRef.current));
      }, 150);
      return () => clearInterval(id);
    }, []);
    return <MatrixPreview {...args} pixels={pixels} />;
  },
};
