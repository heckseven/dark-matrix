import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn, userEvent, expect, within } from 'storybook/test';
import { Button } from './button.js';
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from './menu.js';

interface FileMenuArgs {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

function FileMenu({ onNew, onOpen, onSave, onSaveAs }: FileMenuArgs) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost">
          file <span aria-hidden="true">▾</span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem shortcut="^n" onSelect={onNew}>new</MenuItem>
        <MenuItem shortcut="^o" onSelect={onOpen}>open</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="^s" onSelect={onSave}>save</MenuItem>
        <MenuItem shortcut="^⇧s" onSelect={onSaveAs}>save as</MenuItem>
      </MenuContent>
    </Menu>
  );
}

const meta = {
  title: 'Components/Menu',
  component: FileMenu,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    onNew: { action: 'new' },
    onOpen: { action: 'open' },
    onSave: { action: 'save' },
    onSaveAs: { action: 'save as' },
  },
  args: {
    onNew: fn(),
    onOpen: fn(),
    onSave: fn(),
    onSaveAs: fn(),
  },
} satisfies Meta<typeof FileMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default state: trigger visible, menu closed. */
export const Playground: Story = {};

// Radix hides the trigger via aria-hidden when the menu is open; suppress this rule for static stories.
const suppressRadixTriggerHidden = { a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } } };

/** Menu pre-opened to show all items without interaction. */
export const Open: Story = {
  parameters: suppressRadixTriggerHidden,
  render: (args) => (
    <Menu defaultOpen>
      <MenuTrigger asChild>
        <Button variant="ghost">
          file <span aria-hidden="true">▾</span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem shortcut="^n" onSelect={args.onNew}>new</MenuItem>
        <MenuItem shortcut="^o" onSelect={args.onOpen}>open</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="^s" onSelect={args.onSave}>save</MenuItem>
        <MenuItem shortcut="^⇧s" onSelect={args.onSaveAs}>save as</MenuItem>
      </MenuContent>
    </Menu>
  ),
};

/** Opens via trigger click; selects "save" and asserts callback fires. */
export const ItemInteraction: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    const body = within(canvasElement.ownerDocument.body);
    const saveItem = await body.findByRole('menuitem', { name: /^save$/ });
    await userEvent.click(saveItem);
    await expect(args.onSave).toHaveBeenCalledOnce();
  },
};

function MatrixMenuDemo({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [value, setValue] = useState('left');
  return (
    <Menu defaultOpen={defaultOpen}>
      <MenuTrigger asChild>
        <Button variant="ghost">matrix <span aria-hidden="true">▾</span></Button>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup aria-label="Preview target" value={value} onValueChange={setValue}>
          <MenuRadioItem value="left">left</MenuRadioItem>
          <MenuRadioItem value="right">right</MenuRadioItem>
          <MenuRadioItem value="both">both</MenuRadioItem>
          <MenuRadioItem value="mirror">mirror</MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/** Matrix menu pre-opened; "left" is the initial selection. */
export const RadioGroupOpen: Story = {
  parameters: suppressRadixTriggerHidden,
  render: () => <MatrixMenuDemo defaultOpen />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const items = await body.findAllByRole('menuitemradio');
    await expect(items).toHaveLength(4);
    await expect(items[0]).toHaveAttribute('data-state', 'checked');
  },
};

/** Clicking "mirror" updates the selection; reopening confirms the new checked state. */
export const RadioGroupSelectMirror: Story = {
  parameters: suppressRadixTriggerHidden,
  render: () => <MatrixMenuDemo />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: /matrix/i }));
    const body = within(canvasElement.ownerDocument.body);
    const mirrorItem = await body.findByRole('menuitemradio', { name: 'mirror' });
    await userEvent.click(mirrorItem);
    await userEvent.click(canvas.getByRole('button', { name: /matrix/i }));
    const mirrorAfter = await body.findByRole('menuitemradio', { name: 'mirror' });
    await expect(mirrorAfter).toHaveAttribute('data-state', 'checked');
  },
};

/** Disabled items are visible but cannot be selected — matches the "new" item state in the app. */
export const DisabledItem: Story = {
  parameters: suppressRadixTriggerHidden,
  render: (args) => (
    <Menu defaultOpen>
      <MenuTrigger asChild>
        <Button variant="ghost">
          file <span aria-hidden="true">▾</span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem shortcut="^n" onSelect={args.onNew} disabled>new</MenuItem>
        <MenuItem shortcut="^o" onSelect={args.onOpen}>open</MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="^s" onSelect={args.onSave}>save</MenuItem>
        <MenuItem shortcut="^⇧s" onSelect={args.onSaveAs}>save as</MenuItem>
      </MenuContent>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const newItem = await body.findByRole('menuitem', { name: 'new' });
    await expect(newItem).toHaveAttribute('data-disabled');
  },
};
