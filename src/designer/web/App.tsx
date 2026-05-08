import { useState } from 'react';
import { Toolbar } from './components/Toolbar.js';
import { Grid } from './components/Grid.js';
import { FrameStrip } from './components/FrameStrip.js';
import { Playback } from './components/Playback.js';
import { usePreviewBridge } from './components/LivePreview.js';

function PreviewToggle() {
  const [on, setOn] = useState(false);
  const bridge = usePreviewBridge();

  function toggle() {
    if (on) {
      bridge.stop();
      setOn(false);
    } else {
      bridge.start();
      setOn(true);
    }
  }

  const btn = `px-2 py-0.5 rounded border text-xs cursor-pointer ${
    on
      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]'
      : 'bg-transparent text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]'
  }`;

  return (
    <button className={btn} onClick={toggle}>
      Preview: {on ? 'ON' : 'OFF'}
    </button>
  );
}

export function App() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex flex-col">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[hsl(var(--border))]">
        <PreviewToggle />
      </div>
      <Toolbar />
      <div className="flex-1 overflow-auto p-2">
        <Grid />
      </div>
      <FrameStrip />
      <Playback />
    </div>
  );
}
