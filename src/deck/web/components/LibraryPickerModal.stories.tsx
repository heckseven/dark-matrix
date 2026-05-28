import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { LibraryPickerModal } from './LibraryPickerModal.js';

// ── fetch mock helpers ────────────────────────────────────────────────────────

const BLANK_9  = btoa(String.fromCharCode(...new Uint8Array(9  * 34)));
const BLANK_18 = btoa(String.fromCharCode(...new Uint8Array(18 * 34)));

type MockEntry = { name: string; frames: string[]; width: 9 | 18 };

const MOCK_ENTRIES: MockEntry[] = [
  { name: 'glider',    frames: [BLANK_9],                    width: 9  },
  { name: 'spaceship', frames: [BLANK_9, BLANK_9, BLANK_9],  width: 9  },
  { name: 'wide rule', frames: [BLANK_18],                   width: 18 },
  { name: 'pulsar',    frames: [BLANK_9],                    width: 9  },
  { name: 'acorn',     frames: [BLANK_9],                    width: 9  },
];

function patchFetch(entries: MockEntry[]): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input :
      input instanceof Request  ? input.url :
      String(input);

    if (url === '/api/library') {
      return new Response(
        JSON.stringify({ ok: true, files: entries.map(e => ({ name: e.name })) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    for (const entry of entries) {
      if (url === `/api/library/${encodeURIComponent(entry.name)}`) {
        return new Response(
          JSON.stringify({
            frames: entry.frames.map(pixels => ({ pixels, delayMs: 100 })),
            width: entry.width,
            mode: 'bw',
            loop: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    return orig(input, init);
  };
  return () => { globalThis.fetch = orig; };
}

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Components/LibraryPickerModal',
  component: LibraryPickerModal,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the modal is visible.',
    },
    onOpenChange: {
      control: false,
      description: 'Called with false when the modal requests closure.',
    },
    onPick: {
      control: false,
      description: 'Called with (name, frame, width) when a frame is selected.',
    },
  },
  args: {
    open: true,
    onOpenChange: fn(),
    onPick: fn(),
  },
} satisfies Meta<typeof LibraryPickerModal>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ──────────────────────────────────────────────────────────────────

/** Modal open with no library entries — shows "no designs in library". */
export const OpenEmpty: Story = {
  beforeEach() {
    const restore = patchFetch([]);
    return restore;
  },
};

/** Modal open with several designs — grid shows thumbnails including a dual-module entry. */
export const OpenWithDesigns: Story = {
  beforeEach() {
    const restore = patchFetch(MOCK_ENTRIES);
    return restore;
  },
};

/** Modal closed — component renders nothing visible. */
export const Closed: Story = {
  args: {
    open: false,
  },
};
