import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { MatrixItemColumn } from './MatrixItemColumn.js';
import { ROWS } from '../store.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

const COLS = 9;

function makePixels(brightness: number): string {
  const buf = new Uint8Array(COLS * ROWS);
  buf.fill(brightness);
  return btoa(String.fromCharCode(...buf));
}

type Item = { id: string; name: string; pixels: string };

const ITEMS: Item[] = [
  { id: 'a', name: 'alpha',   pixels: makePixels(255) },
  { id: 'b', name: 'beta',    pixels: makePixels(180) },
  { id: 'c', name: 'gamma',   pixels: makePixels(100) },
  { id: 'd', name: 'delta',   pixels: makePixels(40)  },
  { id: 'e', name: 'epsilon', pixels: makePixels(10)  },
];

// ── meta ──────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Components/MatrixItemColumn',
  component: MatrixItemColumn,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Unified column of MatrixItems with shared controls and optional animation.',
          '',
          '- Standard controls (↑↓ move, ⧉ clone, × delete) appear when their callbacks are provided.',
          '- Optional activate (• / ∗) via onActivate + activateLabel/activeLabel.',
          '- Domain-specific extras injected via extraControls(item, idx).',
          '- When animated={true}, calls onTick(tick) before each 100 ms re-render so',
          '  consumers can update pixel refs; getPixels(item, tick) reads from those refs.',
          '- sideAlign/topPadding/bottomPadding align the column with a center preview.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    sideAlign:     { control: 'radio', options: ['start', 'end'], description: 'Push items toward the panel edge nearest the center preview.' },
    topPadding:    { control: 'number', description: 'Pixel offset to align first item bracket with center preview bracket.' },
    bottomPadding: { control: 'number', description: 'Pixel padding at the bottom to clear a toolbar.' },
    animated:      { control: 'boolean', description: 'When true, ticks every 100 ms and calls onTick before re-rendering.' },
    gap:           { control: 'radio', options: ['sm'], description: 'Gap between items.' },
    semantic:      { control: 'boolean', description: 'Render list as <ul>/<li> (true) or <div>s (false).' },
    items:         { control: 'object' },
    activateLabel: { control: 'text' },
    activeLabel:   { control: 'text' },
    addLabel:      { control: 'text', description: 'Label for the add button shown below the list.' },
    emptyText:     { control: 'text' },
    'aria-label':  { control: 'text', description: 'Accessible label for the scroll container.' },
    getPixels:     { control: false },
    getKey:        { control: false },
    getWidth:      { control: false, description: 'Returns the LED column width (9 or 18) for each item. Defaults to 9 when omitted.' },
    getName:       { control: false },
    getAriaLabel:  { control: false },
    isSelected:    { control: false },
    isActive:      { control: false },
    onSelect:      { control: false },
    onMove:        { control: false },
    onInsert:      { control: false },
    insertLabel:   { control: false, description: 'Returns the accessible label for the gap-zone insert button at a given afterIdx.' },
    onDelete:      { control: false },
    onDuplicate:   { control: false },
    onRename:      { control: false },
    onAdd:         { control: false },
    onActivate:    { control: false },
    extraControls: { control: false },
    onTick:        { control: false },
  },
  args: {
    items: ITEMS,
    getKey:       (item: Item) => item.id,
    getPixels:    (item: Item) => item.pixels,
    getName:      (item: Item) => item.name,
    getAriaLabel: (item: Item, isActive: boolean) => isActive ? `${item.name} (active)` : item.name,
    isSelected:   (item: Item, _idx: number) => item.id === 'b',
    isActive:     (item: Item, _idx: number) => item.id === 'a',
    onSelect:     fn(),
    onMove:       fn(),
    onInsert:     fn(),
    onDelete:     fn(),
    onDuplicate:  fn(),
    onRename:     fn(),
    onAdd:        fn(),
    onActivate:   fn(),
    activateLabel: 'Set as active',
    activeLabel:   'Active',
    addLabel:      'Add item',
    emptyText:     'no items',
    'aria-label':  'Items',
  },
} satisfies Meta<typeof MatrixItemColumn<Item>>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ───────────────────────────────────────────────────────────────────

/** Full set of controls: move, activate, clone, delete, rename. */
export const Playground: Story = {};

/** Left-pane layout — items flush to the right edge (closest to center preview). */
export const SideAlignEnd: Story = {
  args: { sideAlign: 'end' },
};

/** Right-pane layout — items flush to the left edge (closest to center preview). */
export const SideAlignStart: Story = {
  args: { sideAlign: 'start' },
};

/** Single item — delete button is hidden (requires at least two items to delete). */
export const SingleItem: Story = {
  args: {
    items: [ITEMS[0]!],
  },
};

/** Empty state. */
export const Empty: Story = {
  args: { items: [] },
};
