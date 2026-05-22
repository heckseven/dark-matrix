import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { BiomeList } from './BiomeList.js';
import type { BiomePreset } from '../types/life-types.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

const BLANK_9 = btoa(String.fromCharCode(...new Uint8Array(9 * 34)));

const BIOME_A: BiomePreset = { name: 'alpha',   algorithm: 'conway',   tickMs: 100, gridSnapshot: BLANK_9 };
const BIOME_B: BiomePreset = { name: 'beta',    algorithm: 'highlife', tickMs: 200 };
const BIOME_C: BiomePreset = { name: 'gamma',   algorithm: 'daynight', tickMs: 500 };
const BIOME_D: BiomePreset = { name: 'delta',   algorithm: 'conway',   tickMs: 80  };
const BIOME_E: BiomePreset = { name: 'epsilon', algorithm: 'highlife', tickMs: 150 };

const ALL_BIOMES = [BIOME_A, BIOME_B, BIOME_C, BIOME_D, BIOME_E];

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Life/BiomeList',
  component: BiomeList,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Left-pane scrollable list of biome presets.',
          '',
          '- Each card shows a MatrixPreview thumbnail, algorithm badge, and action buttons.',
          '- Drag the thumbnail to reorder; ↑/↓ buttons for keyboard reorder.',
          '- • sets active; ∗ marks the active biome; ⧉ duplicates; × deletes (disabled when only one biome).',
          '- GapZone between cards provides an insert button.',
          '- Double-click the name to inline-rename.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    biomes: {
      control: 'object',
      description: 'Ordered array of biome presets to display.',
    },
    activeName: {
      control: 'text',
      description: 'Name of the currently active (running) biome.',
    },
    selectedName: {
      control: 'text',
      description: 'Name of the currently selected (inspector-shown) biome.',
    },
    onSelect:    { control: false, description: 'Called with name when a card is clicked.' },
    onActivate:  { control: false, description: 'Called with name when • is clicked.' },
    onCreate:    { control: false, description: 'Called when the + button at the bottom is clicked.' },
    onInsert:    { control: false, description: 'Called with afterIdx when a GapZone + is clicked.' },
    onDelete:    { control: false, description: 'Called with name when × is clicked.' },
    onDuplicate: { control: false, description: 'Called with name when ⧉ is clicked.' },
    onRename:    { control: false, description: 'Called with (oldName, newName) after inline rename.' },
    onMove:      { control: false, description: 'Called with (fromIdx, toIdx) for drag-reorder or ↑/↓.' },
  },
  args: {
    biomes: ALL_BIOMES,
    activeName: 'alpha',
    selectedName: 'beta',
    onSelect:    fn(),
    onActivate:  fn(),
    onCreate:    fn(),
    onInsert:    fn(),
    onDelete:    fn(),
    onDuplicate: fn(),
    onRename:    fn(),
    onMove:      fn(),
  },
} satisfies Meta<typeof BiomeList>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ──────────────────────────────────────────────────────────────────

/** Multiple biomes, one active, one selected — full controls available. */
export const Playground: Story = {};

/** No biomes — shows the empty message and the + button. */
export const Empty: Story = {
  args: {
    biomes: [],
    activeName: null,
    selectedName: null,
  },
};

/** Single biome, both active and selected. × button is hidden (only one item). */
export const WithActive: Story = {
  args: {
    biomes: [BIOME_A],
    activeName: 'alpha',
    selectedName: 'alpha',
  },
};

/** Several biomes with distinct active and selected states. */
export const MultipleWithActive: Story = {
  args: {
    biomes: [BIOME_A, BIOME_B, BIOME_C],
    activeName: 'alpha',
    selectedName: 'gamma',
  },
};
