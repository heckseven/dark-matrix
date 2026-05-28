import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { MatrixItemList } from './MatrixItemList.js';
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

const PX = [
  makePixels(9, () => 255),
  makePixels(9, (c, r) => (c + r) % 2 === 0 ? 255 : 0),
  makePixels(9, (_, r) => r % 4 < 2 ? 255 : 0),
  makePixels(9, (c, r) => c % 3 === 0 || r % 4 === 0 ? 255 : 0),
  makePixels(9, c => c % 2 === 0 ? 255 : 0),
];

type Item = { id: string; label: string; pixels: string };

const INITIAL: Item[] = [
  { id: 'a', label: 'alpha',   pixels: PX[0]! },
  { id: 'b', label: 'bravo',   pixels: PX[1]! },
  { id: 'c', label: 'charlie', pixels: PX[2]! },
  { id: 'd', label: 'delta',   pixels: PX[3]! },
];

function freshItem(n: number): Item {
  return { id: `item-${n}-${Date.now()}`, label: `item-${n + 1}`, pixels: PX[n % PX.length]! };
}

function moveArr<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

// ── layout helper ─────────────────────────────────────────────────────────────

function Shell({ height = 480, children }: { height?: number; children: ReactNode }) {
  return <div style={{ height, display: 'flex', flexDirection: 'column' }}>{children}</div>;
}

// ── meta ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const meta: Meta<any> = {
  title: 'Components/MatrixItemList',
  tags: ['autodocs'],
  argTypes: {
    items:         { control: false,     description: 'The list data array.' },
    getKey:        { control: false,     description: 'Returns a stable React key for each item.' },
    renderItem:    { control: false,     description: 'Render prop — receives (item, idx, { dragIdx, onDragOver, onDrop }).' },
    onMove:        { control: false,     description: 'Called with (from, to) when a drag or button-initiated move completes.' },
    onInsert:      { control: false,     description: 'When provided, GapZone insert buttons appear between items.' },
    insertLabel:   { control: false,     description: 'Callback returning the insert button label for a given afterIdx.' },
    onAdd:         { control: false,     description: 'When provided, a + button renders below the list.' },
    addLabel:      { control: 'text',    description: 'Accessible label for the add button. Include a noun ("Add preset").' },
    emptyText:     { control: 'text',    description: 'Placeholder shown when items is empty.' },
    'aria-label':  { control: 'text',    description: 'Accessible label for the list container.' },
    semantic:      { control: 'boolean', description: 'true = ul/li (default); false = div/div with role="list"/"listitem".' },
    gap:           { control: 'radio',   options: ['sm'], description: 'Gap between items.' },
    topPadding:    { control: 'number',  description: 'Pixel padding above the scroll container.' },
    bottomPadding: { control: 'number',  description: 'Pixel padding below the scroll container.' },
    sideAlign:     { control: 'radio',   options: ['start', 'end'], description: 'Push items toward the panel edge nearest the center preview. Use "end" for left pane, "start" for right pane.' },
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'Generic scrollable list of matrix items with drag-to-reorder, gap-zone insert, and an add button.',
          '',
          '**renderItem:** render prop receives `(item, idx, { dragIdx, onDragOver, onDrop })` — pass drag props to `MatrixItem` to enable reordering.',
          '**gap:** `sm` (gap-2, default).',
          '**semantic:** `true` renders `ul/li` (default); `false` renders `div/div`.',
        ].join('\n'),
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// ── stories ───────────────────────────────────────────────────────────────────

/**
 * Drag to reorder, use ↑↓ buttons, hover between items to insert, or hit + to
 * add at the bottom.
 */
export const Playground: Story = {
  render: () => {
    const [items, setItems] = useState<Item[]>(INITIAL);
    const [selected, setSelected] = useState<string | null>(INITIAL[0]!.id);
    return (
      <Shell>
        <MatrixItemList
          items={items}
          getKey={item => item.id}
          renderItem={(item, idx, dragProps) => (
            <MatrixItem
              name={item.label}
              aria-label={item.label}
              width={9}
              pixels={item.pixels}
              isSelected={item.id === selected}
              onSelect={() => setSelected(item.id)}
              dragIdx={dragProps.dragIdx}
              onDragOver={dragProps.onDragOver}
              onDrop={dragProps.onDrop}
              controlsTop={
                <>
                  <Button variant="ghost" className="w-8" aria-label="Move up" tooltip="Move up" tooltipSide="right"
                    disabled={idx === 0}
                    onClick={e => { e.stopPropagation(); setItems(m => moveArr(m, idx, idx - 1)); }}
                  >↑</Button>
                  <Button variant="ghost" className="w-8" aria-label="Move down" tooltip="Move down" tooltipSide="right"
                    disabled={idx === items.length - 1}
                    onClick={e => { e.stopPropagation(); setItems(m => moveArr(m, idx, idx + 1)); }}
                  >↓</Button>
                </>
              }
              controlsBottom={
                items.length > 1
                  ? <Button variant="ghost" className="w-8" aria-label="Delete" tooltip="Delete" tooltipSide="right"
                      onClick={e => { e.stopPropagation(); setItems(m => m.filter((_, i) => i !== idx)); }}
                    >×</Button>
                  : null
              }
            />
          )}
          onMove={(from, to) => setItems(m => moveArr(m, from, to))}
          onInsert={afterIdx => setItems(m => {
            const next = [...m];
            next.splice(afterIdx + 1, 0, freshItem(m.length));
            return next;
          })}
          onAdd={() => setItems(m => [...m, freshItem(m.length)])}
          addLabel="Add item"
          emptyText="no items"
          aria-label="Demo list"
        />
      </Shell>
    );
  },
};

/** emptyText is shown when the list has no items. Hit + to add the first one. */
export const Empty: Story = {
  render: () => {
    const [items, setItems] = useState<Item[]>([]);
    return (
      <Shell>
        <MatrixItemList
          items={items}
          getKey={item => item.id}
          renderItem={(item, idx, dragProps) => (
            <MatrixItem
              name={item.label}
              aria-label={item.label}
              width={9}
              pixels={item.pixels}
              dragIdx={dragProps.dragIdx}
              onDragOver={dragProps.onDragOver}
              onDrop={dragProps.onDrop}
            />
          )}
          onMove={() => {}}
          onAdd={() => setItems(m => [...m, freshItem(m.length)])}
          addLabel="Add item"
          emptyText="no items — add one below"
          aria-label="Empty list"
        />
      </Shell>
    );
  },
};

/** renderItem ignores dragProps; no onInsert → GapZone buttons are hidden. */
export const NoDrag: Story = {
  render: () => (
    <Shell>
      <MatrixItemList
        items={INITIAL}
        getKey={item => item.id}
        renderItem={item => (
          <MatrixItem
            name={item.label}
            aria-label={item.label}
            width={9}
            pixels={item.pixels}
          />
        )}
        onMove={() => {}}
        aria-label="Read-only list"
      />
    </Shell>
  ),
};

/**
 * sideAlign="end" — items hug the right side of the container.
 * Use in a left pane so items sit flush against the center preview column.
 * The column shrinks to the widest item; GapZone dividers still fill the
 * column width.
 */
export const SideAlignEnd: Story = {
  render: () => {
    const [items, setItems] = useState<Item[]>(INITIAL);
    const [selected, setSelected] = useState<string | null>(INITIAL[0]!.id);
    return (
      <Shell>
        <MatrixItemList
          items={items}
          getKey={item => item.id}
          renderItem={(item, idx, dragProps) => (
            <MatrixItem
              name={item.label}
              aria-label={item.label}
              width={9}
              pixels={item.pixels}
              isSelected={item.id === selected}
              onSelect={() => setSelected(item.id)}
              dragIdx={dragProps.dragIdx}
              onDragOver={dragProps.onDragOver}
              onDrop={dragProps.onDrop}
              controlsTop={
                <>
                  <Button variant="ghost" className="w-8" aria-label="Move up" tooltip="Move up" tooltipSide="right"
                    disabled={idx === 0}
                    onClick={e => { e.stopPropagation(); setItems(m => moveArr(m, idx, idx - 1)); }}
                  >↑</Button>
                  <Button variant="ghost" className="w-8" aria-label="Move down" tooltip="Move down" tooltipSide="right"
                    disabled={idx === items.length - 1}
                    onClick={e => { e.stopPropagation(); setItems(m => moveArr(m, idx, idx + 1)); }}
                  >↓</Button>
                </>
              }
            />
          )}
          onMove={(from, to) => setItems(m => moveArr(m, from, to))}
          onInsert={afterIdx => setItems(m => {
            const next = [...m];
            next.splice(afterIdx + 1, 0, freshItem(m.length));
            return next;
          })}
          onAdd={() => setItems(m => [...m, freshItem(m.length)])}
          addLabel="Add item"
          sideAlign="end"
          aria-label="Right-aligned list"
        />
      </Shell>
    );
  },
};

/**
 * sideAlign="start" — items hug the left side of the container.
 * Use in a right pane so items sit flush against the center preview column.
 */
export const SideAlignStart: Story = {
  render: () => {
    const [items, setItems] = useState<Item[]>(INITIAL);
    const [selected, setSelected] = useState<string | null>(INITIAL[0]!.id);
    return (
      <Shell>
        <MatrixItemList
          items={items}
          getKey={item => item.id}
          renderItem={(item, idx, dragProps) => (
            <MatrixItem
              name={item.label}
              aria-label={item.label}
              width={9}
              pixels={item.pixels}
              isSelected={item.id === selected}
              onSelect={() => setSelected(item.id)}
              dragIdx={dragProps.dragIdx}
              onDragOver={dragProps.onDragOver}
              onDrop={dragProps.onDrop}
              controlsTop={
                <>
                  <Button variant="ghost" className="w-8" aria-label="Move up" tooltip="Move up" tooltipSide="right"
                    disabled={idx === 0}
                    onClick={e => { e.stopPropagation(); setItems(m => moveArr(m, idx, idx - 1)); }}
                  >↑</Button>
                  <Button variant="ghost" className="w-8" aria-label="Move down" tooltip="Move down" tooltipSide="right"
                    disabled={idx === items.length - 1}
                    onClick={e => { e.stopPropagation(); setItems(m => moveArr(m, idx, idx + 1)); }}
                  >↓</Button>
                </>
              }
            />
          )}
          onMove={(from, to) => setItems(m => moveArr(m, from, to))}
          onInsert={afterIdx => setItems(m => {
            const next = [...m];
            next.splice(afterIdx + 1, 0, freshItem(m.length));
            return next;
          })}
          onAdd={() => setItems(m => [...m, freshItem(m.length)])}
          addLabel="Add item"
          sideAlign="start"
          aria-label="Left-aligned list"
        />
      </Shell>
    );
  },
};

