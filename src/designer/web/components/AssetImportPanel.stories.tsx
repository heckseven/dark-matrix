import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { AssetImportPanel } from './AssetImportPanel.js';

const BLANK_FRAME = btoa(String.fromCharCode(...new Uint8Array(9 * 34)));

function patchFetch() {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('/api/assets/preview')) {
      return new Response(JSON.stringify({ ok: true, frames: [BLANK_FRAME], delays: [100], width: 9 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/assets') && (!init?.method || init.method === 'POST')) {
      return new Response(JSON.stringify({ ok: true, filename: 'asset.dmx.json' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return orig(input, init);
  };
  return orig;
}

const meta = {
  title: 'Components/AssetImportPanel',
  component: AssetImportPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    onSaved: { action: 'saved', description: 'Called with the saved filename.' },
    onCancel: { action: 'cancelled', description: 'Called when cancel is clicked. Omit to hide cancel button.' },
  },
  args: {
    onSaved: fn(),
  },
} satisfies Meta<typeof AssetImportPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Playground — wire all props via Controls. */
export const Playground: Story = {};

/** No file selected — shows drop zone only. */
export const Empty: Story = {};

/** With file pre-loaded — shows all controls. */
export const WithFile: Story = {
  beforeEach() {
    const orig = patchFetch();
    return () => { globalThis.fetch = orig; };
  },
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) return;
    const file = new File(['fake-png-data'], 'hero-image.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },
};
