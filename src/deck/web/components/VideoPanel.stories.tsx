import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { VideoPanel, VideoHeader, VideoTransportControls, VideoSettingsToggle, resetVStore, useVStore } from './VideoPanel.js';

// Installs a mock WebSocket for the duration of a story's mount.
function MockWsProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const real = globalThis.WebSocket;
    class MockWs extends EventTarget {
      static OPEN = 1;
      readyState = 1;
      send = () => {};
      close = () => {};
      onopen: ((e: Event) => void) | null = null;
      constructor(_url: string) {
        super();
        setTimeout(() => this.onopen?.(new Event('open')), 0);
      }
    }
    globalThis.WebSocket = MockWs as unknown as typeof WebSocket;
    return () => { globalThis.WebSocket = real; };
  }, []);
  return <>{children}</>;
}

// Wrapper that mirrors the in-app toolbar + panel layout.
function Layout({ children }: { children: React.ReactNode }) {
  return (
    <MockWsProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#000' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', height: 44, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <VideoHeader />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <VideoTransportControls />
            <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
            <VideoSettingsToggle />
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </div>
    </MockWsProvider>
  );
}

const meta = {
  title: 'App/Video/VideoPanel',
  component: VideoPanel,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: 'Matrix-style video player panel. Renders video as a dot-in-cell grid matching the HUD aesthetic. Supports local files and YouTube URLs via yt-dlp proxy. Hardware frame is sent via PreviewBridge WebSocket.',
      },
    },
  },
  decorators: [
    (Story) => {
      resetVStore();
      return (
        <Layout>
          <Story />
        </Layout>
      );
    },
  ],
} satisfies Meta<typeof VideoPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default state — no source loaded, transport disabled. */
export const Idle: Story = {};

/** Settings panel open — shows brightness/contrast/invert/dither controls over the video area. */
export const SettingsOpen: Story = {
  decorators: [
    (Story) => {
      useVStore.setState({ settingsOpen: true });
      return <Story />;
    },
  ],
};

/** Settings panel open with non-default values applied. */
export const SettingsActive: Story = {
  decorators: [
    (Story) => {
      useVStore.setState({
        settingsOpen: true,
        controls: { brightness: 20, contrast: 1.4, invert: true, dither: true },
      });
      return <Story />;
    },
  ],
};

/** Progress bar visible — simulates a loaded video mid-playback. */
export const WithProgress: Story = {
  decorators: [
    (Story) => {
      useVStore.setState({ src: 'blob:fake', duration: 180, currentTime: 67 });
      return <Story />;
    },
  ],
};

/** yt-dlp not installed — shows inline error with install hint. */
export const ErrorYtDlpMissing: Story = {
  decorators: [
    (Story) => {
      useVStore.setState({
        ytError: 'Error: yt-dlp not found — install it: sudo apt install yt-dlp (spawn yt-dlp ENOENT)',
      });
      return <Story />;
    },
  ],
};

/** Generic stream error (yt-dlp present but video unavailable). */
export const ErrorGeneric: Story = {
  decorators: [
    (Story) => {
      useVStore.setState({ ytError: "Error: yt-dlp: ERROR: [youtube] X2WH8mHJnhM: Sign in to confirm you're not a bot." });
      return <Story />;
    },
  ],
};

/** Transport controls enabled — source loaded, mid-playback position set. */
export const TransportEnabled: Story = {
  decorators: [
    (Story) => {
      useVStore.setState({ src: 'blob:fake', duration: 120, currentTime: 30 });
      return <Story />;
    },
  ],
};
