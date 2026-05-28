import { useState, useLayoutEffect, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { PixelCanvas, canvasComponentH } from './components/PixelCanvas.js';
import { FrameStrip } from './components/FrameStrip.js';
import { ColorPalette } from './components/ColorPalette.js';
import { usePreviewBridge } from './components/LivePreview.js';
import { Toggle } from './components/ui/toggle.js';
import { Button } from './components/ui/button.js';
import { Slider } from './components/ui/slider.js';
import { Input } from './components/ui/input.js';
import { TimeInput } from './components/ui/time-input.js';
import { Text } from './components/ui/text.js';
import { Tooltip, TooltipProvider } from './components/ui/tooltip.js';
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from './components/ui/menu.js';
import { saveToLibrary, saveLibraryCopy, renameLibraryFile, exportProject, openFromLibrary } from './files.js';
import { useDeckStore, deckStore, stepZoom, ZOOM_STEPS, ROWS, DEFAULT_WIDTH } from './store.js';
import { ShortcutDialog } from './components/ui/shortcut-dialog.js';
import { ModePicker } from './components/ModePicker.js';
import { MODES } from './app-modes.js';
import type { AppMode } from './app-modes.js';
import { AudioPanel } from './components/AudioPanel.js';
import type { AudioStyle } from './store.js';
import type { Config } from './types/config-types.js';
import { applyTheme } from './lib/theme.js';
import { AUDIO_STYLES } from '../../animations/audio-renderers.js';
import { LIFE_ALGORITHMS } from '../../animations/gol.js';
import { ConfigPanel } from './components/ConfigPanel.js';
import { HudPanel, hudSendWsGlobal } from './components/HudPanel.js';
import { VideoPanel, VideoHeader, VideoTransportControls, VideoSettingsToggle, useVStore } from './components/VideoPanel.js';
import { LifePanel, lifeTriggerSave } from './components/LifePanel.js';
import { AssetManagerModal } from './components/AssetManagerModal.js';
import { ThreePanelLayout } from './components/ThreePanelLayout.js';
import { PanelBar } from './components/PanelBar.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { CastPanel } from './components/CastPanel.js';
import { Dialog, DialogContent, DialogTitle, DialogClose } from './components/ui/dialog.js';
import { Popover, PopoverTrigger, PopoverContent } from './components/ui/popover.js';

const MODE_LABEL = Object.fromEntries(MODES.map(m => [m.id, m.label])) as Record<AppMode, string>;
const FULLSCREEN_MODES: ReadonlySet<AppMode> = new Set(['hud', 'audio', 'config', 'video', 'life', 'cast']);
const isFullscreenMode = (m: AppMode | null) => m !== null && FULLSCREEN_MODES.has(m);
const MAX_GAIN_BOOST = 7; // 0% → 1×, 100% → 8×

function idleFadeStyle(idle: boolean): CSSProperties {
  return {
    opacity: idle ? 0 : 1,
    transition: idle ? 'opacity 300ms' : 'opacity 0ms',
    ...(idle ? { pointerEvents: 'none' as const } : {}),
  };
}

function storeCompat() {
  return { state: deckStore.getState(), loadProject: (p: unknown) => deckStore.getState().loadProject(p) };
}

function applyOpenAsset(name: string, project: unknown) {
  const baseName = name.replace(/\.dmx\.json$/i, '');
  const s = deckStore.getState();
  s.loadProject(project);
  s.setProjectTitle(baseName);
  s.setLibraryPath(baseName);
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

function StatusChip({ icon, label, srSuffix, colorClass, onClick }: {
  icon: string;
  label: string;
  srSuffix: string;
  colorClass: 'text-amber-400' | 'text-red-400' | 'text-orange-400';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`font-mono text-xs px-1 py-0.5 hover:opacity-70 transition-opacity ${colorClass}`}
      onClick={onClick}
    >
      <span aria-hidden="true">(</span><span aria-hidden="true">{icon}</span> {label}<span className="sr-only">{srSuffix}</span><span aria-hidden="true">)</span>
    </button>
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
  const audioSource        = useDeckStore(s => s.audioSource);
  const micSensitivity     = useDeckStore(s => s.micSensitivity);
  const monitorSensitivity = useDeckStore(s => s.monitorSensitivity);
  const sensitivity        = audioSource === 'mic' ? micSensitivity : monitorSensitivity;
  const libraryPath = useDeckStore(s => s.libraryPath);
  const recentFiles = useDeckStore(s => s.recentFiles);
  const hudPresets         = useDeckStore(s => s.hudPresets);
  const selectedPresetName = useDeckStore(s => s.selectedPresetName);
  const hudSelectedSide    = useDeckStore(s => s.hudSelectedSide);
  const selectedPreset     = hudPresets.find(p => p.name === selectedPresetName) ?? null;
  const selectedBiomeName  = useDeckStore(s => s.selectedBiomeName);
  const biomePresets       = useDeckStore(s => s.biomePresets);
  const lifeIsPlaying      = useDeckStore(s => s.lifeIsPlaying);
  const lifeStepCount      = useDeckStore(s => s.lifeStepCount);
  const configDirty        = useDeckStore(s => s.configDirty);
  const saveConfig         = useDeckStore(s => s.saveConfig);
  const isTwitchConnected  = useDeckStore(s => !!(s.configData?.twitch?.broadcaster_id));
  const videoIdle          = useVStore(s => s.idle);
  const appearance         = useDeckStore(s => s.configData?.appearance);

  const themeCleanupRef = useRef<() => void>(() => {});

  const [configLoading, setConfigLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<{ config: Config }> : Promise.reject(new Error(`/api/config HTTP ${r.status}`)))
      .then(({ config }) => {
        deckStore.getState().loadConfigData(config);
        themeCleanupRef.current();
        themeCleanupRef.current = applyTheme(config.appearance);
      })
      .catch(err => { if ((err as Error).name !== 'AbortError') console.error(err); })
      .finally(() => setConfigLoading(false));
    return () => { controller.abort(); themeCleanupRef.current(); };
  }, []);

  useEffect(() => {
    themeCleanupRef.current();
    themeCleanupRef.current = applyTheme(appearance);
  }, [appearance]);

  useEffect(() => {
    document.title = activeMode ? `dark-matrix - ${MODE_LABEL[activeMode]}` : 'dark-matrix';
    if (activeMode !== 'audio') setAudioFullscreenStyle(null);
  }, [activeMode]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [audioFullscreenStyle, setAudioFullscreenStyle] = useState<AudioStyle | null>(null);
  const [audioIdle, setAudioIdle] = useState(false);
  const gainMultiplierRef = useRef<number>(1 + (sensitivity / 100) * MAX_GAIN_BOOST);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const shouldHide = (activeMode === 'video' && videoIdle) || (activeMode === 'audio' && audioFullscreenStyle !== null && audioIdle);
    if (shouldHide) {
      if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      el.setAttribute('inert', '');
    } else {
      el.removeAttribute('inert');
    }
  }, [activeMode, videoIdle, audioIdle, audioFullscreenStyle]);
  const [assetManagerOpen, setAssetManagerOpen] = useState(false);
  const [assetImportOpen, setAssetImportOpen] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [hudNeedsAudio, setHudNeedsAudio] = useState(false);
  const [clockOverrideH, setClockOverrideH] = useState(() => new Date().getHours());
  const [clockOverrideM, setClockOverrideM] = useState(() => new Date().getMinutes());
  const [clockFastForward, setClockFastForward] = useState(false);
  const [hudClocksVisible, setHudClocksVisible] = useState(false);
  const [castAudioOpen, setCastAudioOpen] = useState(false);
  const [livePreviewOn, setLivePreviewOn] = useState(false);
  const bridge = usePreviewBridge();
  const hudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const [lifeCursor, setLifeCursor] = useState<{ col: number; row: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const settingsToggleRef = useRef<HTMLButtonElement>(null);
  const [topPad, setTopPad] = useState(0);
  const [bottomPad, setBottomPad] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [modules, setModules] = useState({ left: true, right: true });
  const [daemonOnline, setDaemonOnline] = useState(true);
  const [uncalibrated, setUncalibrated] = useState(false);
  const forceWelcome = new URLSearchParams(window.location.search).has('welcome');
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const showWelcome = (uncalibrated || forceWelcome) && !welcomeDismissed;
  const dualModule = modules.left && modules.right;
  const dualModuleRef = useRef(true);
  dualModuleRef.current = dualModule;

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch('/api/modules');
        if (!r.ok || !alive) return;
        const data = await r.json() as { left: boolean; right: boolean; daemonOnline?: boolean; uncalibrated?: boolean; micSwitchOn?: boolean };
        setModules({ left: data.left, right: data.right });
        setDaemonOnline(data.daemonOnline ?? true);
        setUncalibrated(data.uncalibrated ?? false);
        if (data.micSwitchOn !== undefined) setHasMic(data.micSwitchOn);
      } catch { /* deck server unreachable */ }
    };
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!hasMic && deckStore.getState().audioSource === 'mic') {
      deckStore.getState().setAudioSource('monitor');
    }
  }, [hasMic]);

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
        case ' ': {
          const s = deckStore.getState();
          if (s.activeMode === 'life' && !(e.target instanceof HTMLCanvasElement) && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) {
            e.preventDefault();
            s.setLifePlaying(!s.lifeIsPlaying);
          }
          break;
        }
        case '[':
          if (deckStore.getState().activeMode === 'life') {
            e.preventDefault();
            deckStore.getState().stepLifeBack();
          }
          break;
        case ']':
          if (deckStore.getState().activeMode === 'life') {
            e.preventDefault();
            deckStore.getState().stepLifeForward();
          }
          break;
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

  const lifeSelectedBiome = biomePresets.find(b => b.name === selectedBiomeName) ?? null;
  const lifeAlgoEntry = lifeSelectedBiome ? LIFE_ALGORITHMS[lifeSelectedBiome.algorithm] : null;
  const lifeAlgoNotation = lifeAlgoEntry
    ? `B${lifeAlgoEntry.birth.join('')}/S${lifeAlgoEntry.survival.join('')}`
    : null;

  const statusChip = (
    <div aria-live="polite" aria-atomic="true">
      {uncalibrated ? (
        <StatusChip
          icon="⚠" label="Setup required" srSuffix=" — open setup guide"
          colorClass="text-amber-400"
          onClick={() => setWelcomeDismissed(false)}
        />
      ) : !daemonOnline ? (
        <StatusChip
          icon="✕" label="Daemon offline" srSuffix=" — open config"
          colorClass="text-red-400"
          onClick={() => deckStore.getState().setActiveMode('config')}
        />
      ) : !modules.left && !modules.right ? (
        <StatusChip
          icon="○" label="No hardware" srSuffix=" — open config"
          colorClass="text-orange-400"
          onClick={() => deckStore.getState().setActiveMode('config')}
        />
      ) : null}
    </div>
  );

  return (
    <TooltipProvider>
      <ShortcutDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} dualModule={dualModule} mode={activeMode === 'life' ? 'life' : 'design'} />
      <Dialog open={castAudioOpen} onOpenChange={setCastAudioOpen}>
        <DialogContent className="w-[calc(100vw-80px)] h-[calc(100vh-80px)] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogTitle className="sr-only">Audio visualizer</DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="sm"
              tooltip="Close"
              aria-label="Close audio visualizer"
              className="absolute top-2 right-2 z-10"
            >
              ×
            </Button>
          </DialogClose>
          <AudioPanel dualModule={dualModule} />
        </DialogContent>
      </Dialog>
      <AssetManagerModal
        open={assetManagerOpen}
        onOpenChange={setAssetManagerOpen}
        onOpenAsset={(name, project) => {
          applyOpenAsset(name, project);
          setAssetManagerOpen(false);
        }}
      />
      <AssetManagerModal
        open={assetImportOpen}
        onOpenChange={setAssetImportOpen}
        initialView="import"
        onOpenAsset={(name, project) => {
          applyOpenAsset(name, project);
          deckStore.getState().setActiveMode('design');
          setAssetImportOpen(false);
        }}
      />
      {modePickerOpen && (
        <ModePicker
          activeMode={activeMode}
          dualModule={dualModule}
          onSelect={m => { deckStore.getState().setActiveMode(m); setModePickerOpen(false); }}
          onClose={() => setModePickerOpen(false)}
        />
      )}
      <div ref={containerRef} aria-busy={configLoading} className="relative h-screen bg-background text-foreground font-mono">
        <PanelBar
          as="header"
          ref={headerRef}
          blur={false}
          className="absolute top-0 inset-x-0 z-20 gap-4 pl-7 pr-5 py-3"
          style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)', ...(activeMode === 'video' ? idleFadeStyle(videoIdle) : activeMode === 'audio' && audioFullscreenStyle !== null ? idleFadeStyle(audioIdle) : {}) }}
          left={
            !isFullscreenMode(activeMode) ? (
              <div className="flex items-center gap-1">
                <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
                {statusChip}
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost">file <span aria-hidden="true">▾</span></Button>
                  </MenuTrigger>
                  <MenuContent align="start">
                    <MenuItem onSelect={newProject}>new</MenuItem>
                    <MenuItem onSelect={() => setAssetManagerOpen(true)}>open</MenuItem>
                    <MenuItem onSelect={() => setAssetImportOpen(true)}>import</MenuItem>
                    {recentFiles.length > 0 && (
                      <MenuSub>
                        <MenuSubTrigger>open recent</MenuSubTrigger>
                        <MenuSubContent>
                          {recentFiles.map(name => (
                            <MenuItem key={name} onSelect={() => {
                              openFromLibrary(name)
                                .then(project => {
                                  applyOpenAsset(name, project);
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
                    <MenuItem onSelect={() => setAssetManagerOpen(true)}>manage assets</MenuItem>
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
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" tooltip="switch mode" aria-label="Mode picker" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen(v => !v)}>◫</Button>
                {statusChip}
              </div>
            )
          }
          center={
            activeMode === 'hud' ? (
              selectedPreset ? (
                <ProjectTitle value={selectedPreset.name} onChange={hudRenameSelected} />
              ) : (
                <span className="font-mono text-xs text-muted-foreground">no preset selected</span>
              )
            ) : activeMode === 'config' ? (
              <>
                <div aria-live="polite" aria-atomic="true" className="sr-only">
                  {configDirty ? 'Config has unsaved changes' : 'Config saved'}
                </div>
                <span className="flex items-center gap-2 font-mono text-xs text-foreground">
                  config
                  {configDirty && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
                </span>
              </>
            ) : activeMode === 'audio' ? (
              <span className="font-mono text-xs text-foreground">
                {AUDIO_STYLES.find(s => s.id === audioFullscreenStyle)?.label ?? 'audio'}
              </span>
            ) : activeMode === 'video' ? (
              <VideoHeader />
            ) : activeMode === 'life' ? (
              selectedBiomeName ? (
                <ProjectTitle
                  value={selectedBiomeName}
                  onChange={newName => {
                    deckStore.getState().renameBiome(selectedBiomeName, newName);
                    lifeTriggerSave();
                  }}
                />
              ) : (
                <span className="font-mono text-xs text-muted-foreground">no biome selected</span>
              )
            ) : activeMode === 'cast' ? (
              <span className="font-mono text-xs text-foreground">cast</span>
            ) : (
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
            )
          }
          right={
            activeMode === 'hud' ? (
              (isClockSelected || (hasMic && hudNeedsAudio)) ? (
                <div className="flex items-center gap-2">
                  {isClockSelected && (
                    <>
                      <TimeInput
                        aria-label="Preview time"
                        value={`${String(clockOverrideH).padStart(2, '0')}:${String(clockOverrideM).padStart(2, '0')}`}
                        onChange={v => {
                          const [hStr, mStr] = v.split(':');
                          const h = parseInt(hStr ?? '0', 10);
                          const m = parseInt(mStr ?? '0', 10);
                          setClockOverrideH(isNaN(h) ? 0 : h);
                          setClockOverrideM(isNaN(m) ? 0 : m);
                        }}
                      />
                      <Button variant="ghost" size="sm" aria-label="Reset to current time" onClick={() => { const n = new Date(); setClockOverrideH(n.getHours()); setClockOverrideM(n.getMinutes()); }}>
                        now
                      </Button>
                      <Tooltip content="fast forward">
                        <Toggle pressed={clockFastForward} onPressedChange={setClockFastForward} aria-label="Fast forward clock">
                          <span aria-hidden="true">»</span>
                        </Toggle>
                      </Tooltip>
                    </>
                  )}
                  {isClockSelected && hasMic && hudNeedsAudio && <span aria-hidden="true" className="w-px h-4 bg-foreground/20" />}
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
              ) : undefined
            ) : activeMode === 'config' ? (
              <Button variant="ghost" disabled={!configDirty} onClick={() => void saveConfig()}>save</Button>
            ) : activeMode === 'audio' ? (
              <div className="flex items-center gap-2">
                {audioFullscreenStyle !== null && (
                  <Button variant="ghost" size="sm" aria-label="Switch visualizer" onClick={() => setAudioFullscreenStyle(null)}>switch</Button>
                )}
                <Tooltip content={`${audioSource === 'mic' ? 'Mic' : 'Monitor'} sensitivity`} side="bottom">
                  <span>
                    <Slider
                      aria-label={`${audioSource === 'mic' ? 'Mic' : 'Monitor'} sensitivity`}
                      aria-valuetext={`${sensitivity}%`}
                      value={sensitivity}
                      min={0}
                      max={100}
                      step={1}
                      className="w-32"
                      valueLabel={`${sensitivity}%`}
                      onChange={e => {
                        const v = Number(e.target.value);
                        gainMultiplierRef.current = 1 + (v / 100) * MAX_GAIN_BOOST;
                        if (audioSource === 'mic') {
                          deckStore.getState().setMicSensitivity(v);
                        } else {
                          deckStore.getState().setMonitorSensitivity(v);
                        }
                      }}
                    />
                  </span>
                </Tooltip>
                {hasMic && (
                  <Toggle
                    pressed={audioSource === 'mic'}
                    onPressedChange={(on) => {
                      deckStore.getState().setAudioSource(on ? 'mic' : 'monitor');
                      gainMultiplierRef.current = 1 + ((on ? micSensitivity : monitorSensitivity) / 100) * MAX_GAIN_BOOST;
                    }}
                    title={audioSource === 'mic' ? 'Disable mic' : 'Enable mic'}
                    aria-label={audioSource === 'mic' ? 'Disable mic' : 'Enable mic'}
                  >
                    <span aria-hidden="true">mic</span>
                  </Toggle>
                )}
              </div>
            ) : activeMode === 'video' ? (
              <div className="flex items-center gap-1">
                <VideoTransportControls />
                <span className="w-4 shrink-0" aria-hidden="true" />
                <VideoSettingsToggle ref={settingsToggleRef} />
              </div>
            ) : activeMode === 'cast' ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  tooltip="Audio visualizer"
                  aria-label="Audio visualizer"
                  onClick={() => setCastAudioOpen(true)}
                >
                  visualizer
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={isTwitchConnected ? 'Twitch connected' : 'Twitch not connected'}
                    >
                      twitch
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isTwitchConnected ? 'bg-green-500' : 'bg-muted-foreground'}`}
                        aria-hidden="true"
                      />
                      <span>{isTwitchConnected ? 'connected' : 'not connected'}</span>
                    </div>
                    {!isTwitchConnected && (
                      <span className="text-muted-foreground">configure in Settings → Integrations</span>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            ) : activeMode === 'life' ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" aria-label="Step back" tooltip="step back" disabled={lifeIsPlaying || !selectedBiomeName} onClick={() => deckStore.getState().stepLifeBack()}>◁</Button>
                <Button variant="ghost" aria-label="Restart simulation" tooltip="restart" disabled={!selectedBiomeName} onClick={() => deckStore.getState().restartLife()}>↺</Button>
                <Button variant="ghost" aria-label="Step forward" tooltip="step forward" disabled={lifeIsPlaying || !selectedBiomeName} onClick={() => deckStore.getState().stepLifeForward()}>▷</Button>
                <Button variant="ghost" aria-label={lifeIsPlaying ? 'Pause simulation' : 'Play simulation'} tooltip={lifeIsPlaying ? 'pause' : 'play'} disabled={!selectedBiomeName} onClick={() => deckStore.getState().setLifePlaying(!lifeIsPlaying)}>
                  <span className="inline-block w-[1em] text-center">{lifeIsPlaying ? '⏸' : '▶'}</span>
                </Button>
              </div>
            ) : (
              <TransportControls />
            )
          }
        />

        {activeMode === 'hud' ? (
          <div className="h-full flex">
            <HudPanel dualModule={dualModule} topPad={headerHeight} onNeedsAudioChange={setHudNeedsAudio} onClocksVisibleChange={setHudClocksVisible} {...(clockNow !== undefined ? { clockNow } : {})} />
          </div>
        ) : activeMode === 'video' ? (
          <div className="h-full flex">
            <VideoPanel topPad={headerHeight} settingsToggleRef={settingsToggleRef} />
          </div>
        ) : activeMode === 'audio' ? (
          <div className="h-full flex">
            <AudioPanel dualModule={dualModule} fullscreenStyle={audioFullscreenStyle} onFullscreenChange={setAudioFullscreenStyle} onFullscreenIdleChange={setAudioIdle} gainMultiplierRef={gainMultiplierRef} />
          </div>
        ) : activeMode === 'config' ? (
          <div className="h-full flex">
            <ConfigPanel dualModule={dualModule} topPad={headerHeight} />
          </div>
        ) : activeMode === 'life' ? (
          <div className="h-full flex">
            <LifePanel topPad={headerHeight} bottomPad={bottomPad} dualModule={dualModule} onCursorMove={setLifeCursor} />
          </div>
        ) : activeMode === 'cast' ? (
          <div className="absolute inset-x-0 bottom-0 flex" style={{ top: headerHeight }}>
            <CastPanel />
          </div>
        ) : (
          <ThreePanelLayout
            leftLabel="Color palette"
            leftClassName="overflow-hidden flex items-start justify-end pl-4"
            leftStyle={{ paddingTop: topPad }}
            centerClassName="overflow-y-auto px-10"
            rightLabel="Animation frames"
            left={<ColorPalette value={activeColor} onChange={pickColor} />}
            center={<div style={{ paddingTop: topPad }}><PixelCanvas onCursorMove={(col, row) => setCursor({ col, row })} /></div>}
            right={<FrameStrip topPadding={topPad} bottomPadding={bottomPad} />}
          />
        )}

        {(!isFullscreenMode(activeMode) || activeMode === 'life') && <footer ref={footerRef} role="contentinfo" aria-label={activeMode === 'life' ? 'Simulation status' : 'Editor status'} className="absolute bottom-0 inset-x-0 z-10 flex items-center px-7 py-4 text-xs" style={{ backdropFilter: 'blur(2px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          {activeMode === 'life' ? (
            <>
              <div className="flex-1 flex items-center gap-4" role="status" aria-live="off">
                {selectedBiomeName && (
                  <>
                    <span className="tabular-nums">gen {lifeStepCount}</span>
                  </>
                )}
                {lifeSelectedBiome && lifeAlgoNotation && <span>{lifeSelectedBiome.algorithm} {lifeAlgoNotation}</span>}
                {lifeCursor && <><span className="tabular-nums">row {lifeCursor.row}</span><span className="tabular-nums">col {lifeCursor.col}</span></>}
              </div>
              <Text as="span" size="xs" variant="muted">click to draw · ? for shortcuts</Text>
              <div className="flex-1 flex items-center justify-end gap-4">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]} onClick={() => deckStore.getState().setZoom(stepZoom(deckStore.getState().zoom, -1))}>-</Button>
                  <Text as="span" size="xs">{zoom * 100}%</Text>
                  <Button variant="ghost" aria-label="Zoom in" disabled={zoom >= (ZOOM_STEPS.at(-1) ?? Infinity)} onClick={() => deckStore.getState().setZoom(stepZoom(deckStore.getState().zoom, 1))}>+</Button>
                </div>
                <Button variant="ghost" tooltip="shortcuts" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts"><span aria-hidden="true">???</span></Button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </footer>}


        {showWelcome && (
          <WelcomeScreen
            daemonOnline={daemonOnline}
            hardwareOnline={modules.left || modules.right}
            onDismiss={() => setWelcomeDismissed(true)}
          />
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {(activeMode === 'video' && videoIdle) || (activeMode === 'audio' && audioFullscreenStyle !== null && audioIdle) ? 'Controls hidden. Move mouse or press a key to show.' : ''}
        </span>
      </div>
    </TooltipProvider>
  );
}
