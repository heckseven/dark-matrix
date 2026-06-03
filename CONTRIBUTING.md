# Contributing

## Dev setup

Prerequisites: Node 24+ and pnpm. If you use nvm:

```sh
nvm install 24
nvm use 24
```

Clone and build:

```sh
git clone <repo> ~/projects/dark-matrix
cd ~/projects/dark-matrix
pnpm install
pnpm build
```

## Development workflows

### Without hardware

Most of the codebase is workable without a Framework 16. The daemon requires serial hardware, but the Deck UI, all tests, and Storybook run independently.

**Component work — Storybook (no backend needed):**

```sh
pnpm storybook       # http://localhost:6006
```

50+ stories cover the full component library, all visual states, and interactive previews.

**Full Deck UI with hot-reload (deck server + Vite):**

```sh
node dist/cli/index.js ui   # terminal 1 — deck server at http://localhost:7340
pnpm dev:deck               # terminal 2 — Vite at http://localhost:5173
```

Vite proxies `/api` and `/ws` to the deck server. Use `http://localhost:5173` for hot-reload. The UI renders normally without hardware — the pixel editor, HUD presets, config, and animations all work; the header will show a status chip indicating no hardware is connected.

Useful dev URLs (work on either port):

- `http://localhost:5173/?welcome` — re-trigger the first-run setup screen
- `http://localhost:5173/?lab` — animation variant preview mode

### With hardware

If you have dark-matrix installed as a systemd service, stop it first — the installed daemon holds the serial port and Unix socket, so the dev daemon can't start alongside it:

```sh
systemctl --user stop dark-matrix
```

Then run all three processes together:

```sh
pnpm dev:all
```

This starts the daemon (`--watch` for live reload), the deck server, and Vite in one terminal with labeled output. Hardware must be connected and calibrated first — see "Deploy to hardware" below.

The daemon watches `dist/`, so daemon code changes require a rebuild: run `pnpm build` (or `tsc --watch` in a separate terminal) to pick them up. Deck UI changes hot-reload immediately via Vite.

## Tests

```sh
pnpm test          # vitest, all tests
pnpm test:watch    # watch mode
pnpm typecheck     # tsc --noEmit
pnpm coverage      # coverage report
```

The suite should be fully green on a clean checkout. If something fails, it's related to your change.

## TypeScript notes

The project uses `exactOptionalPropertyTypes: true`. You cannot assign `undefined` to an optional property — use a conditional spread:

```typescript
// wrong — TypeScript error
const opts = { ectoolPath: config.ectool_path };

// correct
const opts = {
  ...(config.ectool_path !== undefined ? { ectoolPath: config.ectool_path } : {}),
};
```

## Commit style

Imperative mood, ≤72 chars, no period. Prefix with `feat(scope):`, `fix(scope):`, `refactor(scope):`, or `chore(scope):`.

## Deploy to hardware

After building, install the daemon as a systemd user service:

```sh
node dist/cli/index.js install --user-systemd
```

For incremental changes during development:

```sh
pnpm build
node dist/cli/index.js install --user-systemd
```

The service restarts automatically. Check it with:

```sh
systemctl --user status dark-matrix
journalctl --user -u dark-matrix -f
```

To hot-reload config without restarting:

```sh
systemctl --user kill --signal=HUP dark-matrix
```

## Optional hardware setup

Enable `/dev/cros_ec` access for privacy switch detection:

```sh
node dist/cli/index.js install --ec-access
# follow the printed instructions (requires sudo for udev rule)
```

Install Claude Code hooks (PostToolUse, Stop, Notification):

```sh
node dist/cli/index.js install --claude-hooks
```

## Architecture

```
src/
├── daemon/
│   └── index.ts           # Event loop, source watchers, Unix socket IPC
├── cli/
│   └── index.ts           # CLI commands
├── deck/
│   ├── format.ts          # .dmx.json project format + serialization
│   ├── server.ts          # HTTP server (static + API) + WebSocket live preview
│   └── web/
│       ├── App.tsx         # Main application shell + hardware status chip + welcome gate
│       ├── store.ts        # Zustand state + localStorage session persistence
│       ├── files.ts        # Import/export helpers
│       └── components/
│           ├── WelcomeScreen.tsx  # First-run setup checklist modal
│           ├── PixelCanvas.tsx    # Drawing surface
│           ├── FrameStrip.tsx     # Animation frame list + drag-reorder
│           ├── ColorPalette.tsx   # BW/grayscale color picker
│           ├── MatrixPreview.tsx  # Hardware-accurate pixel thumbnail
│           ├── ModePicker.tsx     # App mode switcher overlay
│           ├── LivePreview.tsx    # WebSocket → daemon live preview bridge
│           ├── ConfigPanel.tsx    # Daemon settings (startup, brightness, hardware, notifications)
│           ├── AudioPanel.tsx     # Audio visualizer with style picker + source selector
│           ├── HudPanel.tsx       # Three-column HUD preset editor
│           ├── HudDualPreview.tsx # Side-by-side live preview for HUD layout
│           ├── HudInspector.tsx   # Widget inspector for selected module side
│           ├── PresetList.tsx     # Scrollable named preset list
│           ├── VideoPanel.tsx     # Video display panel
│           ├── TriggerView.tsx    # Event trigger configuration
│           └── Playback.tsx       # Frame playback controls
├── lib/
│   ├── transport.ts        # BinaryTransport (one-shot) + SerialTransport (held port)
│   ├── frame.ts            # Frame type: 9×34 Uint8Array + packBW helper
│   ├── animation.ts        # Async iterator animation runtime + tick loop
│   ├── config.ts           # Zod-validated config loader + bootstrapConfig
│   ├── brightness.ts       # Sensor polling + hysteresis + time-of-day fallback
│   ├── dispatcher.ts       # Priority queue → display intents
│   ├── ec-switches.ts      # ectool GPIO poller (FW16 privacy switches)
│   ├── vm-source.ts        # virsh list poller
│   ├── claude-source.ts    # Claude hook payload parser
│   └── image-convert.ts   # Image → Frame conversion (sharp)
└── animations/
    ├── gol.ts              # Game of Life
    ├── scroll.ts           # Dual-module text scroll
    ├── gif.ts              # GIF decoder + frame iterator
    ├── audio-eq.ts         # ffmpeg → FFT → EQ bars
    ├── heatmap.ts          # Simulated heatmap
    ├── image.ts            # Static image animation
    └── startup.ts          # Wipe/rain/pulse startup sequences
```

**Transport modes:**
- `BinaryTransport` — shells out to a control binary per command. Safe for one-shot use.
- `SerialTransport` — holds the serial port open for animation. Acquired on animation start,
  released on stop. Brightness is sent as a native serial packet (`[0x32, 0xAC, 0x00, pct]`).
  Use `dark-matrix release` to reclaim the port for `matrix.sh`.

**Frame storage:** column-major `Uint8Array` (`frame[col * 34 + row]`).
Wire format for BW frames is row-major — `packBW` handles the transposition.

### Deck server API

| Endpoint | Method | Description |
|---|---|---|
| `/api/modules` | GET | Module availability + `daemonOnline`, `uncalibrated` flags |
| `/api/config` | GET | Read current daemon config |
| `/api/config` | PUT | Write daemon config (daemon hot-reloads via SIGHUP) |
| `/api/feature-check` | GET | Check optional binary dependencies (ffmpeg, wpctl, etc.) |
| `/api/import` | POST | Multipart upload — converts PNG/GIF/JSON to project format |
| `/api/export/gif` | POST | Render project frames to animated GIF |
| `/api/export/png` | POST | Render a single frame to PNG |
| `/api/prefs` | GET/PUT | Persist deck UI preferences |
| `/api/library` | GET | List saved projects in `~/.config/dark-matrix/library/`, plus bundled built-ins (flagged `builtin:true`; shadowed by a user file of the same name) |
| `/api/library` | POST | Save project `{ name, project, copy? }` — `copy:true` writes a `_copy` variant |
| `/api/library/:name` | GET | Load a saved project |
| `/api/library/:name/rename` | PUT | Rename a project `{ newName }` |
| `/api/library/:name` | DELETE | Delete a project |
| `/ws` | WebSocket | Live preview — streams frame commands to daemon |

For AI agent conventions and project invariants, see [CLAUDE.md](CLAUDE.md).
