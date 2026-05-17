import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { AssetImportPanel } from './AssetImportPanel.js';

const meta = {
  title: 'App/HUD/AssetImportPanel',
  component: AssetImportPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    onSaved: fn(),
  },
} satisfies Meta<typeof AssetImportPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No file selected — shows drop zone only. */
export const Empty: Story = {};

/** With file pre-loaded — shows all controls. */
export const WithFile: Story = {
  decorators: [
    (StoryFn) => {
      // Minimal MSW-style approach: patch global fetch for the preview endpoint.
      // In Storybook, there's no real server — return a blank 9×34 frame.
      const orig = globalThis.fetch;
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.includes('/api/assets/preview')) {
          const blank = btoa(String.fromCharCode(...new Uint8Array(9 * 34)));
          return new Response(JSON.stringify({ ok: true, frames: [blank], width: 9 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return orig(input, init);
      };
      return <StoryFn />;
    },
  ],
  play: async ({ canvasElement }) => {
    // Simulate a file drop by dispatching a change event on the hidden input
    const input = canvasElement.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) return;
    const file = new File(['fake-png-data'], 'hero-image.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },
};
