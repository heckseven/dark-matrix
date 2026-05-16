import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { App } from './App';
import { designerStore } from './store.js';

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
    useEffect(() => { designerStore.getState().setActiveMode(null); }, []);
    return <App />;
  },
};
