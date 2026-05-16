import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Toolbar } from './Toolbar';
import { designerStore } from '../store.js';

function ToolbarStory({ mode }: { mode: 'bw' | 'gray' }) {
  useEffect(() => { designerStore.getState().setMode(mode); }, [mode]);
  return <Toolbar />;
}
ToolbarStory.displayName = 'Toolbar';

const meta = {
  title: 'App/Design/Toolbar',
  component: ToolbarStory,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Composed toolbar: drawing mode, palette, undo/redo, loop, preview target, and save controls.',
      },
    },
  },
  argTypes: {
    mode: { control: 'radio', options: ['bw', 'gray'], description: 'Drawing mode — switches between BW and grayscale palette.' },
  },
  args: { mode: 'bw' as const },
} satisfies Meta<typeof ToolbarStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mode and all controls configurable via controls panel. */
export const Playground: Story = {
  args: { mode: 'bw' },
};
