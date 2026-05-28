import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip, TooltipContent } from './tooltip.js';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Button } from './button.js';

function TooltipDemo({
  content,
  side,
  delayDuration,
}: {
  content: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  delayDuration: number;
}) {
  return (
    <Tooltip content={content} side={side} delayDuration={delayDuration}>
      <Button>hover me</Button>
    </Tooltip>
  );
}

const meta = {
  title: 'Components/Tooltip',
  component: TooltipDemo,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Hover label powered by `@radix-ui/react-tooltip`. Requires `TooltipProvider` in the tree (present in `App` and the Storybook decorator).',
          '',
          '**Usage**',
          '- Prefer the `tooltip` prop on `Button` over wrapping with `Tooltip` directly.',
          '- Always pair with `aria-label` on the trigger when the visible label does not describe the action.',
          '- Tooltips do not appear on disabled elements.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    content: { control: 'text', description: 'Tooltip label.' },
    side: {
      control: 'select',
      options: ['top', 'right', 'bottom', 'left'],
      description: 'Preferred side. Flips automatically if there is no room.',
    },
    delayDuration: {
      control: { type: 'range', min: 0, max: 1000, step: 50 },
      description: 'Hover delay in ms before the tooltip appears.',
    },
  },
  args: { content: 'Tooltip label', side: 'top', delayDuration: 400 },
} satisfies Meta<typeof TooltipDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Adjust content, side, and delay via controls. */
export const Playground: Story = {};

/** Each button is positioned so its intended side has clear room. */
export const Sides: Story = {
  render: () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      gridTemplateRows: '1fr auto 1fr',
      gap: 32,
      padding: 48,
      placeItems: 'center',
      minWidth: 280,
      minHeight: 200,
    }}>
      <span /><Tooltip content="top" side="top" delayDuration={0}><Button>top</Button></Tooltip><span />
      <Tooltip content="left" side="left" delayDuration={0}><Button>left</Button></Tooltip>
      <span />
      <Tooltip content="right" side="right" delayDuration={0}><Button>right</Button></Tooltip>
      <span /><Tooltip content="bottom" side="bottom" delayDuration={0}><Button>bottom</Button></Tooltip><span />
    </div>
  ),
};

/** Primary use-case: icon-only button with no visible label. */
export const IconButton: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button tooltip="Add frame" aria-label="Add frame" variant="ghost">+</Button>
      <Button tooltip="Delete frame" aria-label="Delete frame" variant="ghost">×</Button>
      <Button tooltip="Undo" aria-label="Undo" variant="ghost">↩</Button>
      <Button tooltip="Redo" aria-label="Redo" variant="ghost">↪</Button>
    </div>
  ),
};

/** Zero delay — tooltip appears immediately on hover. */
export const Instant: Story = {
  args: { content: 'No delay', delayDuration: 0 },
};

/** Custom content: use `TooltipContent` directly for non-string labels. */
export const CustomContent: Story = {
  render: () => (
    <TooltipPrimitive.Root delayDuration={0}>
      <TooltipPrimitive.Trigger asChild>
        <Button>custom</Button>
      </TooltipPrimitive.Trigger>
      <TooltipContent>
        <span className="font-mono text-xs">
          <span className="text-muted-foreground">value</span> 128
        </span>
      </TooltipContent>
    </TooltipPrimitive.Root>
  ),
};
