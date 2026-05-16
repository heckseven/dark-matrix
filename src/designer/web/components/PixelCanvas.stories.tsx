import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent } from 'storybook/test';
import { PixelCanvas } from './PixelCanvas';
import { designerStore } from '../store.js';

const ROWS = 34;

function blankPixels(width: number) {
  return btoa(String.fromCharCode(...new Uint8Array(width * ROWS)));
}

function resetStore(width: 9 | 18) {
  designerStore.getState().loadProject({
    frames: [{ delayMs: 100, pixels: blankPixels(width) }],
    width,
    mode: 'bw',
    loop: true,
  });
}

function seedPixels(width: 9 | 18, pattern: 'blank' | 'checker' | 'gradient') {
  if (pattern === 'blank') { resetStore(width); return; }
  const buf = new Uint8Array(width * ROWS);
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (pattern === 'checker') buf[c * ROWS + r] = (c + r) % 2 === 0 ? 255 : 0;
      if (pattern === 'gradient') buf[c * ROWS + r] = Math.round((c / (width - 1)) * 255);
    }
  }
  designerStore.getState().loadProject({
    frames: [{ delayMs: 100, pixels: btoa(String.fromCharCode(...buf)) }],
    width,
    mode: 'bw',
    loop: true,
  });
}

function PixelCanvasStory({ width, pattern, zoom = 1 }: { width: 9 | 18; pattern: 'blank' | 'checker' | 'gradient'; zoom?: number }) {
  useEffect(() => {
    seedPixels(width, pattern);
    designerStore.setState({ zoom });
  }, [width, pattern, zoom]);
  return <PixelCanvas />;
}
PixelCanvasStory.displayName = 'PixelCanvas';

const meta = {
  title: 'App/Design/PixelCanvas',
  component: PixelCanvasStory,
  tags: [],
  parameters: {
    docs: {
      description: {
        component: [
          'Pixel-editing canvas for LED matrix frames. Left-click to paint, right-click to erase.',
          '',
          '**Keyboard shortcuts** (when focused)',
          '- `←` `→` `↑` `↓` — move cursor',
          '- `Space` — paint at cursor',
          '- `←` / `→` at boundary — previous / next frame',
          '- `n` — add frame after current',
          '- `Ctrl+Z` — undo',
          '- `Ctrl+Y` / `Ctrl+Shift+Z` — redo',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    width: {
      control: 'radio',
      options: [9, 18],
      description: 'Module width — 9 (single) or 18 (dual, with gap).',
    },
    pattern: {
      control: 'select',
      options: ['blank', 'checker', 'gradient'],
      description: 'Initial pixel pattern for the story.',
    },
    zoom: {
      control: 'select',
      options: [0.5, 1, 2, 3, 4],
      description: 'Canvas zoom level.',
    },
  },
  args: { width: 9, pattern: 'blank', zoom: 1 },
} satisfies Meta<typeof PixelCanvasStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Single 9×34 module. Paint with left-click, erase with right-click. */
export const Playground: Story = {};

/** Dual 18×34 module with the inter-module gap visible. */
export const DualModule: Story = {
  args: { width: 18 },
};

/** Checkerboard fill — confirms per-pixel addressing. */
export const Checkerboard: Story = {
  args: { pattern: 'checker' },
};

/** Horizontal gradient — confirms grayscale value rendering. */
export const Gradient: Story = {
  args: { pattern: 'gradient' },
};

/** Canvas at 50% — all pixels visible, cells are half the default size. */
export const ZoomedOut: Story = {
  args: { zoom: 0.5, pattern: 'checker' },
};

/** Canvas at 400% — large cells; confirms scaling math at the upper bound. */
export const ZoomedIn: Story = {
  args: { zoom: 4, pattern: 'gradient' },
};

/** Ctrl+Z undoes a painted pixel; Ctrl+Y redoes it. */
export const UndoRedo: Story = {
  beforeEach: () => resetStore(9),
  play: async ({ canvasElement }) => {
    const container = canvasElement.querySelector('[tabindex="0"]') as HTMLElement;

    const before = designerStore.getState().frames[0]!.pixels;
    designerStore.getState().setPixel(0, 0, 0, 255);
    const painted = designerStore.getState().frames[0]!.pixels;
    await expect(painted).not.toBe(before);

    container.focus();
    await userEvent.keyboard('{Control>}z{/Control}');
    await expect(designerStore.getState().frames[0]!.pixels).toBe(before);

    await userEvent.keyboard('{Control>}y{/Control}');
    await expect(designerStore.getState().frames[0]!.pixels).toBe(painted);
  },
};
