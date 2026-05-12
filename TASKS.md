# dark-matrix task list

## Foundation

- [ ] File library — `~/.config/dark-matrix/library/` convention for `.dmx.json` files; extend config with `startup.animation: 'dmx'` + `startup.dmx_path`; designer API endpoint to save directly to library
- [ ] Persist active mode — add `activeMode` to designer `SessionSnapshot` so it survives page reload

## Platform extensions

- [ ] Recent files — extend `designer-prefs.json` `lastFile` → `recentFiles: string[]` (cap 10); surface in File menu
- [ ] `dark-matrix play <path>` CLI command — reads a `.dmx.json` file, drives daemon `frame` command in a loop; bash-triggerable animation
- [ ] System notification → animation — D-Bus notification watcher (`org.freedesktop.Notifications`) as a new Dispatcher source; dispatches scroll or configured animation on notify events
- [ ] Mic active detection — poll PipeWire/PulseAudio for active recording clients; new `watchMic` Dispatcher source; triggers audio-eq visualizer or HUD overlay when mic is in use

## Major modes

- [ ] HUD mode — daemon-side data sources (CPU, memory, network, time via `/proc`); new daemon WebSocket push or command for HUD data; HUD web UI mode; settings panel for which widgets are visible
- [ ] Generative art panel — new tool panel in designer with parameterized generators (noise, reaction-diffusion, CA seeds); writes into frames; save to library
- [ ] Image import tooling — contrast, brightness, dithering controls in designer when importing PNG/GIF; helps optimize images for the low-res display
- [ ] Default view settings — user-configurable startup mode and animation stored in config; persists across power cycles
- [ ] YouTube / video pipeline — `yt-dlp` + `ffmpeg` capture, scale to 9×34 or 18×34, dither, push via frame command at ~20fps; audio plays through system independently
- [ ] Interactive games — keyboard input from browser routed via WebSocket to game loop (Tetris, Snake); game state lives in browser, renders frames and pushes via existing live preview `frame` mechanism
