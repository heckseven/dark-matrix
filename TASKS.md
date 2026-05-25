# dark-matrix task list

## Foundation

- [x] Onboarding / setup flow — welcome screen on first launch, hardware status chip, `dark-matrix calibrate`, `bootstrapConfig` auto-detects sensor and modules, `uncalibrated` flag as source of truth
- [x] File library — `~/.config/dark-matrix/library/` convention for `.dmx.json` files; extend config with `startup.animation: 'dmx'` + `startup.dmx_path`; deck API endpoint to save directly to library
- [x] Persist active mode — add `activeMode` to deck `SessionSnapshot` so it survives page reload

## Platform extensions

- [x] Recent files — extend `deck-prefs.json` `lastFile` → `recentFiles: string[]` (cap 10); surface in File menu
- [x] `dark-matrix play <path>` CLI command — reads a `.dmx.json` file, drives daemon `frame` command in a loop; bash-triggerable animation
- [x] System notification → animation — D-Bus notification watcher (`org.freedesktop.Notifications`) as a new Dispatcher source; dispatches scroll or configured animation on notify events
- [x] Mic active detection — poll PipeWire/PulseAudio for active recording clients; new `watchMic` Dispatcher source; triggers audio-eq visualizer or HUD overlay when mic is in use

## Major modes

- [x] Audio visualizer mode — multiple visualization styles (eq bars, waveform, radial, etc.); UI panel to browse and select style; live preview in deck and mirrored to modules; source selectable (monitor/mic)
- [x] Clock mode — multiple face designs (binary, analogue, bar, segment); implemented as a HUD widget with live face picker in HudInspector; live preview on modules
- [x] HUD mode — daemon data sources (CPU, memory, network, time via `/proc`); WebSocket push from daemon; three-column preset editor (PresetList, HudDualPreview, HudInspector); named presets saveable and switchable via `dark-matrix hud preset <name>`; event-driven trigger engine (time, idle, active, threshold, interface, vm); live preview in deck and on modules
- [x] Life mode — cellular automata sandbox; three-column layout (biome list, simulation canvas, algorithm inspector); Conway/HighLife/Day&Night algorithms; biomes persist via daemon WS; hardware streams in real time; canvas editable when paused
- [ ] Life mode B/S rule editor — expose arbitrary birth/survival rules (B/S notation text input) in LifeInspector; validate and apply to gol engine
- [ ] Generative art panel — new tool panel in deck with parameterized generators (noise, reaction-diffusion, CA seeds); writes into frames; save to library
- [x] Image import tooling — contrast, brightness, dithering controls in deck when importing PNG/GIF; helps optimize images for the low-res display
- [x] Default view settings — deck UI to configure startup mode and animation (`config.json` schema already exists); persists across power cycles
- [x] YouTube / video pipeline — `yt-dlp` + `ffmpeg` capture, scale to 9×34 or 18×34, dither, push via frame command at ~20fps; audio plays through system independently
- [ ] Interactive games — separate from life mode; keyboard input from browser routed via WebSocket to game loop (Tetris, Snake); game state lives in browser, renders frames and pushes via existing live preview `frame` mechanism
- [x] Notifications panel — per-app and per-urgency animation rules for D-Bus notification events (watcher already exists); deck panel to configure trigger → animation mappings; preview mode to fire a test notification without waiting for a real one
- [x] Config panel — settings panel in deck covering: startup animation picker (type + dmx path), daemon tunables (poll interval, idle timeout, idle animation), hardware assignment (serial port, module calibration), notification rules, accent color and UI theme
- [x] Refine config panel designs — revisit layout, spacing, and interaction patterns across all config tabs; improve visual hierarchy and consistency with the rest of the deck
- [ ] Audio full screen visualizer — full-viewport audio visualization mode; larger canvas with richer styles beyond the current 9×34 hardware mirror; source selectable (monitor/mic)
- [x] Video integration — local file, URL, and webcam sources; `ffmpeg` pipeline to scale, dither, and push frames at ~20fps; extends the existing `play` command with video source support

## HUD enhancements

- [ ] Static HUD picker thumbnails — draw 34 frames in the deck (9-wide BW) per `docs/hud-picker-thumbnail-draworder.md`; export `.dmx.json`; replace dynamic render calls in `HudInspector.tsx` and `PresetList.tsx` with static pixel constants parsed from the file

- [ ] Data widget display variations — new styles beyond line/bars; candidates: radial gauges, sparklines, digit readouts, dot-matrix counters; selectable per-quadrant in HudInspector
- [ ] AI data sources — GPU utilization (nvidia-smi/ROCm: GPU%, VRAM%, temp) and local inference stats (Ollama API: active model, tokens/sec, context size); new daemon proc-source variants; exposed as selectable metrics in HUD data quadrants alongside CPU/RAM/net
- [ ] Runes HUD widget — third widget type alongside clock and data; configurable glyph or animated rune sequence per module; face-style picker in HudInspector; stored in preset left/right slots
- [ ] HUD image delete confirm: remove `DialogClose asChild` from the confirm button so the dialog stays open until the delete call succeeds; surface errors via aria-live or toast rather than silent dismissal
- [ ] HUD image delete confirm: show `DialogTitle` visibly (not `sr-only`) so sighted users see the dialog heading alongside the "used in N presets" description

## Daemon / hardware

- [ ] Notification display content — show camera/mic icon on module when privacy switch fires (currently shows scroll text; display intent carries no visual content)
- [ ] Scroll speed config in `daemon` config block (not just CLI flag)
- [ ] Multiple idle animations in rotation (round-robin or random)
- [ ] udev monitor hot-plug — replace 500ms polling with event-driven module detection
- [ ] Configurable notification → animation mappings (which animation plays per source type)
- [ ] GIF as notification content (e.g. VM-start triggers skulltalk.gif)
- [ ] Audio EQ fps ceiling — verify empirically at 30fps target on hardware

## Known gaps

- [ ] Scroll pixel-perfect seam at module boundary — verify no off-by-one at the join
- [ ] `dark-matrix status` module paths — currently shows online/offline but not the by-path device strings
