import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, fn } from 'storybook/test';
import { AudioPanel } from './AudioPanel.js';
import { designerStore } from '../store.js';
import type { AudioStyle } from '../../../animations/audio-renderers.js';

const ROWS = 34;
const COLS = 9;

function makeFrame(fill: (c: number, r: number) => number): string {
  const data = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      data[c * ROWS + r] = fill(c, r);
  return btoa(String.fromCharCode(...data));
}

const STYLE_FRAMES: Partial<Record<AudioStyle, string>> = {
  'eq-bars':   makeFrame((c, r) => r >= ROWS - Math.round((c + 1) * 5) ? 255 : 0),
  'vu-meter':  makeFrame((c, r) => c < 2 && r >= 6 ? 255 : 0),
  'waterfall': makeFrame((_c, r) => r < 10 ? 255 : 0),
  'heat':      makeFrame((_c, r) => r >= 28 ? 255 : 0),
};

// Replaces globalThis.WebSocket for the duration of a story.
// Calls onopen after one tick; delivers the given frame shortly after.
function installMockWs(frame?: string): () => void {
  const real = globalThis.WebSocket;

  class MockWs extends EventTarget {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 1;
    send = fn();
    close = fn();
    onopen: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;

    constructor(_url: string) {
      super();
      setTimeout(() => this.onopen?.(new Event('open')), 0);
      if (frame) {
        setTimeout(() => {
          this.onmessage?.(new MessageEvent('message', {
            data: JSON.stringify({ type: 'audio-frame', frame }),
          }));
        }, 50);
      }
    }
  }

  globalThis.WebSocket = MockWs as unknown as typeof WebSocket;
  return () => { globalThis.WebSocket = real; };
}

const meta = {
  title: 'Designer/AudioPanel',
  component: AudioPanel,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: 'Audio visualizer panel. Manages its own WebSocket connection for live FFT frame streaming. Source (monitor/mic) and style are persisted in the designer store.',
      },
    },
  },
  decorators: [
    (Story) => {
      designerStore.setState({ audioStyle: 'eq-bars', audioSource: 'monitor' });
      return <Story />;
    },
  ],
} satisfies Meta<typeof AudioPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Monitor source, eq-bars active. WS mock delivers a representative frame. */
export const Playground: Story = {
  decorators: [
    (Story) => {
      const restore = installMockWs(STYLE_FRAMES['eq-bars']);
      return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Story />
          <span ref={() => restore} />
        </div>
      );
    },
  ],
};

/** Mic source pre-selected. */
export const MicSource: Story = {
  decorators: [
    (Story) => {
      designerStore.setState({ audioSource: 'mic' });
      installMockWs(STYLE_FRAMES['eq-bars']);
      return <Story />;
    },
  ],
};

/** Waterfall style active with a representative frame. */
export const WaterfallStyle: Story = {
  decorators: [
    (Story) => {
      designerStore.setState({ audioStyle: 'waterfall' });
      installMockWs(STYLE_FRAMES['waterfall']);
      return <Story />;
    },
  ],
};

/** Heat style active. */
export const HeatStyle: Story = {
  decorators: [
    (Story) => {
      designerStore.setState({ audioStyle: 'heat' });
      installMockWs(STYLE_FRAMES['heat']);
      return <Story />;
    },
  ],
};

/** Clicking a style card updates the store. */
export const SelectStyle: Story = {
  decorators: [
    (Story) => {
      installMockWs();
      return <Story />;
    },
  ],
  play: async ({ canvas }) => {
    const btn = canvas.getByRole('button', { name: /waterfall visualizer/i });
    await userEvent.click(btn);
    await expect(designerStore.getState().audioStyle).toBe('waterfall');
  },
};

/** Clicking the mic toggle updates the store. */
export const ToggleToMic: Story = {
  decorators: [
    (Story) => {
      installMockWs();
      return <Story />;
    },
  ],
  play: async ({ canvas }) => {
    const btn = canvas.getByRole('button', { name: 'mic' });
    await userEvent.click(btn);
    await expect(designerStore.getState().audioSource).toBe('mic');
  },
};
