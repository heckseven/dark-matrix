import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { MatrixItem } from './MatrixItem.js';
import { Button } from './ui/button.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

const ROWS = 34;

function makePixels(width: 9 | 18, fill: (col: number, row: number) => number): string {
  const data = new Uint8Array(width * ROWS);
  for (let col = 0; col < width; col++)
    for (let row = 0; row < ROWS; row++)
      data[col * ROWS + row] = fill(col, row);
  return btoa(String.fromCharCode(...data));
}

const BLANK_9   = makePixels(9,  () => 0);
const SOLID_9   = makePixels(9,  () => 255);
const CHECKER_9 = makePixels(9,  (c, r) => (c + r) % 2 === 0 ? 255 : 0);
const SOLID_18  = makePixels(18, () => 255);
const BARS_18   = makePixels(18, (c, r) => r % 4 < 2 ? 255 : c % 3 === 0 ? 180 : 0);

const CONTROLS_TOP = (
  <>
    <Button variant="ghost" className="w-8" aria-label="Move up" tooltip="Move up" tooltipSide="right">↑</Button>
    <Button variant="ghost" className="w-8" aria-label="Move down" tooltip="Move down" tooltipSide="right">↓</Button>
  </>
);

const CONTROLS_BOTTOM = (
  <>
    <Button variant="ghost" className="w-8" aria-label="Set as default" tooltip="Set as default" tooltipSide="right">•</Button>
    <Button variant="ghost" className="w-8" aria-label="Clone" tooltip="Clone" tooltipSide="right">⧉</Button>
    <Button variant="ghost" className="w-8" aria-label="Delete" tooltip="Delete" tooltipSide="right">×</Button>
  </>
);

// ── meta ──────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Components/MatrixItem',
  component: MatrixItem,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Shared card component for any list of named matrix items.',
          '',
          '**Layout:** MatrixPreview on the left, two optional control slots (top-aligned and bottom-aligned) on the right, optional name row below.',
          '',
          '**Controls slots:** render props — pass whatever buttons apply to the context.',
          '**Rename:** double-click the name when `onRename` is provided.',
          '**Drag:** enabled when `dragIdx` is provided; preview becomes the drag handle.',
          '**Preview click:** when `onPreviewClick` is provided, the preview renders as a button (e.g. "open in editor").',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    name:            { control: 'text',    description: 'Display name shown below the preview. Omit to hide the name row.' },
    'aria-label':    { control: 'text',    description: 'Accessible label for the card container.' },
    width:           { control: 'radio',   options: [9, 18], description: 'Preview width in LED columns.' },
    pixels:          { control: false,     description: 'Base64-encoded pixel frame data.' },
    isActive:        { control: 'boolean', description: 'Item is the live/default item on hardware.' },
    isSelected:      { control: 'boolean', description: 'Item is currently selected in the UI.' },
    onSelect:        { control: false,     description: 'Called when the container is clicked or activated via keyboard.' },
    onPreviewClick:  { control: false,     description: 'When provided, the preview renders as a button with this handler.' },
    onRename:        { control: false,     description: 'When provided, the name is double-click editable.' },
    controlsTop:     { control: false,     description: 'Top-aligned slot in the controls column.' },
    controlsBottom:  { control: false,     description: 'Bottom-aligned slot in the controls column.' },
    dragIdx:         { control: 'number',  description: 'This item\'s index; enables drag-to-reorder when set.' },
    onDragOver:      { control: false,     description: 'Called with the current insert position (or null) during drag.' },
    onDrop:          { control: false,     description: 'Called with (from, to) when a drag completes.' },
  },
  args: {
    name: 'my preset',
    'aria-label': 'my preset',
    width: 18,
    pixels: SOLID_18,
    isActive: false,
    isSelected: false,
    onSelect: fn(),
    onRename: fn(),
    onDrop: fn(),
    onDragOver: fn(),
    controlsTop: CONTROLS_TOP,
    controlsBottom: CONTROLS_BOTTOM,
  },
} satisfies Meta<typeof MatrixItem>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ───────────────────────────────────────────────────────────────────

/** Full controls — adjust all args in the Controls panel. */
export const Playground: Story = {};

/** Neither active nor selected — corners appear on hover only. */
export const Idle: Story = {
  args: { isActive: false, isSelected: false },
};

/** Selected in the UI — bright corner brackets. */
export const Selected: Story = {
  args: { isSelected: true },
};

/** Active on hardware — corners bright plus the ∗ button filled. */
export const Active: Story = {
  args: {
    isActive: true,
    controlsBottom: (
      <>
        <Button variant="primary" className="w-8" aria-label="Default preset" tooltip="Default preset" tooltipSide="right">∗</Button>
        <Button variant="ghost"   className="w-8" aria-label="Clone"          tooltip="Clone"          tooltipSide="right">⧉</Button>
        <Button variant="ghost"   className="w-8" aria-label="Delete"         tooltip="Delete"         tooltipSide="right">×</Button>
      </>
    ),
  },
};

/** Both active and selected simultaneously. */
export const ActiveAndSelected: Story = {
  args: { isActive: true, isSelected: true },
};

/** No controls — name and preview only. */
export const NameOnly: Story = {
  args: { controlsTop: undefined, controlsBottom: undefined, width: 9, pixels: CHECKER_9 },
};

/** No name — frame-strip style (unnamed cells). */
export const NoName: Story = {
  render: ({ controlsTop, controlsBottom }) => (
    <MatrixItem
      aria-label="Frame 1"
      width={9}
      pixels={SOLID_9}
      isSelected
      onSelect={fn()}
      controlsTop={controlsTop}
      controlsBottom={controlsBottom}
    />
  ),
};

/** Double-click the name to rename (onRename is wired). */
export const Renameable: Story = {
  args: { name: 'double-click me', 'aria-label': 'double-click me', pixels: BLANK_9, width: 9, controlsTop: undefined, controlsBottom: undefined },
};

/** Preview renders as a button (asset-manager style — no drag, no onSelect). */
export const PreviewClickable: Story = {
  render: () => (
    <MatrixItem
      name="my-asset"
      aria-label="my-asset"
      width={9}
      pixels={CHECKER_9}
      onPreviewClick={fn()}
      controlsTop={
        <Button variant="ghost" className="w-8" aria-label="Duplicate" tooltip="Duplicate" tooltipSide="right">⎘</Button>
      }
      controlsBottom={
        <Button variant="ghost" className="w-8" aria-label="Delete" tooltip="Delete" tooltipSide="right">×</Button>
      }
    />
  ),
};

/** Dual-module (18-column) preview. */
export const DualModule: Story = {
  args: { width: 18, pixels: SOLID_18 },
};
