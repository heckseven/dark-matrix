import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { ThreePanelLayout } from './ThreePanelLayout.js';

const Panel = ({ label }: { label: string }) => (
  <div className="h-full font-mono text-xs text-muted-foreground flex items-center justify-center bg-foreground/5">
    {label}
  </div>
);

const meta = {
  title: 'Layout/ThreePanelLayout',
  component: ThreePanelLayout,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Three-column CSS grid with semantic `<aside>/<main>/<aside>`. Used in HudPanel, LifePanel, and design mode.',
      },
    },
  },
  argTypes: {
    columns:       { control: 'text',    description: 'CSS gridTemplateColumns value.' },
    gap:           { control: 'text',    description: 'Gap between columns.' },
    leftLabel:     { control: 'text',    description: 'aria-label for the left aside.' },
    centerLabel:   { control: 'text',    description: 'aria-label for the main.' },
    rightLabel:    { control: 'text',    description: 'aria-label for the right aside.' },
    leftClassName: { control: 'text',    description: 'className for the left aside.' },
    centerClassName: { control: 'text', description: 'className for the center section.' },
    rightClassName: { control: 'text',  description: 'className for the right aside.' },
    leftStyle:   { control: false, description: 'Inline style for the left aside. Use for dynamic values like paddingTop.' },
    centerStyle: { control: false, description: 'Inline style for the center section.' },
    rightStyle:  { control: false, description: 'Inline style for the right aside. Use for dynamic values like paddingTop.' },
    centerRef: { control: false },
    left:   { control: false },
    center: { control: false },
    right:  { control: false },
  },
  args: {
    leftLabel:   'Left panel',
    centerLabel: 'Center panel',
    rightLabel:  'Right panel',
    left:   <Panel label="left" />,
    center: <Panel label="center" />,
    right:  <Panel label="right" />,
  },
  decorators: [Story => <div style={{ height: 300 }}><Story /></div>],
} satisfies Meta<typeof ThreePanelLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full controls. */
export const Playground: Story = {};

/** Fixed-width side columns, fluid center — LifePanel style. */
export const FixedSideColumns: Story = {
  args: { columns: 'minmax(0,220px) 1fr minmax(0,220px)' },
};

/** Column gap — HudPanel style. */
export const WithGap: Story = {
  args: { gap: '1rem' },
};

/** Scrollable center — design mode style. */
export const ScrollableCenter: Story = {
  args: {
    centerClassName: 'overflow-y-auto px-10',
    center: (
      <div>
        {Array.from({ length: 20 }, (_, i) => (
          <p key={i} className="font-mono text-xs text-muted-foreground py-2">row {i + 1}</p>
        ))}
      </div>
    ),
  },
};
