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
  title: 'Components/Toolbar',
  component: ToolbarStory,
  tags: ['autodocs'],
  argTypes: {
    mode: { control: 'radio', options: ['bw', 'gray'], description: 'Drawing mode — switches between BW and grayscale palette' },
  },
  args: { mode: 'bw' as const },
} satisfies Meta<typeof ToolbarStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const BwMode: Story = {
  name: 'BW Mode',
  args: { mode: 'bw' },
};

export const GrayMode: Story = {
  args: { mode: 'gray' },
};
