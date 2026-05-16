import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { HudPanel } from './HudPanel.js';
import { designerStore } from '../store.js';
import type { HudPresetClient } from '../types/hud-preset.js';

// ── fixture presets ──────────────────────────────────────────────────────────

const PRESETS: HudPresetClient[] = [
  {
    name: 'default',
    left:  { widget: 'clock', face: 'elegant' },
    right: { widget: 'clock', face: 'analogue' },
  },
  {
    name: 'system watch',
    left:  { widget: 'data', style: 'line', top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' },
    right: { widget: 'data', style: 'bars', top_left: 'cpu', top_right: 'ram' },
  },
  {
    name: 'night mode',
    left:  { widget: 'clock', face: 'binary-tall' },
    right: { widget: 'clock', face: 'stretch' },
    triggers: [{ type: 'time', from: '22:00', to: '08:00' }],
  },
];

// ── WS mock ──────────────────────────────────────────────────────────────────
//
// HudPanel uses ws.addEventListener('open'/'message'), so we must use
// dispatchEvent rather than setting .onopen/.onmessage directly.

type MockOpts = {
  presets?: HudPresetClient[];
  activeName?: string | null;
  dataStats?: boolean;
};

function installMockWs(opts: MockOpts = {}): () => void {
  const real = globalThis.WebSocket;
  const { presets = PRESETS, activeName = null, dataStats = false } = opts;

  class MockWs extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 1;
    send = fn((raw: string) => {
      // Auto-reply to hud-preset-activate with hud-preset-activated
      try {
        const msg = JSON.parse(raw) as { type?: string; name?: string };
        if (msg.type === 'hud-preset-activate' && msg.name) {
          const name = msg.name;
          setTimeout(() => {
            this.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({ type: 'hud-preset-activated', name }),
            }));
          }, 30);
        }
      } catch { /* ignore */ }
    });
    close = fn();

    private statsTimer: ReturnType<typeof setInterval> | null = null;

    constructor(_url: string) {
      super();
      setTimeout(() => {
        this.dispatchEvent(new Event('open'));
        // Deliver initial preset list
        this.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type: 'hud-presets', presets, activeName }),
        }));
        // Deliver periodic data-stats if requested
        if (dataStats) {
          let tick = 0;
          this.statsTimer = setInterval(() => {
            tick++;
            this.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'data-stats',
                cpuPct:   0.3 + 0.4 * Math.abs(Math.sin(tick * 0.3)),
                ramPct:   0.5 + 0.1 * Math.sin(tick * 0.15),
                netRxBps: 50_000 * (0.5 + 0.5 * Math.abs(Math.sin(tick * 0.5))),
                netTxBps: 20_000 * (0.5 + 0.5 * Math.abs(Math.cos(tick * 0.4))),
              }),
            }));
          }, 500);
        }
      }, 10);
    }

    override dispatchEvent(event: Event): boolean {
      // clean up stats timer when closed
      if (event.type === 'close' && this.statsTimer) {
        clearInterval(this.statsTimer);
        this.statsTimer = null;
      }
      return super.dispatchEvent(event);
    }
  }

  globalThis.WebSocket = MockWs as unknown as typeof WebSocket;
  return () => { globalThis.WebSocket = real; };
}

// ── meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'App/HUD/HudPanel',
  component: HudPanel,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: 'Three-column HUD preset designer. Left: scrollable preset list. Center: dual live preview with clickable L/R regions. Right: widget inspector for the selected side.',
      },
    },
  },
} satisfies Meta<typeof HudPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── stories ──────────────────────────────────────────────────────────────────

/** Full panel with three presets loaded; first preset selected by default. */
export const Playground: Story = {
  decorators: [
    (Story) => {
      installMockWs({ activeName: 'default' });
      designerStore.setState({ hudPresets: [], activePresetName: null, selectedPresetName: 'default', hudSelectedSide: 'left' });
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Empty state — no presets exist yet. */
export const Empty: Story = {
  decorators: [
    (Story) => {
      installMockWs({ presets: [], activeName: null });
      designerStore.setState({ hudPresets: [], activePresetName: null, selectedPresetName: null, hudSelectedSide: 'left' });
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** One clock preset, active and selected — inspector shows clock face grid. */
export const SingleClockPreset: Story = {
  decorators: [
    (Story) => {
      const presets: HudPresetClient[] = [
        { name: 'elegant', left: { widget: 'clock', face: 'elegant' }, right: { widget: 'clock', face: 'analogue' } },
      ];
      installMockWs({ presets, activeName: 'elegant' });
      designerStore.setState({ hudPresets: [], activePresetName: null, selectedPresetName: null, hudSelectedSide: 'left' });
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Data preset selected with live stats — inspector shows quadrant dropdowns, preview animates. */
export const DataPresetLive: Story = {
  decorators: [
    (Story) => {
      const presets: HudPresetClient[] = [
        {
          name: 'system watch',
          left:  { widget: 'data', style: 'line', top_left: 'cpu', top_right: 'ram', bottom_left: 'net_rx', bottom_right: 'net_tx' },
          right: { widget: 'data', style: 'bars', top_left: 'cpu', top_right: 'ram' },
        },
      ];
      installMockWs({ presets, activeName: 'system watch', dataStats: true });
      designerStore.setState({ hudPresets: [], activePresetName: null, selectedPresetName: null, hudSelectedSide: 'left' });
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Multiple presets with distinct active/selected states and mixed widget types. */
export const MixedPresets: Story = {
  decorators: [
    (Story) => {
      installMockWs({ presets: PRESETS, activeName: 'night mode' });
      designerStore.setState({ hudPresets: [], activePresetName: null, selectedPresetName: null, hudSelectedSide: 'left' });
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** Right side selected — inspector shows right widget options. */
export const RightSideSelected: Story = {
  decorators: [
    (Story) => {
      installMockWs({ presets: PRESETS, activeName: 'default' });
      designerStore.setState({ hudPresets: [], activePresetName: null, selectedPresetName: null, hudSelectedSide: 'right' });
      return (
        <div style={{ height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
          <Story />
        </div>
      );
    },
  ],
};

/** No active preset — set active button in App header would be enabled. */
export const NoActivePreset: Story = {
  decorators: [
    (Story) => {
      installMockWs({ presets: PRESETS, activeName: null });
      designerStore.setState({ hudPresets: [], activePresetName: null, selectedPresetName: null, hudSelectedSide: 'left' });
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
