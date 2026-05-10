import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { userEvent, expect, within } from 'storybook/test';
import { ShortcutDialog } from './shortcut-dialog.js';
import { Button } from './button.js';

const suppressFocusTrap = { a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } } };

function ShortcutDialogDemo({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <Button variant="ghost" aria-label="Keyboard shortcuts" onClick={() => setOpen(true)}>
        <span aria-hidden="true">???</span>
      </Button>
      <ShortcutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

const meta = {
  title: 'Components/ShortcutDialog',
  component: ShortcutDialogDemo,
  tags: [],
  parameters: { layout: 'centered' },
  argTypes: {
    defaultOpen: { control: 'boolean', description: 'Initial open state.' },
  },
  args: { defaultOpen: false },
} satisfies Meta<typeof ShortcutDialogDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Trigger visible; dialog closed. */
export const Playground: Story = {};

/** Dialog pre-opened showing the full two-column shortcut reference. */
export const Open: Story = {
  args: { defaultOpen: true },
  parameters: suppressFocusTrap,
};

/** Opens via trigger click; confirms both column headers and shortcut rows render. */
export const OpenViaClick: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Keyboard shortcuts' }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText('canvas')).toBeInTheDocument();
    await expect(body.getByText('project')).toBeInTheDocument();
    await expect(body.getByText('draw / erase')).toBeInTheDocument();
    await expect(body.getByText('add frame')).toBeInTheDocument();
  },
};
