import { useState, useLayoutEffect, useRef } from 'react';
import { PixelCanvas } from './components/PixelCanvas.js';
import { FrameStrip } from './components/FrameStrip.js';
import { ColorPalette } from './components/ColorPalette.js';
import { usePreviewBridge } from './components/LivePreview.js';
import { Toggle } from './components/ui/toggle.js';
import { Button } from './components/ui/button.js';
import { Text } from './components/ui/text.js';
import { TooltipProvider } from './components/ui/tooltip.js';
import { exportProject } from './files.js';
import { useDesignerStore, designerStore } from './store.js';
import { CANVAS_COMPONENT_H } from './components/PixelCanvas.js';

function ProjectTitle() {
  const [editing, setEditing] = useState(false);
  const [committed, setCommitted] = useState('untitled_animation');
  const [draft, setDraft] = useState('untitled_animation');

  function commit() {
    const next = draft.trim() || 'untitled_animation';
    setCommitted(next);
    setDraft(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="bg-transparent outline-none ring-1 ring-ring text-center font-mono text-xs text-foreground min-w-[180px] px-1"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(committed); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button
      className="font-mono text-xs text-foreground bg-transparent border-none cursor-text hover:opacity-70 transition-opacity"
      onClick={() => setEditing(true)}
    >
      {committed}
    </button>
  );
}

function LivePreviewToggle() {
  const [on, setOn] = useState(false);
  const bridge = usePreviewBridge();

  function toggle() {
    if (on) { bridge.stop(); setOn(false); }
    else { bridge.start(); setOn(true); }
  }

  return (
    <Toggle pressed={on} onPressedChange={toggle} pressedLabel="live preview: on">
      live preview: off
    </Toggle>
  );
}

export function App() {
  const activeColor = useDesignerStore(s => s.activeColor);
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [topPad, setTopPad] = useState(0);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const h = containerRef.current?.clientHeight ?? 0;
      setTopPad(Math.max(0, Math.round((h - CANVAS_COMPONENT_H) / 2)));
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  function pickColor(v: number) {
    designerStore.getState().setActiveColor(v);
    designerStore.getState().setMode(v === 0 || v === 255 ? 'bw' : 'gray');
  }

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background text-foreground font-mono overflow-hidden">

        <header className="flex-none flex items-center gap-4 pl-7 pr-5 py-4">
          <div className="flex items-center gap-1">
            <Text as="span" size="xs">◫</Text>
            <Button variant="ghost">file <span aria-hidden="true">▾</span></Button>
          </div>
          <div className="flex-1 flex justify-center">
            <ProjectTitle />
          </div>
          <Button onClick={() => void exportProject({ state: designerStore.getState() })}>
            save
          </Button>
        </header>

        <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden flex">
          <aside aria-label="Color palette" className="flex-1 overflow-hidden flex items-start justify-end pl-4" style={{ paddingTop: topPad }}>
            <ColorPalette value={activeColor} onChange={pickColor} />
          </aside>

          <main className="px-10 flex-none flex flex-col overflow-y-auto">
            <div className="my-auto">
              <PixelCanvas onCursorMove={(col, row) => setCursor({ col, row })} />
            </div>
          </main>

          <aside aria-label="Animation frames" className="flex-1 overflow-hidden flex flex-col">
            <FrameStrip topPadding={topPad} />
          </aside>
        </div>

        <footer className="flex-none flex items-center px-7 py-4 text-xs">
          <div className="flex items-center gap-4">
            <span>frame {activeFrameIdx + 1}</span>
            <span>row {cursor.row}</span>
            <span>col {cursor.col}</span>
          </div>
          <div className="flex-1 flex justify-center">
            <Text as="span" size="xs" variant="muted">drag to draw. double click to fill</Text>
          </div>
          <div className="flex items-center gap-4">
            <LivePreviewToggle />
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled>-</Button>
              <Text as="span" size="xs">100%</Text>
              <Button variant="ghost" disabled>+</Button>
            </div>
            <Text as="span" size="xs" variant="muted" aria-hidden="true">???</Text>
          </div>
        </footer>

      </div>
    </TooltipProvider>
  );
}
