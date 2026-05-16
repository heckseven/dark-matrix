import { useState, useLayoutEffect, useRef, useEffect, useCallback } from 'react';
import { PixelCanvas, canvasComponentH } from './components/PixelCanvas.js';
import { FrameStrip } from './components/FrameStrip.js';
import { ColorPalette } from './components/ColorPalette.js';
import { usePreviewBridge } from './components/LivePreview.js';
import { Toggle } from './components/ui/toggle.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import { Text } from './components/ui/text.js';
import { Tooltip, TooltipProvider } from './components/ui/tooltip.js';
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from './components/ui/menu.js';
import { saveToLibrary, saveLibraryCopy, renameLibraryFile, exportProject, importFile, openFromLibrary } from './files.js';
import { useDesignerStore, designerStore, stepZoom, ZOOM_STEPS, ROWS, DEFAULT_WIDTH } from './store.js';
import type { AudioSource } from './store.js';
import { ShortcutDialog } from './components/ui/shortcut-dialog.js';
import { ModePicker } from './components/ModePicker.js';
import { AudioPanel } from './components/AudioPanel.js';
import { HudPanel, hudSendWsGlobal } from './components/HudPanel.js';
import type { HudPresetClient } from './types/hud-preset.js';

function storeCompat() {
  return { state: designerStore.getState(), loadProject: (p: unknown) => designerStore.getState().loadProject(p) };
}

function newProject() {
  const blank = btoa(String.fromCharCode(...new Uint8Array(DEFAULT_WIDTH * ROWS)));
  designerStore.getState().loadProject({ frames: [{ delayMs: 100, pixels: blank }], width: DEFAULT_WIDTH, mode: 'bw', loop: true });
  designerStore.getState().setProjectTitle('untitled_animation');
  designerStore.getState().setPreviewTarget('left');
  designerStore.getState().setLibraryPath(null);
  designerStore.setState({ zoom: 1 });
}

function ProjectTitle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const next = draft.trim() || 'untitled_animation';
    onChange(next);
    setDraft(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button
      className="font-mono text-xs text-foreground bg-transparent border-none cursor-text hover:opacity-70 transition-opacity"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {value}
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

function LivePreviewToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Toggle pressed={on} onPressedChange={onToggle} pressedLabel="live preview: on">
      live preview: off
    </Toggle>
  );
}

export function App() {
  const activeColor = useDesignerStore(s => s.activeColor);
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);
  const zoom = useDesignerStore(s => s.zoom);
  const mode = useDesignerStore(s => s.mode);
  const previewTarget = useDesignerStore(s => s.previewTarget);
  const projectTitle = useDesignerStore(s => s.projectTitle);
  const activeMode = useDesignerStore(s => s.activeMode);
  const audioSource = useDesignerStore(s => s.audioSource);
  const libraryPath = useDesignerStore(s => s.libraryPath);
  const recentFiles = useDesignerStore(s => s.recentFiles);
  const hudPresets         = useDesignerStore(s => s.hudPresets);
  const selectedPresetName = useDesignerStore(s => s.selectedPresetName);
  const selectedPreset     = hudPresets.find(p => p.name === selectedPresetName) ?? null;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [livePreviewOn, setLivePreviewOn] = useState(false);
  const bridge = usePreviewBridge();
  const hudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [topPad, setTopPad] = useState(0);
  const [bottomPad, setBottomPad] = useState(0);
  const [modules, setModules] = useState({ left: true, right: true });
  const dualModule = modules.left && modules.right;
  const dualModuleRef = useRef(true);
  dualModuleRef.current = dualModule;

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch('/api/modules');
        if (r.ok && alive) setModules(await r.json() as { left: boolean; right: boolean });
      } catch { /* daemon not reachable */ }
    };
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const h = containerRef.current?.clientHeight ?? 0;
      const hh = headerRef.current?.offsetHeight ?? 0;
      const fh = footerRef.current?.offsetHeight ?? 0;
      const usable = h - hh - fh;
      setTopPad(hh + Math.max(0, Math.round((usable - canvasComponentH(zoom)) / 2)));
      setBottomPad(fh);
    };
    update();
    const ro = new ResizeObserver(update);
    [containerRef, headerRef, footerRef].forEach(r => { if (r.current) ro.observe(r.current); });
    return () => ro.disconnect();
  }, [zoom, activeMode]);

  const toggleShortcuts = useCallback(() => setShortcutsOpen(v => !v), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && !(e.target instanceof HTMLCanvasElement)) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); designerStore.getState().undo(); }
        else if (e.key === 'y' || (e.key === 'Z' && e.shiftKey)) { e.preventDefault(); designerStore.getState().redo(); }
        else if (e.key === 's' && !e.shiftKey) {
          e.preventDefault();
          const { projectTitle: t } = designerStore.getState();
          saveToLibrary(storeCompat(), t)
            .then(name => { designerStore.getState().setLibraryPath(name); designerStore.getState().addRecentFile(name); })
            .catch(console.error);
        }
        else if (e.key === 'S' && e.shiftKey) {
          e.preventDefault();
          const { projectTitle: t } = designerStore.getState();
          saveLibraryCopy(storeCompat(), t)
            .then(copyName => {
              designerStore.getState().setProjectTitle(copyName);
              designerStore.getState().setLibraryPath(copyName);
              designerStore.getState().addRecentFile(copyName);
            })
            .catch(console.error);
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case '?': e.preventDefault(); toggleShortcuts(); break;
        case 'n': case 'N': {
          e.preventDefault();
          const { activeFrameIdx: afi } = designerStore.getState();
          designerStore.getState().addFrame(afi);
          break;
        }
        case 'l': case 'L': if (dualModuleRef.current) { e.preventDefault(); designerStore.getState().setPreviewTarget('left'); } break;
        case 'r': case 'R': if (dualModuleRef.current) { e.preventDefault(); designerStore.getState().setPreviewTarget('right'); } break;
        case 'b': case 'B': if (dualModuleRef.current) { e.preventDefault(); designerStore.getState().setPreviewTarget('both'); } break;
        case 'm': case 'M': if (dualModuleRef.current) { e.preventDefault(); designerStore.getState().setPreviewTarget('mirror'); } break;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleShortcuts]);

  function pickColor(v: number) {
    designerStore.getState().setActiveColor(v);
    designerStore.getState().setMode(v === 0 || v === 255 ? 'bw' : 'gray');
  }

  // ── HUD header helpers ────────────────────────────────────────────────

  function hudDebouncedSave() {
    if (hudSaveTimerRef.current) clearTimeout(hudSaveTimerRef.current);
    hudSaveTimerRef.current = setTimeout(() => {
      hudSendWsGlobal({ type: 'hud-preset-save', presets: designerStore.getState().hudPresets });
    }, 800);
  }

  function hudCreatePreset() {
    const ts = Date.now().toString(36);
    const preset: HudPresetClient = {
      name: `preset-${ts}`,
      left:  { widget: 'clock', face: 'elegant' },
      right: { widget: 'clock', face: 'elegant' },
    };
    designerStore.getState().createPreset(preset);
    hudDebouncedSave();
  }

  function hudDuplicate() {
    if (!selectedPreset) return;
    const copy: HudPresetClient = { ...selectedPreset, name: `${selectedPreset.name} copy` };
    designerStore.getState().createPreset(copy);
    hudDebouncedSave();
  }

  function hudDelete() {
    if (!selectedPreset) return;
    designerStore.getState().deletePreset(selectedPreset.name);
    hudDebouncedSave();
  }

  function hudSetActive() {
    if (!selectedPreset) return;
    hudSendWsGlobal({ type: 'hud-preset-activate', name: selectedPreset.name });
  }

  function hudRenameSelected(newName: string) {
    if (!selectedPreset) return;
    const old = selectedPreset.name;
    designerStore.getState().renamePreset(old, newName);
    hudDebouncedSave();
  }

  return (
    <TooltipProvider>
      <ShortcutDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} dualModule={dualModule} />
      {modePickerOpen && (
        <ModePicker
          activeMode={activeMode}
          dualModule={dualModule}
          onSelect={m => designerStore.getState().setActiveMode(m)}
          onClose={() => setModePickerOpen(false)}
        />
      )}
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
            if (file) {
              importFile(file, storeCompat()).then(() => {
                const title = file.name.replace(/\.dmx\.json$/i, '').replace(/\.json$/i, '');
                if (title) {
                  designerStore.getState().setProjectTitle(title);
                  designerStore.getState().addRecentFile(title);
                }
                designerStore.getState().setLibraryPath(null);
              }).catch(console.error);
            }
            e.target.value = '';
          }}
        />

        <header ref={headerRef} className="absolute top-0 inset-x-0 z-10 flex items-center gap-4 pl-7 pr-5 py-4" style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          {activeMode === 'hud' ? (
            <>
              <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
              <div className="absolute inset-x-0 flex justify-center pointer-events-none">
                <div className="pointer-events-auto">
                  {selectedPreset ? (
                    <ProjectTitle
                      value={selectedPreset.name}
                      onChange={hudRenameSelected}
                    />
                  ) : (
                    <span className="font-mono text-xs text-foreground/40">no preset selected</span>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" onClick={hudCreatePreset}>+ new</Button>
                <Button variant="ghost" disabled={!selectedPreset} onClick={hudDuplicate}>duplicate</Button>
                <Button variant="ghost" disabled={!selectedPreset} onClick={hudDelete}>delete</Button>
                <Button variant="ghost" disabled={!selectedPreset} onClick={hudSetActive}>set active</Button>
              </div>
            </>
          ) : activeMode === 'audio' ? (
            <>
              <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
              <div className="absolute inset-x-0 flex justify-center pointer-events-none">
                <span className="font-mono text-xs text-foreground">audio</span>
              </div>
              <div className="ml-auto flex items-center gap-0 font-mono text-xs border border-foreground/30">
                {(['monitor', 'mic'] as const satisfies AudioSource[]).map((src) => (
                  <button
                    key={src}
                    aria-pressed={audioSource === src}
                    className={`px-4 py-1 transition-colors ${audioSource === src ? 'bg-foreground text-background' : 'text-foreground/60 hover:text-foreground'}`}
                    onClick={() => designerStore.getState().setAudioSource(src)}
                  >
                    {src}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost">file <span aria-hidden="true">▾</span></Button>
                  </MenuTrigger>
                  <MenuContent align="start">
                    <MenuItem onSelect={newProject}>new</MenuItem>
                    <MenuItem onSelect={() => fileInputRef.current?.click()}>open</MenuItem>
                    {recentFiles.length > 0 && (
                      <MenuSub>
                        <MenuSubTrigger>open recent</MenuSubTrigger>
                        <MenuSubContent>
                          {recentFiles.map(name => (
                            <MenuItem key={name} onSelect={() => {
                              openFromLibrary(name)
                                .then(project => {
                                  designerStore.getState().loadProject(project);
                                  designerStore.getState().setProjectTitle(name);
                                  designerStore.getState().setLibraryPath(name);
                                  designerStore.getState().addRecentFile(name);
                                })
                                .catch(console.error);
                            }}>{name}</MenuItem>
                          ))}
                        </MenuSubContent>
                      </MenuSub>
                    )}
                    <MenuSeparator />
                    <MenuItem shortcut="^s" onSelect={() => {
                      saveToLibrary(storeCompat(), projectTitle)
                        .then(name => {
                          designerStore.getState().setLibraryPath(name);
                          designerStore.getState().addRecentFile(name);
                        })
                        .catch(console.error);
                    }}>save</MenuItem>
                    <MenuItem shortcut="^S" onSelect={() => {
                      saveLibraryCopy(storeCompat(), projectTitle)
                        .then(copyName => {
                          designerStore.getState().setProjectTitle(copyName);
                          designerStore.getState().setLibraryPath(copyName);
                          designerStore.getState().addRecentFile(copyName);
                        })
                        .catch(console.error);
                    }}>duplicate</MenuItem>
                    <MenuSeparator />
                    <MenuItem onSelect={() => exportProject(storeCompat(), projectTitle)}>export</MenuItem>
                  </MenuContent>
                </Menu>
                {dualModule && (
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
                )}
              </div>
              <div className="absolute inset-x-0 flex justify-center pointer-events-none">
                <div className="pointer-events-auto">
                  <ProjectTitle value={projectTitle} onChange={v => {
                    const { libraryPath: lp } = designerStore.getState();
                    designerStore.getState().setProjectTitle(v);
                    if (lp !== null) {
                      const normalized = designerStore.getState().projectTitle;
                      renameLibraryFile(lp, normalized)
                        .then(newName => designerStore.getState().setLibraryPath(newName))
                        .catch(console.error);
                    }
                  }} />
                </div>
              </div>
              <div className="flex-1" />
              <TransportControls />
            </>
          )}
        </header>

        {activeMode === 'hud' ? (
          <div className="h-full flex">
            <HudPanel dualModule={dualModule} />
          </div>
        ) : activeMode === 'audio' ? (
          <div className="h-full flex">
            <AudioPanel dualModule={dualModule} />
          </div>
        ) : (
          <div className="h-full grid overflow-hidden" style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}>
            <aside aria-label="Color palette" className="overflow-hidden flex items-start justify-end pl-4" style={{ paddingTop: topPad }}>
              <ColorPalette value={activeColor} onChange={pickColor} />
            </aside>

            <main className="px-10 overflow-y-auto">
              <div style={{ paddingTop: topPad }}>
                <PixelCanvas onCursorMove={(col, row) => setCursor({ col, row })} />
              </div>
            </main>

            <aside aria-label="Animation frames" className="overflow-hidden flex flex-col">
              <FrameStrip topPadding={topPad} bottomPadding={bottomPad} />
            </aside>
          </div>
        )}

        {activeMode !== 'audio' && activeMode !== 'hud' && <footer ref={footerRef} className="absolute bottom-0 inset-x-0 z-10 flex items-center px-7 py-4 text-xs" style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="flex-1 flex items-center gap-4">
            <span>frame {activeFrameIdx + 1}</span>
            <span>row {cursor.row}</span>
            <span>col {cursor.col}</span>
          </div>
          {livePreviewOn && mode === 'gray'
            ? <Text as="span" size="xs" className="text-red-500">degraded live preview when using grey values</Text>
            : <Text as="span" size="xs" variant="muted">drag to draw · ? for shortcuts</Text>
          }
          <div className="flex-1 flex items-center justify-end gap-4">
            <LivePreviewToggle on={livePreviewOn} onToggle={() => {
              if (livePreviewOn) { bridge.stop(); setLivePreviewOn(false); }
              else { bridge.start(); setLivePreviewOn(true); }
            }} />
            <div className="flex items-center gap-2">
              <Button variant="ghost" aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]} onClick={() => designerStore.getState().setZoom(stepZoom(designerStore.getState().zoom, -1))}>-</Button>
              <Text as="span" size="xs">{zoom * 100}%</Text>
              <Button variant="ghost" aria-label="Zoom in" disabled={zoom >= (ZOOM_STEPS.at(-1) ?? Infinity)} onClick={() => designerStore.getState().setZoom(stepZoom(designerStore.getState().zoom, 1))}>+</Button>
            </div>
            <Button variant="ghost" tooltip="shortcuts" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts"><span aria-hidden="true">???</span></Button>
          </div>
        </footer>}

      </div>
    </TooltipProvider>
  );
}
