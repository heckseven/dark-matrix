import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { LifeInspector } from './LifeInspector.js';
import type { BiomePreset } from '../types/life-types.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

const BIOME_CONWAY: BiomePreset = {
  name: 'default',
  algorithm: 'conway',
  tickMs: 100,
};

const BIOME_HIGHLIFE: BiomePreset = {
  name: 'highlife run',
  algorithm: 'highlife',
  tickMs: 200,
};

const BIOME_DAYNIGHT: BiomePreset = {
  name: 'day & night',
  algorithm: 'daynight',
  tickMs: 500,
};

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Life/Inspector',
  component: LifeInspector,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Right-pane inspector for a biome preset.',
          '',
          'Controls:',
          '- **algorithm** radio — Conway / HighLife / Day&Night',
          '- **tick speed** slider — 16–1000 ms',
          '- **density** slider — 10–90% (local state, passed to onRandomize)',
          '- **randomize** button — seeds the canvas with random cells at the current density',
          '- **library** button — optional; shown only when `onFromDesign` is provided',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    biome: {
      control: 'object',
      description: 'The biome preset being edited.',
    },
    onChange: {
      control: false,
      description: 'Called with the updated biome whenever algorithm or tick speed changes.',
    },
    onRandomize: {
      control: false,
      description: 'Called with density (0–1) when the randomize button is clicked.',
    },
    onFromDesign: {
      control: false,
      description: 'Optional. When provided, a "library" button appears that opens the design picker.',
    },
  },
  args: {
    biome: BIOME_CONWAY,
    onChange: fn(),
    onRandomize: fn(),
  },
} satisfies Meta<typeof LifeInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ──────────────────────────────────────────────────────────────────

/** All controls active — use the Controls panel to change algorithm, tick speed, and density. */
export const Playground: Story = {};

/** Conway's Life (B3/S23) pre-selected. */
export const ConwaySelected: Story = {
  args: {
    biome: BIOME_CONWAY,
  },
};

/** HighLife (B36/S23) pre-selected. */
export const HighLifeSelected: Story = {
  args: {
    biome: BIOME_HIGHLIFE,
  },
};

/** Day&Night (B3678/S34678) pre-selected. */
export const DayNightSelected: Story = {
  args: {
    biome: BIOME_DAYNIGHT,
  },
};

/** Library button visible — shown because onFromDesign is wired. */
export const WithLibraryButton: Story = {
  args: {
    onFromDesign: fn(),
  },
};
