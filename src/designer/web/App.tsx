import { useState } from 'react';
import { Toolbar } from './components/Toolbar.js';
import { Grid } from './components/Grid.js';
import { FrameStrip } from './components/FrameStrip.js';
import { Playback } from './components/Playback.js';
import { usePreviewBridge } from './components/LivePreview.js';
import { Toggle } from './components/ui/toggle.js';

function PreviewToggle() {
  const [on, setOn] = useState(false);
  const bridge = usePreviewBridge();

  function toggle() {
    if (on) { bridge.stop(); setOn(false); }
    else { bridge.start(); setOn(true); }
  }

  return (
    <Toggle pressed={on} onPressedChange={toggle} pressedLabel="Preview: ON">
      Preview: OFF
    </Toggle>
  );
}

export function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border">
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
