# dark-matrix task list

## Foundation

- [x] File library — `~/.config/dark-matrix/library/` convention for `.dmx.json` files; extend config with `startup.animation: 'dmx'` + `startup.dmx_path`; designer API endpoint to save directly to library
- [x] Persist active mode — add `activeMode` to designer `SessionSnapshot` so it survives page reload

## Platform extensions

- [x] Recent files — extend `designer-prefs.json` `lastFile` → `recentFiles: string[]` (cap 10); surface in File menu
- [x] `dark-matrix play <path>` CLI command — reads a `.dmx.json` file, drives daemon `frame` command in a loop; bash-triggerable animation
- [x] System notification → animation — D-Bus notification watcher (`org.freedesktop.Notifications`) as a new Dispatcher source; dispatches scroll or configured animation on notify events
- [x] Mic active detection — poll PipeWire/PulseAudio for active recording clients; new `watchMic` Dispatcher source; triggers audio-eq visualizer or HUD overlay when mic is in use

## Major modes

- [x] Audio visualizer mode — multiple visualization styles (eq bars, waveform, radial, etc.); UI panel to browse and select style; live preview in designer and mirrored to modules; source selectable (monitor/mic)
- [x] Clock mode — multiple face designs (binary, analogue, bar, segment); implemented as a HUD widget with live face picker in HudInspector; live preview on modules
- [x] HUD mode — daemon data sources (CPU, memory, network, time via `/proc`); WebSocket push from daemon; three-column preset designer (PresetList, HudDualPreview, HudInspector); named presets saveable and switchable via `dark-matrix hud preset <name>`; event-driven trigger engine (time, idle, active, threshold, interface, vm); live preview in designer and on modules
- [ ] Generative art panel — new tool panel in designer with parameterized generators (noise, reaction-diffusion, CA seeds); writes into frames; save to library
- [ ] Image import tooling — contrast, brightness, dithering controls in designer when importing PNG/GIF; helps optimize images for the low-res display
- [ ] Default view settings — designer UI to configure startup mode and animation (`config.json` schema already exists); persists across power cycles
- [ ] YouTube / video pipeline — `yt-dlp` + `ffmpeg` capture, scale to 9×34 or 18×34, dither, push via frame command at ~20fps; audio plays through system independently
- [ ] Interactive games — keyboard input from browser routed via WebSocket to game loop (Tetris, Snake); game state lives in browser, renders frames and pushes via existing live preview `frame` mechanism
- [ ] Notifications panel — per-app and per-urgency animation rules for D-Bus notification events (watcher already exists); designer panel to configure trigger → animation mappings; preview mode to fire a test notification without waiting for a real one
- [ ] Config panel — settings panel in designer covering: startup animation picker (type + dmx path), daemon tunables (poll interval, idle timeout, idle animation), hardware assignment (serial port, module calibration), notification rules, accent color and UI theme

## HUD enhancements

- [ ] Trigger editor redesign — replace current TriggerEditor right-aside layout with a clearer UX; better add/edit flow, visual indicator of which triggers are currently active, group triggers by type
- [ ] Data widget display variations — new styles beyond line/bars; candidates: radial gauges, sparklines, digit readouts, dot-matrix counters; selectable per-quadrant in HudInspector
- [ ] AI data sources — GPU utilization (nvidia-smi/ROCm: GPU%, VRAM%, temp) and local inference stats (Ollama API: active model, tokens/sec, context size); new daemon proc-source variants; exposed as selectable metrics in HUD data quadrants alongside CPU/RAM/net
- [ ] Runes HUD widget — third widget type alongside clock and data; configurable glyph or animated rune sequence per module; face-style picker in HudInspector; stored in preset left/right slots
