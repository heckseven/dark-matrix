import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn, userEvent, expect, within } from 'storybook/test';
import { Button } from './button.js';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from './dialog.js';

const suppressRadixTriggerHidden = { a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } } };

interface ConfirmArgs {
  onConfirm: () => void;
  onCancel: () => void;
}

function DefaultDialog({ onConfirm, onCancel }: ConfirmArgs) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default">open dialog</Button>
      </DialogTrigger>
      <DialogContent className="flex flex-col gap-3 w-64">
        <DialogTitle>confirm action</DialogTitle>
        <DialogDescription>This action cannot be undone.</DialogDescription>
        <div className="flex gap-2 justify-end">
          <DialogClose asChild>
            <Button variant="ghost" autoFocus onClick={onCancel}>cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="default" onClick={onConfirm}>confirm</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DestructiveDialog({ onConfirm, onCancel }: ConfirmArgs) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default">delete image</Button>
      </DialogTrigger>
      <DialogContent variant="destructive" className="flex flex-col gap-3 w-64">
        <DialogTitle className="sr-only">delete asset</DialogTitle>
        <DialogDescription>
          This image is used in 2 presets.
        </DialogDescription>
        <div className="flex gap-2 justify-end">
          <DialogClose asChild>
            <Button variant="ghost" autoFocus onClick={onCancel}>cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={onConfirm}>delete</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  title: 'Components/Dialog',

  parameters: { layout: 'centered' },
  argTypes: {
    onConfirm: { action: 'confirmed' },
    onCancel: { action: 'cancelled' },
  },
  args: {
    onConfirm: fn(),
    onCancel: fn(),
  },
} satisfies Meta<ConfirmArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <DefaultDialog {...args} />,
};

export const DefaultOpen: Story = {
  parameters: suppressRadixTriggerHidden,
  render: (args) => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="default">open dialog</Button>
      </DialogTrigger>
      <DialogContent className="flex flex-col gap-3 w-64">
        <DialogTitle>confirm action</DialogTitle>
        <DialogDescription>This action cannot be undone.</DialogDescription>
        <div className="flex gap-2 justify-end">
          <DialogClose asChild>
            <Button variant="ghost" autoFocus onClick={args.onCancel}>cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="default" onClick={args.onConfirm}>confirm</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const Destructive: Story = {
  render: (args) => <DestructiveDialog {...args} />,
};

export const DestructiveOpen: Story = {
  parameters: suppressRadixTriggerHidden,
  render: (args) => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="default">delete image</Button>
      </DialogTrigger>
      <DialogContent variant="destructive" className="flex flex-col gap-3 w-64">
        <DialogTitle className="sr-only">delete asset</DialogTitle>
        <DialogDescription>
          This image is used in 2 presets.
        </DialogDescription>
        <div className="flex gap-2 justify-end">
          <DialogClose asChild>
            <Button variant="ghost" autoFocus onClick={args.onCancel}>cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={args.onConfirm}>delete</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const CancelInteraction: Story = {
  render: (args) => <DefaultDialog {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'open dialog' }));
    const body = within(canvasElement.ownerDocument.body);
    const cancelBtn = await body.findByRole('button', { name: 'cancel' });
    await userEvent.click(cancelBtn);
    await expect(args.onCancel).toHaveBeenCalledOnce();
  },
};

export const ConfirmInteraction: Story = {
  render: (args) => <DefaultDialog {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'open dialog' }));
    const body = within(canvasElement.ownerDocument.body);
    const confirmBtn = await body.findByRole('button', { name: 'confirm' });
    await userEvent.click(confirmBtn);
    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
};
