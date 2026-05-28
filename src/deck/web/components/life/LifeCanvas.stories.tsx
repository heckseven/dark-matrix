import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { LifeCanvas } from '../LifeCanvas.js';
import { deckStore } from '../../store.js';
import type { BiomePreset } from '../../types/life-types.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

const BLANK_9  = btoa(String.fromCharCode(...new Uint8Array(9  * 34)));
const BLANK_18 = btoa(String.fromCharCode(...new Uint8Array(18 * 34)));

const BIOME_9: BiomePreset = {
  name: 'default',
  algorithm: 'conway',
  tickMs: 100,
  gridSnapshot: BLANK_9,
};

const BIOME_18: BiomePreset = {
  name: 'wide',
  algorithm: 'conway',
  tickMs: 100,
  gridSnapshot: BLANK_18,
};

// ── story wrapper ─────────────────────────────────────────────────────────────
//
// LifeCanvas reads zoom from useDeckStore. Set zoom in a useEffect so the
// canvas sizes correctly on first render. Mirrors the PixelCanvas story pattern.

function LifeCanvasStory({
  biome,
  playing,
  generation,
  cols,
  zoom = 1,
  stepForwardCount,
  stepBackCount,
  onGridChange,
  onTick,
}: {
  biome: BiomePreset | null;
  playing: boolean;
  generation: number;
  cols?: 9 | 18;
  zoom?: number;
  stepForwardCount?: number;
  stepBackCount?: number;
  onGridChange: (snapshot: string) => void;
  onTick?: (snapshot: string) => void;
}) {
  useEffect(() => {
    deckStore.setState({ zoom });
  }, [zoom]);

  const extraProps: {
    cols?: 9 | 18;
    stepForwardCount?: number;
    stepBackCount?: number;
    onTick?: (snapshot: string) => void;
  } = {};
  if (cols !== undefined) extraProps.cols = cols;
  if (stepForwardCount !== undefined) extraProps.stepForwardCount = stepForwardCount;
  if (stepBackCount !== undefined) extraProps.stepBackCount = stepBackCount;
  if (onTick !== undefined) extraProps.onTick = onTick;

  return (
    <LifeCanvas
      biome={biome}
      playing={playing}
      generation={generation}
      onGridChange={onGridChange}
      {...extraProps}
    />
  );
}
LifeCanvasStory.displayName = 'LifeCanvas';

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'App/Life/LifeCanvas',
  component: LifeCanvasStory,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Canvas for the Game of Life simulation. Renders a 9×34 or 18×34 LED grid.',
          '',
          '- Left-click to paint cells; right-click or click on a live cell to erase.',
          '- Arrow keys move the keyboard cursor; Space toggles the cell under the cursor.',
          '- `+`/`-` adjust zoom (stored in DeckStore).',
          '- When `playing` is true, mouse painting is disabled.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    biome: {
      control: 'object',
      description: 'Biome preset driving algorithm and tick speed. null renders a blank grid.',
    },
    playing: {
      control: 'boolean',
      description: 'When true the simulation ticks automatically.',
    },
    generation: {
      control: 'number',
      description: 'Incrementing this resets the grid from the biome snapshot.',
    },
    cols: {
      control: 'radio',
      options: [9, 18],
      description: 'Module width — 9 (single) or 18 (dual).',
    },
    zoom: {
      control: 'select',
      options: [0.5, 1, 2, 3, 4],
      description: 'Canvas zoom level (written to DeckStore).',
    },
    stepForwardCount: {
      control: 'number',
      description: 'Increment to step one generation forward (paused only).',
    },
    stepBackCount: {
      control: 'number',
      description: 'Increment to step one generation back from history (paused only).',
    },
    onGridChange: {
      control: false,
      description: 'Called with the encoded snapshot after a mouse paint ends.',
    },
    onTick: {
      control: false,
      description: 'Called with the encoded snapshot after each simulation tick.',
    },
  },
  args: {
    biome: BIOME_9,
    playing: false,
    generation: 0,
    cols: 9,
    zoom: 1,
    stepForwardCount: 0,
    stepBackCount: 0,
    onGridChange: fn(),
    onTick: fn(),
  },
} satisfies Meta<typeof LifeCanvasStory>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ──────────────────────────────────────────────────────────────────

/** Single 9×34 module — all controls available via the Controls panel. */
export const Playground: Story = {};

/** Dual 18×34 module with the inter-module gap visible. */
export const DualModule: Story = {
  args: {
    biome: BIOME_18,
    cols: 18,
  },
};

/** Null biome — renders a blank grid with no algorithm applied. */
export const NullBiome: Story = {
  args: {
    biome: null,
  },
};

/** Simulation playing — canvas ticks at biome.tickMs; painting is disabled. */
export const Playing: Story = {
  args: {
    playing: true,
  },
};
