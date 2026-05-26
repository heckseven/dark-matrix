import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { LifePanel } from '../LifePanel.js';
import { deckStore } from '../../store.js';
import type { BiomePreset } from '../../types/life-types.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

const BIOMES: BiomePreset[] = [
  { name: 'conway',       algorithm: 'conway',   tickMs: 120 },
  { name: 'maze run',     algorithm: 'maze',     tickMs: 80  },
  { name: 'coral growth', algorithm: 'coral',    tickMs: 200 },
];

// ── WS mock ──────────────────────────────────────────────────────────────────
//
// LifePanel opens a WS on mount. The mock delivers biome-presets on open so
// the auto-select logic fires and the first biome is shown in the inspector.

function installMockWs(biomes: BiomePreset[]): void {
  class MockWs extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 1;
    send = fn();
    close = fn();

    constructor(_url: string) {
      super();
      setTimeout(() => {
        this.dispatchEvent(new Event('open'));
        this.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type: 'biome-presets', presets: biomes }),
        }));
      }, 10);
    }
  }

  globalThis.WebSocket = MockWs as unknown as typeof WebSocket;
}

function resetStore(): void {
  deckStore.setState({
    biomePresets: [],
    selectedBiomeName: null,
    lifeIsPlaying: false,
    lifeGeneration: 0,
    lifeStepForwardCount: 0,
    lifeStepBackCount: 0,
  });
}

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'App/Life/LifePanel',
  component: LifePanel,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: 'Three-column Game of Life editor. Left: biome list. Center: interactive canvas. Right: biome inspector. First biome is auto-selected on load.',
      },
    },
  },
} satisfies Meta<typeof LifePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ──────────────────────────────────────────────────────────────────

/** Three biomes — first auto-selected on load; inspector and canvas visible. */
export const Playground: Story = {
  decorators: [
    (Story) => {
      installMockWs(BIOMES);
      resetStore();
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Empty state — no biomes; canvas and inspector show placeholder text. */
export const Empty: Story = {
  decorators: [
    (Story) => {
      installMockWs([]);
      resetStore();
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Single biome — selected automatically; full inspector controls visible. */
export const SingleBiome: Story = {
  decorators: [
    (Story) => {
      installMockWs([BIOMES[0]!]);
      resetStore();
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Dual module — canvas spans 18 columns with the inter-module gap. */
export const DualModule: Story = {
  args: { dualModule: true },
  decorators: [
    (Story) => {
      installMockWs(BIOMES);
      resetStore();
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

// Suppress unused import warning — fn is used inside installMockWs
void fn;
