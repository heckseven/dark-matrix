import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, fn } from 'storybook/test';
import { useArgs } from 'storybook/preview-api';
import { Toggle } from './toggle';

const meta = {
  title: 'Components/Toggle',
  component: Toggle,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'A two-state button. Mirrors the ghost button style at rest; uses the primary fill when pressed.',
          '',
          '**Usage**',
          '- `pressedLabel` is required — the label must change between states so the current state is clear without relying on color alone.',
          '- Provide `aria-label` when neither label alone describes the action in context.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    pressed: { control: 'boolean', description: 'Whether the toggle is in the pressed (on) state.' },
    pressedLabel: { control: 'text', description: 'Label shown when pressed.' },
    disabled: { control: 'boolean', description: 'Prevents interaction and reduces opacity to 40%.' },
    children: { control: 'text', description: 'Label shown when not pressed.' },
    'aria-label': { control: 'text', description: 'Accessible label. Use when the visible label does not describe the action in context.' },
  },
  args: { onPressedChange: fn() },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All props configurable via controls. Clicking toggles the pressed state. */
export const Playground: Story = {
  args: { children: 'Live preview: off', pressedLabel: 'Live preview: on', pressed: false },
  render: (args) => {
    const [, updateArgs] = useArgs();
    return (
      <Toggle
        {...args}
        onPressedChange={(p) => { args.onPressedChange?.(p); updateArgs({ pressed: p }); }}
      />
    );
  },
};

export const Pressed: Story = {
  args: { children: 'Live preview: off', pressedLabel: 'Live preview: on', pressed: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /live preview: on/i })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Disabled: Story = {
  args: { children: 'Live preview: off', pressedLabel: 'Live preview: on', disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /live preview: off/i })).toBeDisabled();
  },
};
