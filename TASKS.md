# dark-matrix task list

## Platform extensions


## Major modes

- [ ] Life mode B/S rule editor — expose arbitrary birth/survival rules (B/S notation text input) in LifeInspector; validate and apply to gol engine
- [ ] Interactive games — separate from life mode; keyboard input from browser routed via WebSocket to game loop (Tetris, Snake); game state lives in browser, renders frames and pushes via existing live preview `frame` mechanism

## HUD enhancements

- [ ] Static HUD picker thumbnails — draw 34 frames in the deck (9-wide BW) per `docs/hud-picker-thumbnail-draworder.md`; export `.dmx.json`; replace dynamic render calls in `HudInspector.tsx` and `PresetList.tsx` with static pixel constants parsed from the file
- [ ] Data widget display variations — new styles beyond line/bars; candidates: radial gauges, sparklines, digit readouts, dot-matrix counters; selectable per-quadrant in HudInspector
- [ ] AI data sources — GPU utilization (nvidia-smi/ROCm: GPU%, VRAM%, temp) and local inference stats (Ollama API: active model, tokens/sec, context size); new daemon proc-source variants; exposed as selectable metrics in HUD data quadrants alongside CPU/RAM/net
- [ ] HUD image delete confirm: remove `DialogClose asChild` from the confirm button so the dialog stays open until the delete call succeeds; surface errors via aria-live or toast rather than silent dismissal
- [ ] HUD image delete confirm: show `DialogTitle` visibly (not `sr-only`) so sighted users see the dialog heading alongside the "used in N presets" description

## Daemon / hardware

- [ ] Scroll speed config in `daemon` config block (not just CLI flag)
- [ ] udev monitor hot-plug — replace 500ms polling with event-driven module detection


## Known gaps

- [ ] Scroll pixel-perfect seam at module boundary — verify no off-by-one at the join
- [ ] `dark-matrix status` module paths — currently shows online/offline but not the by-path device strings
