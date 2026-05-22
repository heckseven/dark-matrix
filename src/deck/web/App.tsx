import { useState, useLayoutEffect, useRef, useEffect, useCallback } from 'react';
import { PixelCanvas, canvasComponentH } from './components/PixelCanvas.js';
import { FrameStrip } from './components/FrameStrip.js';
import { ColorPalette } from './components/ColorPalette.js';
import { usePreviewBridge } from './components/LivePreview.js';
import { Toggle } from './components/ui/toggle.js';
import { Button } from './components/ui/button.js';
import { Slider } from './components/ui/slider.js';
import { Input } from './components/ui/input.js';
import { ScrubInput } from './components/ui/scrub-input.js';
import { Text } from './components/ui/text.js';
import { Tooltip, TooltipProvider } from './components/ui/tooltip.js';
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from './components/ui/menu.js';
import { saveToLibrary, saveLibraryCopy, renameLibraryFile, exportProject, importFile, openFromLibrary } from './files.js';
import { useDeckStore, deckStore, stepZoom, ZOOM_STEPS, ROWS, DEFAULT_WIDTH } from './store.js';
import { ShortcutDialog } from './components/ui/shortcut-dialog.js';
import { ModePicker } from './components/ModePicker.js';
import { MODES } from './app-modes.js';
import type { AppMode } from './app-modes.js';
import { AudioPanel } from './components/AudioPanel.js';
import { ConfigPanel } from './components/ConfigPanel.js';
import { HudPanel, hudSendWsGlobal } from './components/HudPanel.js';
import { VideoPanel, VideoHeader, VideoTransportControls, VideoSettingsToggle } from './components/VideoPanel.js';
import { LifePanel, lifeTriggerSave } from './components/LifePanel.js';

const MODE_LABEL = Object.fromEntries(MODES.map(m => [m.id, m.label])) as Record<AppMode, string>;

function storeCompat() {
  return { state: deckStore.getState(), loadProject: (p: unknown) => deckStore.getState().loadProject(p) };
}

function newProject() {
  const blank = btoa(String.fromCharCode(...new Uint8Array(DEFAULT_WIDTH * ROWS)));
  deckStore.getState().loadProject({ frames: [{ delayMs: 100, pixels: blank }], width: DEFAULT_WIDTH, mode: 'bw', loop: true });
  deckStore.getState().setProjectTitle('untitled_animation');
  deckStore.getState().setPreviewTarget('left');
  deckStore.getState().setLibraryPath(null);
  deckStore.setState({ zoom: 1 });
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
  const isPlaying = useDeckStore(s => s.isPlaying);
  const frames = useDeckStore(s => s.frames);
  const activeFrameIdx = useDeckStore(s => s.activeFrameIdx);
  const loop = useDeckStore(s => s.loop);

  useEffect(() => {
    if (!isPlaying) return;
    const delay = frames[activeFrameIdx]?.delayMs ?? 100;
    const id = setTimeout(() => {
      const next = activeFrameIdx + 1;
      if (next >= frames.length) {
        if (loop) deckStore.getState().setActiveFrame(0);
        else deckStore.getState().setPlaying(false);
      } else {
        deckStore.getState().setActiveFrame(next);
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
        onClick={() => { deckStore.getState().setPlaying(false); deckStore.getState().setActiveFrame(0); }}>
        {'|◁'}
      </Button>
      <Button variant="ghost" aria-label="Previous frame" tooltip="Previous frame"
        disabled={isPlaying || atFirst}
        onClick={() => { deckStore.getState().setPlaying(false); deckStore.getState().setActiveFrame(activeFrameIdx - 1); }}>
        ◁
      </Button>
      <Button variant="ghost" aria-label={isPlaying ? 'Pause' : 'Play'} tooltip={isPlaying ? 'Pause' : 'Play'}
        disabled={single} onClick={() => deckStore.getState().setPlaying(!isPlaying)}>
        <span className="inline-block w-[1em] text-center">{isPlaying ? '⏸' : '▶'}</span>
      </Button>
      <Button variant="ghost" aria-label="Next frame" tooltip="Next frame"
        disabled={isPlaying || atLast}
        onClick={() => { deckStore.getState().setPlaying(false); deckStore.getState().setActiveFrame(activeFrameIdx + 1); }}>
        ▷
      </Button>
      <Button variant="ghost" aria-label="Last frame" tooltip="Last frame"
        disabled={isPlaying || atLast}
        onClick={() => { deckStore.getState().setPlaying(false); deckStore.getState().setActiveFrame(frames.length - 1); }}>
        {'▷|'}
      </Button>
      <Tooltip content={`loop: ${loop ? 'on' : 'off'}`}>
        <Toggle className="ml-3"
          pressed={loop}
          onPressedChange={v => deckStore.getState().setLoop(v)}
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

function ConfigHeading() {
  const configDirty = useDeckStore(s => s.configDirty);
  const saveConfig = useDeckStore(s => s.saveConfig);

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {configDirty ? 'Config has unsaved changes' : ''}
      </div>
      <div className="absolute inset-x-0 flex justify-center pointer-events-none">
        <span className="flex items-center gap-2 font-mono text-xs text-foreground">
          config
          {configDirty && <span role="img" aria-label="unsaved changes" className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
        </span>
      </div>
      <Button
        variant="ghost"
        disabled={!configDirty}
        onClick={() => void saveConfig()}
        className="ml-auto"
      >
        save
      </Button>
    </>
  );
}

export function App() {
  const activeColor = useDeckStore(s => s.activeColor);
  const activeFrameIdx = useDeckStore(s => s.activeFrameIdx);
  const zoom = useDeckStore(s => s.zoom);
  const mode = useDeckStore(s => s.mode);
  const previewTarget = useDeckStore(s => s.previewTarget);
  const projectTitle = useDeckStore(s => s.projectTitle);
  const activeMode = useDeckStore(s => s.activeMode);
  const audioSource       = useDeckStore(s => s.audioSource);
  const micSensitivity    = useDeckStore(s => s.micSensitivity);
  const libraryPath = useDeckStore(s => s.libraryPath);
  const recentFiles = useDeckStore(s => s.recentFiles);
  const hudPresets         = useDeckStore(s => s.hudPresets);
  const selectedPresetName = useDeckStore(s => s.selectedPresetName);
  const hudSelectedSide    = useDeckStore(s => s.hudSelectedSide);
  const selectedPreset     = hudPresets.find(p => p.name === selectedPresetName) ?? null;
  const selectedBiomeName  = useDeckStore(s => s.selectedBiomeName);
  const lifeIsPlaying      = useDeckStore(s => s.lifeIsPlaying);
  const lifeStepCount      = useDeckStore(s => s.lifeStepCount);

  useEffect(() => {
    document.title = activeMode ? `dark-matrix - ${MODE_LABEL[activeMode]}` : 'dark-matrix';
  }, [activeMode]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [hudNeedsAudio, setHudNeedsAudio] = useState(false);
  const [clockOverrideH, setClockOverrideH] = useState(() => new Date().getHours());
  const [clockOverrideM, setClockOverrideM] = useState(() => new Date().getMinutes());
  const [clockFastForward, setClockFastForward] = useState(false);
  const [hudClocksVisible, setHudClocksVisible] = useState(false);
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
  const [headerHeight, setHeaderHeight] = useState(0);
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

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    let alive = true;
    const check = () => {
      md.enumerateDevices().then(devs => { if (alive) setHasMic(devs.some(d => d.kind === 'audioinput')); }).catch(() => {});
    };
    check();
    md.addEventListener('devicechange', check);
    return () => { alive = false; md.removeEventListener('devicechange', check); };
  }, []);

  const isClockSelected = activeMode === 'hud' && (selectedPreset?.[hudSelectedSide]?.widget === 'clock' || hudClocksVisible);

  useEffect(() => {
    if (!clockFastForward) return;
    const id = setInterval(() => {
      setClockOverrideM(m => {
        const next = (m + 1) % 60;
        if (next === 0) setClockOverrideH(h => (h + 1) % 24);
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [clockFastForward]);

  const clockNow = isClockSelected ? (() => {
    const d = new Date();
    d.setHours(clockOverrideH, clockOverrideM, 0, 0);
    return d;
  })() : undefined;

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const h = containerRef.current?.clientHeight ?? 0;
      const hh = headerRef.current?.offsetHeight ?? 0;
      const fh = footerRef.current?.offsetHeight ?? 0;
      const usable = h - hh - fh;
      setTopPad(hh + Math.max(0, Math.round((usable - canvasComponentH(zoom)) / 2)));
      setBottomPad(fh);
      setHeaderHeight(hh);
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
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); deckStore.getState().undo(); }
        else if (e.key === 'y' || (e.key === 'Z' && e.shiftKey)) { e.preventDefault(); deckStore.getState().redo(); }
        else if (e.key === 's' && !e.shiftKey) {
          e.preventDefault();
          const { projectTitle: t } = deckStore.getState();
          saveToLibrary(storeCompat(), t)
            .then(name => { deckStore.getState().setLibraryPath(name); deckStore.getState().addRecentFile(name); })
            .catch(console.error);
        }
        else if (e.key === 'S' && e.shiftKey) {
          e.preventDefault();
          const { projectTitle: t } = deckStore.getState();
          saveLibraryCopy(storeCompat(), t)
            .then(copyName => {
              deckStore.getState().setProjectTitle(copyName);
              deckStore.getState().setLibraryPath(copyName);
              deckStore.getState().addRecentFile(copyName);
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
          const { activeFrameIdx: afi } = deckStore.getState();
          deckStore.getState().addFrame(afi);
          break;
        }
        case 'l': case 'L': if (dualModuleRef.current) { e.preventDefault(); deckStore.getState().setPreviewTarget('left'); } break;
        case 'r': case 'R': if (dualModuleRef.current) { e.preventDefault(); deckStore.getState().setPreviewTarget('right'); } break;
        case 'b': case 'B': if (dualModuleRef.current) { e.preventDefault(); deckStore.getState().setPreviewTarget('both'); } break;
        case 'm': case 'M': if (dualModuleRef.current) { e.preventDefault(); deckStore.getState().setPreviewTarget('mirror'); } break;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleShortcuts]);

  function pickColor(v: number) {
    deckStore.getState().setActiveColor(v);
    deckStore.getState().setMode(v === 0 || v === 255 ? 'bw' : 'gray');
  }

  // ── HUD header helpers ────────────────────────────────────────────────

  function hudDebouncedSave() {
    if (hudSaveTimerRef.current) clearTimeout(hudSaveTimerRef.current);
    hudSaveTimerRef.current = setTimeout(() => {
      hudSendWsGlobal({ type: 'hud-preset-save', presets: deckStore.getState().hudPresets });
    }, 800);
  }

  function hudRenameSelected(newName: string) {
    if (!selectedPreset) return;
    const old = selectedPreset.name;
    deckStore.getState().renamePreset(old, newName);
    hudDebouncedSave();
  }

  if (activeMode === null) {
    return (
      <TooltipProvider>
        <ModePicker
          activeMode={null}
          dualModule={dualModule}
          onSelect={m => deckStore.getState().setActiveMode(m)}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <ShortcutDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} dualModule={dualModule} />
      {modePickerOpen && (
        <ModePicker
          activeMode={activeMode}
          dualModule={dualModule}
          onSelect={m => { deckStore.getState().setActiveMode(m); setModePickerOpen(false); }}
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
                  deckStore.getState().setProjectTitle(title);
                  deckStore.getState().addRecentFile(title);
                }
                deckStore.getState().setLibraryPath(null);
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
                    <span className="font-mono text-xs text-muted-foreground">no preset selected</span>
                  )}
                </div>
              </div>
              {(isClockSelected || (hasMic && hudNeedsAudio)) && (
                <div className="ml-auto flex items-center gap-2">
                  {isClockSelected && (
                    <>
                      <ScrubInput
                        aria-label="Clock hours"
                        value={clockOverrideH}
                        min={0}
                        max={23}
                        onChange={setClockOverrideH}
                      />
                      <ScrubInput
                        aria-label="Clock minutes"
                        value={clockOverrideM}
                        min={0}
                        max={59}
                        onChange={setClockOverrideM}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Reset to current time"
                        onClick={() => { const n = new Date(); setClockOverrideH(n.getHours()); setClockOverrideM(n.getMinutes()); }}
                      >
                        now
                      </Button>
                      <Tooltip content="fast forward">
                        <Toggle
                          pressed={clockFastForward}
                          onPressedChange={setClockFastForward}
                          aria-label="Fast forward clock"
                        >
                          <span aria-hidden="true">»</span>
                        </Toggle>
                      </Tooltip>
                    </>
                  )}
                  {isClockSelected && hasMic && hudNeedsAudio && (
                    <span aria-hidden="true" className="w-px h-4 bg-foreground/20" />
                  )}
                  {hasMic && hudNeedsAudio && (
                    <Toggle
                      pressed={audioSource === 'mic'}
                      onPressedChange={(on) => deckStore.getState().setAudioSource(on ? 'mic' : 'monitor')}
                      title={audioSource === 'mic' ? 'Disable mic' : 'Enable mic'}
                      aria-label={audioSource === 'mic' ? 'Disable mic' : 'Enable mic'}
                    >
                      <span aria-hidden="true">mic</span>
                    </Toggle>
                  )}
                </div>
              )}
            </>
          ) : activeMode === 'config' ? (
            <>
              <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
              <ConfigHeading />
            </>
          ) : activeMode === 'audio' ? (
            <>
              <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
              <div className="absolute inset-x-0 flex justify-center pointer-events-none">
                <span className="font-mono text-xs text-foreground">audio</span>
              </div>
              {hasMic && (
                <div className="ml-auto flex items-center gap-2">
                  {audioSource === 'mic' && (
                    <Slider
                      aria-label="Mic sensitivity"
                      value={micSensitivity}
                      min={0}
                      max={100}
                      className="w-36"
                      onChange={e => deckStore.getState().setMicSensitivity(Number(e.target.value))}
                    />
                  )}
                  <Toggle
                    pressed={audioSource === 'mic'}
                    onPressedChange={(on) => deckStore.getState().setAudioSource(on ? 'mic' : 'monitor')}
                    title={audioSource === 'mic' ? 'Disable mic' : 'Enable mic'}
                    aria-label={audioSource === 'mic' ? 'Disable mic' : 'Enable mic'}
                  >
                    <span aria-hidden="true">mic</span>
                  </Toggle>
                </div>
              )}
            </>
          ) : activeMode === 'video' ? (
            <>
              <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
              <VideoHeader />
              <div className="ml-auto flex items-center gap-1">
                <VideoTransportControls />
                <span className="w-4 shrink-0" aria-hidden="true" />
                <VideoSettingsToggle />
              </div>
            </>
          ) : activeMode === 'life' ? (
            <>
              <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
              <div className="absolute inset-x-0 flex justify-center pointer-events-none">
                <div className="pointer-events-auto">
                  {selectedBiomeName ? (
                    <ProjectTitle
                      value={selectedBiomeName}
                      onChange={newName => {
                        deckStore.getState().renameBiome(selectedBiomeName, newName);
                        lifeTriggerSave();
                      }}
                    />
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">no biome selected</span>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {selectedBiomeName && (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums w-12 text-right">{lifeStepCount}</span>
                )}
                <Button
                  variant="ghost"
                  aria-label="Step back"
                  tooltip="step back"
                  disabled={lifeIsPlaying || !selectedBiomeName}
                  onClick={() => deckStore.getState().stepLifeBack()}
                >
                  ◁
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Restart simulation"
                  tooltip="restart"
                  disabled={!selectedBiomeName}
                  onClick={() => deckStore.getState().restartLife()}
                >
                  ↺
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Step forward"
                  tooltip="step forward"
                  disabled={lifeIsPlaying || !selectedBiomeName}
                  onClick={() => deckStore.getState().stepLifeForward()}
                >
                  ▷
                </Button>
                <Button
                  variant="ghost"
                  aria-label={lifeIsPlaying ? 'Pause simulation' : 'Play simulation'}
                  tooltip={lifeIsPlaying ? 'pause' : 'play'}
                  disabled={!selectedBiomeName}
                  onClick={() => deckStore.getState().setLifePlaying(!lifeIsPlaying)}
                >
                  <span className="inline-block w-[1em] text-center">{lifeIsPlaying ? '⏸' : '▶'}</span>
                </Button>
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
                                  deckStore.getState().loadProject(project);
                                  deckStore.getState().setProjectTitle(name);
                                  deckStore.getState().setLibraryPath(name);
                                  deckStore.getState().addRecentFile(name);
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
                          deckStore.getState().setLibraryPath(name);
                          deckStore.getState().addRecentFile(name);
                        })
                        .catch(console.error);
                    }}>save</MenuItem>
                    <MenuItem shortcut="^S" onSelect={() => {
                      saveLibraryCopy(storeCompat(), projectTitle)
                        .then(copyName => {
                          deckStore.getState().setProjectTitle(copyName);
                          deckStore.getState().setLibraryPath(copyName);
                          deckStore.getState().addRecentFile(copyName);
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
                            deckStore.getState().setPreviewTarget(v);
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
                    const { libraryPath: lp } = deckStore.getState();
                    deckStore.getState().setProjectTitle(v);
                    if (lp !== null) {
                      const normalized = deckStore.getState().projectTitle;
                      renameLibraryFile(lp, normalized)
                        .then(newName => deckStore.getState().setLibraryPath(newName))
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
            <HudPanel dualModule={dualModule} topPad={headerHeight} onNeedsAudioChange={setHudNeedsAudio} onClocksVisibleChange={setHudClocksVisible} {...(clockNow !== undefined ? { clockNow } : {})} />
          </div>
        ) : activeMode === 'video' ? (
          <div className="h-full flex">
            <VideoPanel topPad={headerHeight} />
          </div>
        ) : activeMode === 'audio' ? (
          <div className="h-full flex">
            <AudioPanel dualModule={dualModule} />
          </div>
        ) : activeMode === 'config' ? (
          <div className="h-full flex">
            <ConfigPanel dualModule={dualModule} topPad={headerHeight} />
          </div>
        ) : activeMode === 'life' ? (
          <div className="h-full flex">
            <LifePanel topPad={headerHeight} dualModule={dualModule} />
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

        {activeMode !== 'audio' && activeMode !== 'hud' && activeMode !== 'config' && activeMode !== 'video' && activeMode !== 'life' && <footer ref={footerRef} className="absolute bottom-0 inset-x-0 z-10 flex items-center px-7 py-4 text-xs" style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
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
              <Button variant="ghost" aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]} onClick={() => deckStore.getState().setZoom(stepZoom(deckStore.getState().zoom, -1))}>-</Button>
              <Text as="span" size="xs">{zoom * 100}%</Text>
              <Button variant="ghost" aria-label="Zoom in" disabled={zoom >= (ZOOM_STEPS.at(-1) ?? Infinity)} onClick={() => deckStore.getState().setZoom(stepZoom(deckStore.getState().zoom, 1))}>+</Button>
            </div>
            <Button variant="ghost" tooltip="shortcuts" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts"><span aria-hidden="true">???</span></Button>
          </div>
        </footer>}

      </div>
    </TooltipProvider>
  );
}
