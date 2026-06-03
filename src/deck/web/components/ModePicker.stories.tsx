import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, expect } from 'storybook/test';
import { ModePicker } from './ModePicker';
import type { AppMode } from './ModePicker';

const meta = {
  title: 'App/ModePicker',
  component: ModePicker,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Full-screen app mode switcher. Escape or click-outside closes it. Each card shows the mode icon scaled to the connected module count.',
      },
    },
  },
  argTypes: {
    activeMode: {
      control: 'select',
      options: ['hud', 'audio', 'video', 'cast', 'life', 'design', 'config'] satisfies AppMode[],
      description: 'Currently selected mode.',
    },
    dualModule: {
      control: 'boolean',
      description: 'Two modules connected — shows full 18-wide icons. Single module shows left-half 9-wide icons.',
    },
  },
  args: {
    activeMode: 'design',
    dualModule: true,
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ModePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default state: dual module, design mode active. */
export const Playground: Story = {};

/** Single module — each thumbnail shows the left 9 columns of the icon. */
export const SingleModule: Story = {
  args: { dualModule: false },
};

/** No mode active — picker opened before a mode is selected. */
export const NoActiveMode: Story = {
  args: { activeMode: 'hud', dualModule: true },
};

/** Audio mode active. */
export const AudioActive: Story = {
  args: { activeMode: 'audio' },
};

/** Pressing Escape calls onClose. */
export const EscapeCloses: Story = {
  play: async ({ args }) => {
    await userEvent.keyboard('{Escape}');
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

/** Clicking a mode card calls onSelect with the mode id and then onClose. */
export const SelectMode: Story = {
  play: async ({ canvas, args }) => {
    const btn = canvas.getByRole('button', { name: /audio mode/i });
    await userEvent.click(btn);
    await expect(args.onSelect).toHaveBeenCalledWith('audio');
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
