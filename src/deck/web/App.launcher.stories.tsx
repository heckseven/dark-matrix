import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from './App';
import { deckStore } from './store.js';

const meta = {
  title: 'App',
  component: App,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Initial launch state — mode picker full-screen, no mode selected yet. */
export const AppPlayground: Story = {
  render: () => {
    useEffect(() => { deckStore.getState().setActiveMode(null); }, []);
    return <App />;
  },
};
