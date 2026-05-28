import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { userEvent, within, expect } from 'storybook/test';
import { AssetManagerModal } from './AssetManagerModal.js';
import type { AssetMeta } from '../../../lib/asset-meta.js';

// ── pixel helpers ─────────────────────────────────────────────────────────────

const ROWS = 34;

function makeFrame(width: number, fn: (col: number, row: number) => number): string {
  const bytes = new Uint8Array(width * ROWS);
  for (let col = 0; col < width; col++)
    for (let row = 0; row < ROWS; row++)
      bytes[col * ROWS + row] = fn(col, row);
  return btoa(String.fromCharCode(...bytes));
}

const F9 = {
  solid:    makeFrame(9,  ()        => 255),
  checker:  makeFrame(9,  (c, r)    => (c + r) % 2 === 0 ? 255 : 0),
  cols:     makeFrame(9,  (c)       => c % 2 === 0 ? 255 : 0),
  colsInv:  makeFrame(9,  (c)       => c % 2 === 0 ? 0   : 255),
  rows:     makeFrame(9,  (_c, r)   => r % 4 === 0 ? 255 : 0),
  rowsInv:  makeFrame(9,  (_c, r)   => r % 4 === 0 ? 0   : 255),
  half:     makeFrame(9,  (_c, r)   => r < 17 ? 255 : 0),
  halfInv:  makeFrame(9,  (_c, r)   => r < 17 ? 0   : 255),
};

const F18 = {
  solid:   makeFrame(18, ()      => 255),
  checker: makeFrame(18, (c, r)  => (c + r) % 2 === 0 ? 255 : 0),
  cols:    makeFrame(18, (c)     => c % 3 === 0 ? 255 : 0),
};

// ── mock assets ───────────────────────────────────────────────────────────────

const ASSETS: AssetMeta[] = [
  // 9-wide, single frame
  {
    name: 'pulse.dmx.json',
    width: 9,
    frameCount: 1,
    firstFrame: F9.checker,
    frames: [F9.checker],
    delays: [100],
  },
  // 9-wide, 4-frame animation
  {
    name: 'blink.dmx.json',
    width: 9,
    frameCount: 4,
    firstFrame: F9.solid,
    frames: [F9.solid, F9.cols, F9.colsInv, F9.cols],
    delays: [120, 120, 120, 120],
  },
  // 9-wide, 2-frame animation
  {
    name: 'wipe.dmx.json',
    width: 9,
    frameCount: 2,
    firstFrame: F9.half,
    frames: [F9.half, F9.halfInv],
    delays: [200, 200],
  },
  // 9-wide, single frame
  {
    name: 'scan.dmx.json',
    width: 9,
    frameCount: 1,
    firstFrame: F9.rows,
    frames: [F9.rows],
    delays: [100],
  },
  // 18-wide, single frame
  {
    name: 'banner.dmx.json',
    width: 18,
    frameCount: 1,
    firstFrame: F18.solid,
    frames: [F18.solid],
    delays: [100],
  },
  // 18-wide, 2-frame animation
  {
    name: 'sweep.dmx.json',
    width: 18,
    frameCount: 2,
    firstFrame: F18.checker,
    frames: [F18.checker, F18.cols],
    delays: [150, 150],
  },
];


// ── fetch mock ────────────────────────────────────────────────────────────────

function makeFetchMock(assetList: AssetMeta[]) {
  let currentAssets = [...assetList];
  const orig = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input
      : input instanceof Request ? input.url
      : String(input);
    const method = init?.method?.toUpperCase() ?? 'GET';

    // List
    if (url.endsWith('/api/assets') && method === 'GET') {
      return new Response(JSON.stringify({ ok: true, assets: currentAssets }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Copy
    if (url.endsWith('/api/assets/copy') && method === 'POST') {
      const body = JSON.parse(init?.body as string ?? '{}') as { name?: string };
      const stem = (body.name ?? 'asset').replace(/\.dmx\.json$/i, '');
      const copyName = `${stem} 2.dmx.json`;
      const src = currentAssets.find(a => a.name === body.name);
      if (src) currentAssets = [...currentAssets, { ...src, name: copyName }];
      return new Response(JSON.stringify({ ok: true, name: copyName }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete
    if (url.includes('/api/assets/') && method === 'DELETE') {
      const name = decodeURIComponent(url.split('/api/assets/')[1]!);
      currentAssets = currentAssets.filter(a => a.name !== name);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get full project (?full=1)
    if (url.includes('/api/assets/') && url.includes('full=1') && method === 'GET') {
      const rawName = decodeURIComponent(url.split('/api/assets/')[1]!.split('?')[0]!);
      const asset = currentAssets.find(a => a.name === rawName);
      if (!asset) return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 });
      const project = {
        format: 'dark-matrix', version: 1, width: asset.width, height: 34,
        mode: 'bw', loop: true,
        frames: asset.frames.map((pixels, i) => ({ pixels, delayMs: asset.delays[i] ?? 100 })),
      };
      return new Response(JSON.stringify(project), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    return orig(input, init);
  };

  return orig;
}

// ── meta ──────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Components/AssetManagerModal',
  component: AssetManagerModal,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onOpenChange: fn(),
    onOpenAsset: fn(),
  },
} satisfies Meta<typeof AssetManagerModal>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ───────────────────────────────────────────────────────────────────

/** Default: mix of 9-wide and 18-wide, animated and static. */
export const Playground: Story = {
  beforeEach() {
    const orig = makeFetchMock(ASSETS);
    return () => { globalThis.fetch = orig; };
  },
};

/** Empty state — no assets imported yet. */
export const Empty: Story = {
  beforeEach() {
    const orig = makeFetchMock([]);
    return () => { globalThis.fetch = orig; };
  },
};

/** Import view — opened to the import panel. */
export const ImportView: Story = {
  beforeEach() {
    const orig = makeFetchMock(ASSETS);
    return () => { globalThis.fetch = orig; };
  },
  play: async () => {
    const body = within(document.body);
    const importBtn = await body.findByRole('button', { name: /import asset/i });
    await userEvent.click(importBtn);
  },
};

/** Delete confirmation — first click shows the confirm state. */
export const DeleteConfirm: Story = {
  beforeEach() {
    const orig = makeFetchMock(ASSETS);
    return () => { globalThis.fetch = orig; };
  },
  play: async () => {
    const body = within(document.body);
    const deleteBtn = await body.findByRole('button', { name: /delete pulse/i });
    await userEvent.click(deleteBtn);
    await expect(body.getByRole('button', { name: /confirm delete pulse/i })).toBeInTheDocument();
  },
};
