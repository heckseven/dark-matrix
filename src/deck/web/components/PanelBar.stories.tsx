import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { PanelBar } from './PanelBar.js';

const Slot = ({ label }: { label: string }) => (
  <span className="font-mono text-xs text-muted-foreground px-1">{label}</span>
);

const meta = {
  title: 'Components/PanelBar',
  component: PanelBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Blur-background toolbar with `[flex-1 left][shrink-0 center][flex-1 right]` slots. Used in modal headers, App.tsx main header, and dialog titlebars.',
      },
    },
  },
  argTypes: {
    as:     { control: 'radio',    options: ['div', 'header'], description: 'Rendered element.' },
    sticky: { control: 'boolean',  description: 'Adds sticky top-0 z-10.' },
    blur:   { control: 'boolean',  description: 'Backdrop blur + dark fill.' },
    border: { control: 'boolean',  description: 'Bottom border.' },
    className: { control: 'text',   description: 'Extra classes merged onto the root element.' },
    style:     { control: false,   description: 'Inline style override — use to apply custom backdrop-filter or background.' },
    left:      { control: false },
    center:    { control: false },
    right:     { control: false },
  },
  args: {
    left:   <Slot label="left" />,
    center: <Slot label="center" />,
    right:  <Slot label="right" />,
    className: 'px-3 py-2',
  },
  decorators: [Story => (
    <div style={{ height: 200, background: 'linear-gradient(135deg, #111 0%, #1a1a2e 100%)' }}>
      <Story />
    </div>
  )],
} satisfies Meta<typeof PanelBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full controls. */
export const Playground: Story = {};

/** Blur off with bottom border — dialog/modal header style. */
export const DialogHeader: Story = {
  args: {
    blur: false,
    border: true,
    left: <span className="font-mono text-xs text-muted-foreground px-1">‹ back</span>,
    center: <span className="font-mono text-xs text-foreground">modal title</span>,
  },
};

/** Blur on, no border — floating app header style. */
export const FloatingHeader: Story = {
  args: {
    left: <span className="font-mono text-xs text-foreground">◫</span>,
    center: <span className="font-mono text-xs text-foreground">project name</span>,
    right: <span className="font-mono text-xs text-muted-foreground px-1">save</span>,
  },
};

/** Center slot omitted — left and right only. */
export const NoCenterSlot: Story = {
  args: { center: undefined },
};
