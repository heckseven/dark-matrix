import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CastColumn as CastColumnType } from '../types/config-types.js';
import { CastColumn } from './CastColumn.js';

const EXPANDED: CastColumnType = { provider: 'twitch', channel: 'moonbeam' };
const COLLAPSED: CastColumnType = { provider: 'twitch', channel: 'moonbeam', collapsed: true };

const meta = {
  title: 'App/Cast/CastColumn',
  component: CastColumn,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onCollapse: () => {},
    onRemove: () => {},
  },
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground flex h-screen">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CastColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Expanded column — hover to reveal collapse and remove controls in the header. */
export const Expanded: Story = {
  args: { column: EXPANDED },
};

/** Collapsed to a narrow strip — click expand to restore. */
export const Collapsed: Story = {
  args: { column: COLLAPSED },
};
