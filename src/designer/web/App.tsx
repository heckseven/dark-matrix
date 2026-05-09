import { useState, useLayoutEffect, useRef, useEffect, useCallback } from 'react';
import { PixelCanvas, canvasComponentH } from './components/PixelCanvas.js';
import { FrameStrip } from './components/FrameStrip.js';
import { ColorPalette } from './components/ColorPalette.js';
import { usePreviewBridge } from './components/LivePreview.js';
import { Toggle } from './components/ui/toggle.js';
import { Button } from './components/ui/button.js';
import { Text } from './components/ui/text.js';
import { Tooltip, TooltipProvider } from './components/ui/tooltip.js';
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from './components/ui/menu.js';
import { exportProject, saveProjectAs, importFile } from './files.js';
import { useDesignerStore, designerStore, stepZoom, ZOOM_STEPS } from './store.js';
import { ShortcutDialog } from './components/ui/shortcut-dialog.js';

function storeCompat() {
  return { state: designerStore.getState(), loadProject: (p: unknown) => designerStore.getState().loadProject(p) };
}

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

function TransportControls() {
  const isPlaying = useDesignerStore(s => s.isPlaying);
  const frames = useDesignerStore(s => s.frames);
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);
  const loop = useDesignerStore(s => s.loop);

  useEffect(() => {
    if (!isPlaying) return;
    const delay = frames[activeFrameIdx]?.delayMs ?? 100;
    const id = setTimeout(() => {
      const next = activeFrameIdx + 1;
      if (next >= frames.length) {
        if (loop) designerStore.getState().setActiveFrame(0);
        else designerStore.getState().setPlaying(false);
      } else {
        designerStore.getState().setActiveFrame(next);
      }
    }, delay);
    return () => clearTimeout(id);
  }, [isPlaying, activeFrameIdx, frames, loop]);

  const atFirst = activeFrameIdx === 0;
  const atLast = activeFrameIdx === frames.length - 1;
  const single = frames.length <= 1;

  return (
    <div className="flex items-center">
      <Button variant="ghost" aria-label="First frame" tooltip="First frame"
        disabled={isPlaying || atFirst}
        onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(0); }}>
        {'|◁'}
      </Button>
      <Button variant="ghost" aria-label="Previous frame" tooltip="Previous frame"
        disabled={isPlaying || atFirst}
        onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(activeFrameIdx - 1); }}>
        ◁
      </Button>
      <Button variant="ghost" aria-label={isPlaying ? 'Pause' : 'Play'} tooltip={isPlaying ? 'Pause' : 'Play'}
        disabled={single} onClick={() => designerStore.getState().setPlaying(!isPlaying)}>
        <span className="inline-block w-[1em] text-center">{isPlaying ? '⏸' : '▶'}</span>
      </Button>
      <Button variant="ghost" aria-label="Next frame" tooltip="Next frame"
        disabled={isPlaying || atLast}
        onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(activeFrameIdx + 1); }}>
        ▷
      </Button>
      <Button variant="ghost" aria-label="Last frame" tooltip="Last frame"
        disabled={isPlaying || atLast}
        onClick={() => { designerStore.getState().setPlaying(false); designerStore.getState().setActiveFrame(frames.length - 1); }}>
        {'▷|'}
      </Button>
      <Tooltip content={`loop: ${loop ? 'on' : 'off'}`}>
        <Toggle className="ml-3"
          pressed={loop}
          onPressedChange={v => designerStore.getState().setLoop(v)}
          aria-label={`Loop ${loop ? 'on' : 'off'}`}
        >
          ↺
        </Toggle>
      </Tooltip>
    </div>
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
  const zoom = useDesignerStore(s => s.zoom);
  const previewTarget = useDesignerStore(s => s.previewTarget);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [topPad, setTopPad] = useState(0);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const h = containerRef.current?.clientHeight ?? 0;
      const hh = headerRef.current?.offsetHeight ?? 0;
      const fh = footerRef.current?.offsetHeight ?? 0;
      const usable = h - hh - fh;
      setTopPad(hh + Math.max(0, Math.round((usable - canvasComponentH(zoom)) / 2)));
    };
    update();
    const ro = new ResizeObserver(update);
    [containerRef, headerRef, footerRef].forEach(r => { if (r.current) ro.observe(r.current); });
    return () => ro.disconnect();
  }, [zoom]);

  const toggleShortcuts = useCallback(() => setShortcutsOpen(v => !v), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '?') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      toggleShortcuts();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleShortcuts]);

  function pickColor(v: number) {
    designerStore.getState().setActiveColor(v);
    designerStore.getState().setMode(v === 0 || v === 255 ? 'bw' : 'gray');
  }

  return (
    <TooltipProvider>
      <ShortcutDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <div ref={containerRef} className="relative h-screen bg-background text-foreground font-mono">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.dmx.json"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) importFile(file, storeCompat()).catch(console.error);
            e.target.value = '';
          }}
        />

        <header ref={headerRef} className="absolute top-0 inset-x-0 z-10 flex items-center gap-4 pl-7 pr-5 py-4" style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="flex items-center gap-1">
            <Text as="span" size="xs">◫</Text>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost">file <span aria-hidden="true">▾</span></Button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuItem shortcut="^n" disabled onSelect={() => {}}>new</MenuItem>
                <MenuItem shortcut="^o" onSelect={() => fileInputRef.current?.click()}>open</MenuItem>
                <MenuSeparator />
                <MenuItem shortcut="^s" onSelect={() => exportProject(storeCompat())}>save</MenuItem>
                <MenuItem shortcut="^⇧s" onSelect={() => saveProjectAs(storeCompat()).catch(console.error)}>save as</MenuItem>
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost">matrix <span aria-hidden="true">▾</span></Button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuRadioGroup aria-label="Preview target" value={previewTarget} onValueChange={v => {
                    if (v === 'left' || v === 'right' || v === 'both' || v === 'mirror')
                      designerStore.getState().setPreviewTarget(v);
                  }}>
                  <MenuRadioItem value="left">left</MenuRadioItem>
                  <MenuRadioItem value="right">right</MenuRadioItem>
                  <MenuRadioItem value="both">both</MenuRadioItem>
                  <MenuRadioItem value="mirror">mirror</MenuRadioItem>
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
          </div>
          <div className="flex-1 flex justify-center">
            <ProjectTitle />
          </div>
          <TransportControls />
        </header>

        <div className="h-full flex overflow-hidden">
          <aside aria-label="Color palette" className="flex-1 overflow-hidden flex items-start justify-end pl-4" style={{ paddingTop: topPad }}>
            <ColorPalette value={activeColor} onChange={pickColor} />
          </aside>

          <main className="px-10 flex-none overflow-y-auto">
            <div style={{ paddingTop: topPad }}>
              <PixelCanvas onCursorMove={(col, row) => setCursor({ col, row })} />
            </div>
          </main>

          <aside aria-label="Animation frames" className="flex-1 overflow-hidden flex flex-col">
            <FrameStrip topPadding={topPad} />
          </aside>
        </div>

        <footer ref={footerRef} className="absolute bottom-0 inset-x-0 z-10 flex items-center px-7 py-4 text-xs" style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="flex-1 flex items-center gap-4">
            <span>frame {activeFrameIdx + 1}</span>
            <span>row {cursor.row}</span>
            <span>col {cursor.col}</span>
          </div>
          <Text as="span" size="xs" variant="muted">drag to draw · ? for shortcuts</Text>
          <div className="flex-1 flex items-center justify-end gap-4">
            <LivePreviewToggle />
            <div className="flex items-center gap-2">
              <Button variant="ghost" aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]} onClick={() => designerStore.getState().setZoom(stepZoom(designerStore.getState().zoom, -1))}>-</Button>
              <Text as="span" size="xs">{zoom * 100}%</Text>
              <Button variant="ghost" aria-label="Zoom in" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => designerStore.getState().setZoom(stepZoom(designerStore.getState().zoom, 1))}>+</Button>
            </div>
            <Button variant="ghost" tooltip="shortcuts" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts"><span aria-hidden="true">???</span></Button>
          </div>
        </footer>

      </div>
    </TooltipProvider>
  );
}
