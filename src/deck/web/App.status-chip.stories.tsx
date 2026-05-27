import { useLayoutEffect } from 'react';
import { expect } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { App } from './App.js';
import { deckStore, DEFAULT_WIDTH, ROWS } from './store.js';
import type { AppMode } from './app-modes.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const W = DEFAULT_WIDTH;
function px(fn: (c: number, r: number) => number): string {
  const d = new Uint8Array(W * ROWS);
  for (let c = 0; c < W; c++) for (let r = 0; r < ROWS; r++) d[c * ROWS + r] = fn(c, r);
  return btoa(String.fromCharCode(...d));
}
const BLANK = px(() => 0);
const CHECKER = px((c, r) => ((c + r) % 2 === 0 ? 255 : 0));

type ChipStatus = 'daemon-offline' | 'setup-required' | 'no-hardware';

const MODULE_PAYLOADS: Record<ChipStatus, { left: boolean; right: boolean; daemonOnline: boolean; uncalibrated: boolean }> = {
  'daemon-offline':  { left: true,  right: true,  daemonOnline: false, uncalibrated: false },
  'setup-required':  { left: true,  right: true,  daemonOnline: true,  uncalibrated: true  },
  'no-hardware':     { left: false, right: false, daemonOnline: true,  uncalibrated: false },
};

function mockModules(status: ChipStatus) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('/api/modules')) {
      return new Response(JSON.stringify(MODULE_PAYLOADS[status]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return orig(input, init);
  };
  return () => { globalThis.fetch = orig; };
}

function setupMode(activeMode: AppMode) {
  const pixels = activeMode === 'design' ? CHECKER : BLANK;
  deckStore.getState().loadProject({ frames: [{ pixels, delayMs: 100 }], width: W, mode: 'bw', loop: true });
  deckStore.getState().setActiveMode(activeMode);
}

// ── story wrapper ─────────────────────────────────────────────────────────────

interface Args { activeMode: AppMode }

function StatusChipStory({ activeMode }: Args) {
  useLayoutEffect(() => { setupMode(activeMode); }, [activeMode]);
  return <App />;
}
StatusChipStory.displayName = 'App';

// ── meta ──────────────────────────────────────────────────────────────────────

const meta = {
  title: 'App/StatusChip',
  component: StatusChipStory,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Daemon / hardware status chip in the main toolbar left slot, immediately right of the mode switcher. Shows in all app modes.',
      },
    },
  },
  argTypes: {
    activeMode: {
      control: 'select',
      options: ['design', 'hud', 'config', 'audio', 'video', 'life', 'data', 'runes'],
      description: 'Active app mode — use to verify chip placement across modes.',
    },
  },
  args: { activeMode: 'design' },
} satisfies Meta<typeof StatusChipStory>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── chip variant stories ───────────────────────────────────────────────────────

/** Interactive baseline — switch activeMode in Controls to verify chip placement in each mode. */
export const Playground: Story = {
  beforeEach() { return mockModules('daemon-offline'); },
};

/** Daemon offline (red) — daemon process not reachable. Clicking navigates to config. */
export const DaemonOffline: Story = {
  beforeEach() { return mockModules('daemon-offline'); },
  play: async ({ canvas }) => {
    const chip = await canvas.findByRole('button', { name: /daemon offline/i });
    await expect(chip).toBeInTheDocument();
  },
};

/** Setup required (amber) — device hasn't been calibrated yet. Clicking reopens the welcome guide. */
export const SetupRequired: Story = {
  beforeEach() { return mockModules('setup-required'); },
  play: async ({ canvas }) => {
    const chip = await canvas.findByRole('button', { name: /setup required/i });
    await expect(chip).toBeInTheDocument();
  },
};

/** No hardware (orange) — both modules unplugged or unreachable. Clicking navigates to config. */
export const NoHardware: Story = {
  beforeEach() { return mockModules('no-hardware'); },
  play: async ({ canvas }) => {
    const chip = await canvas.findByRole('button', { name: /no hardware/i });
    await expect(chip).toBeInTheDocument();
  },
};

// ── daemon-offline across all modes ──────────────────────────────────────────

/** HUD mode — chip sits in the compact left slot next to the mode switcher. */
export const DaemonOfflineHud: Story = {
  args: { activeMode: 'hud' },
  beforeEach() { return mockModules('daemon-offline'); },
};

/** Config mode — chip appears alongside the mode switcher. */
export const DaemonOfflineConfig: Story = {
  args: { activeMode: 'config' },
  beforeEach() { return mockModules('daemon-offline'); },
};

/** Audio mode. */
export const DaemonOfflineAudio: Story = {
  args: { activeMode: 'audio' },
  beforeEach() { return mockModules('daemon-offline'); },
};

/** Video mode — toolbar auto-hides on idle; chip is visible while toolbar is shown. */
export const DaemonOfflineVideo: Story = {
  args: { activeMode: 'video' },
  beforeEach() { return mockModules('daemon-offline'); },
};

/** Life mode. */
export const DaemonOfflineLife: Story = {
  args: { activeMode: 'life' },
  beforeEach() { return mockModules('daemon-offline'); },
};

/** Data mode. */
export const DaemonOfflineData: Story = {
  args: { activeMode: 'data' },
  beforeEach() { return mockModules('daemon-offline'); },
};

/** Runes mode. */
export const DaemonOfflineRunes: Story = {
  args: { activeMode: 'runes' },
  beforeEach() { return mockModules('daemon-offline'); },
};
