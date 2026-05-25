# dark-matrix

Framework16 LED Matrix control system. Two 9×34 LED modules (left/right) driven over USB
serial by a persistent TypeScript/Node.js daemon, with a CLI and a browser-based web UI
(the Deck) for configuration, animation, HUD presets, audio visualization, and more.

---

## Hardware

- Framework 16 laptop
- Two LED Matrix input modules (9×34px each, RP2040 + IS31FL3741A)
- Mounted left and right of the trackpad
- Connected as `/dev/ttyACM*` — always referenced by stable by-path symlinks

---

## Setup

### Prerequisites

- Node 24+ (nvm)
- pnpm
- `ffmpeg` (with PulseAudio/PipeWire support, i.e. compiled with `-f pulse`) — audio pipeline
- `wpctl` (from `wireplumber`) — audio source selection
- `pw-dump` (from `pipewire-utils`) — audio device enumeration
- User in `dialout` group — required for serial port access to `/dev/ttyACM*`

  ```sh
  sudo usermod -aG dialout $USER
  ```

  Some distros use `uucp` instead of `dialout`.

**Optional:**

- User in `libvirt` group — only needed for VM state detection

  ```sh
  sudo usermod -aG libvirt $USER
  ```

- `ectool` — only needed for EC privacy switch (mic/camera lid) detection; installed via `sudo node dist/cli/index.js install --ec-access`
- `dbus-monitor` (from `dbus` or `dbus-x11` depending on distro) — only needed for desktop notification watching; `DBUS_SESSION_BUS_ADDRESS` is set automatically when running as a systemd user service

### Install

```sh
curl -fsSL https://raw.githubusercontent.com/heckseven/dark-matrix/main/scripts/install.sh | sh
```

Installs to `~/.local/share/dark-matrix/`, enables the systemd user service, and writes a `dark-matrix` wrapper to `~/.local/bin/`.

To install a specific version: `DM_VERSION=v0.2.0 curl -fsSL ... | sh`

### First-run calibration

After install, confirm which physical port is left vs right:

```sh
node dist/cli/index.js calibrate
```

This sends a test pattern to each port and prompts you to confirm which side lit up.
The mapping is stored in `~/.config/dark-matrix/config.json`.

---

## Deck

Browser-based control UI for the daemon. Launches a local HTTP server and opens in the browser.

```sh
dark-matrix ui [--port <n>]   # default: 7340
```

### Modes

| Mode | Description |
|---|---|
| **design** | Pixel animation editor — draw, animate, and push to hardware |
| **hud** | Named HUD presets — configure widget layouts per module side; switch via CLI |
| **audio** | Real-time audio visualizer — EQ bars, waveform, radial, waterfall, heatmap styles |
| **video** | Matrix-rendered video display |
| **data** | Data-driven display (in progress) |
| **runes** | Rune/glyph display |
| **games** | Game of Life and similar generative modes |
| **config** | Daemon settings — startup, brightness, hardware, notifications, appearance |

### Design mode features

- **Draw** on a hardware-accurate pixel canvas; BW or grayscale palette
- **Animate** — add, remove, clone, reorder frames; set per-frame delay; play/pause/loop
- **Live preview** — streams frames to the physical modules over WebSocket as you draw
- **Zoom** — 50% to 400%
- **Undo/redo** — 50-level history; stroke-batched so dragging counts as one undo step
- **Library** — save and open projects in `~/.config/dark-matrix/library/`; rename by editing the title
- **Open recent** — last 7 saved/opened projects in the File menu, persisted across reloads
- **Duplicate** — saves a `_copy` variant without overwriting the current file
- **Import** — open `.dmx.json` projects from disk, PNG images, or GIFs (all converted to frame format)
- **Export** — download `.dmx.json` project, export GIF, export single frame as PNG
- **Session persistence** — state is saved to `localStorage`; refreshing the page restores your work
- **Module detection** — polls `/api/modules` every 2s; hides dual-module UI when only one module is connected

### Project format

Projects are saved as `.dmx.json` files:

```jsonc
{
  "format": "dark-matrix",
  "version": 1,
  "width": 9,        // 9 (single) or 18 (dual spanning)
  "height": 34,
  "mode": "bw",      // "bw" | "gray"
  "loop": true,
  "frames": [
    { "delayMs": 100, "pixels": "<base64>" }
  ]
}
```

Pixel data is column-major: `pixels[col * 34 + row]`, base64-encoded.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` | Save to library |
| `Ctrl+Shift+S` | Duplicate (save as copy) |
| `N` | Add frame after current |
| `+` / `-` | Zoom in / out |
| `?` | Show all shortcuts |
| `L` / `R` / `B` / `M` | Live preview target: left / right / both / mirror _(dual-module only)_ |

---

## CLI Reference

```
dark-matrix <command>
```

### Service

| Command | Description |
|---|---|
| `install --user-systemd` | Install and enable systemd user unit |
| `install --ec-access` | Install udev rule for `/dev/cros_ec` (requires sudo) |
| `install --claude-hooks` | Add PostToolUse hook to `~/.claude/settings.json` |
| `ping` | Check if daemon is running |
| `status` | Show daemon version, uptime, current animation, and hardware state |
| `release` | Release serial port handles (for compatibility with `matrix.sh`) |
| `calibrate` | Confirm left/right module assignment |
| `ui [--port <n>]` | Launch the Deck UI (default port 7340) |
| `hud preset <name>` | Switch to a named HUD preset |

### Images

| Command | Description |
|---|---|
| `image <path>` | Display any image (PNG/JPEG/GIF), resized to 9×34 |
| `image <path> --preview` | Show unicode terminal preview without sending to hardware |
| `image <path> --mode bw\|gray` | Black-and-white threshold or grayscale PWM |
| `show <image> [--device <path>] [--mode bw\|gray]` | Send image to a specific device |
| `show-split <left> <right> [--mode bw\|gray]` | Send different images to each module |
| `display yeah\|runes\|0x07\|panic` | Built-in presets |

### Animations

| Command | Description |
|---|---|
| `scroll <text>` | Scroll text across both modules |
| `scroll --size tiny\|small\|medium\|large <text>` | Set text size (default: small) |
| `scroll --speed slow\|normal\|fast <text>` | Set scroll speed (default: normal) |
| `scroll --hold <text>` | Keep scrolling until `release` |
| `animate gif <path>` | Play a GIF on the left module |
| `animate gif --dual <path>` | Play a GIF spanning both modules (18×34 source) |
| `animate gif --mode bw\|gray <path>` | Rendering mode |
| `animate gif --hold <path>` | Loop until `release` |
| `play <path>` | Play a `.dmx.json` project once, then return to idle |
| `play --loop <path>` | Loop a `.dmx.json` project until `release` |

---

## Configuration

Config file: `~/.config/dark-matrix/config.json`

Generated on first run. Send `SIGHUP` to daemon to hot-reload without restart.

```jsonc
{
  "modules": {
    "left":  "/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0",
    "right": "/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0"
  },
  "brightness": {
    "mode": "sensor",     // "sensor" | "time" | "manual"
    "sensor_path": "/sys/bus/iio/devices/iio:device0/in_illuminance_raw",
    "hysteresis": 10,     // min raw delta before recalculating
    "manual_value": 100
  },
  "startup": {
    "animation": "gol-random",   // "gol-random" | "scroll" | "dmx" | "none"
    "scroll_text": "DARK MATRIX",
    "dmx_path": "~/.config/dark-matrix/library/intro.dmx.json"  // required when animation = "dmx"
  },
  "daemon": {
    "poll_interval_ms": 500,
    "idle_animation": "gol-random",  // "gol-random" | "audio-eq" | "heatmap" | "scroll" | "gif" | "none"
    "idle_after_ms": 300000,
    "idle_eq_source": "monitor",     // "monitor" | "mic" — audio source for audio-eq idle animation
    // required when idle_animation = "gif":
    "idle_gif_path": "/home/user/path/to/idle.gif",
    "idle_gif_mode": "gray",         // "bw" | "gray" (default: gray)
    "idle_gif_dual": false,          // true to span both modules
  }
}
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DARK_MATRIX_SOCKET` | `/run/user/<uid>/dark-matrix.sock` | Overrides the Unix socket path used for CLI-to-daemon IPC |
| `DARK_MATRIX_CONFIG_PATH` | `~/.config/dark-matrix/config.json` | Overrides the config file path |

---

## Daemon Behavior

The daemon runs as a systemd user service. It:

1. Acquires both serial ports on startup
2. Runs the configured startup animation
3. Watches notification sources (privacy switches, VMs, Claude activity)
4. Drives a priority-ordered notification queue — higher-priority events preempt lower ones
5. Falls back to the idle animation when no notifications are active
6. Polls for hot-plugged modules every 500ms, runs startup animation on reconnect
7. Adjusts brightness from the ambient light sensor with hysteresis smoothing

### Notification sources

| Source | Trigger | Priority |
|---|---|---|
| Mic switch (FW16 EC) | Physical mic privacy switch toggled ON | High |
| Camera switch (FW16 EC) | Physical camera privacy switch toggled ON | High |
| VM activity | VM started or stopped via libvirt | Medium |
| Claude activity | PostToolUse hook fires (tool use within last 30s) | Low |

### Idle animations

| Animation | Description |
|---|---|
| `gol-random` | Conway's Game of Life with random seeds |
| `audio-eq` | 9-band EQ bars from system audio (monitor source) |
| `heatmap` | Simulated thermal heatmap spanning both modules |

---

## Architecture

```
src/
├── daemon/
│   └── index.ts          # Event loop, source watchers, Unix socket IPC
├── cli/
│   └── index.ts          # CLI commands
├── deck/
│   ├── format.ts         # .dmx.json project format + serialization
│   ├── server.ts         # HTTP server (static + API) + WebSocket live preview
│   └── web/
│       ├── App.tsx        # Main application shell
│       ├── store.ts       # Zustand state + localStorage session persistence
│       ├── files.ts       # Import/export helpers
│       └── components/
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
│   ├── transport.ts       # BinaryTransport (one-shot) + SerialTransport (held port)
│   ├── frame.ts           # Frame type: 9×34 Uint8Array + packBW helper
│   ├── animation.ts       # Async iterator animation runtime + tick loop
│   ├── config.ts          # Zod-validated config loader
│   ├── brightness.ts      # Sensor polling + hysteresis + time-of-day fallback
│   ├── dispatcher.ts      # Priority queue → display intents
│   ├── ec-switches.ts     # ectool GPIO poller (FW16 privacy switches)
│   ├── vm-source.ts       # virsh list poller
│   ├── claude-source.ts   # Claude hook payload parser
│   └── image-convert.ts  # Image → Frame conversion (sharp)
└── animations/
    ├── gol.ts             # Game of Life
    ├── scroll.ts          # Dual-module text scroll
    ├── gif.ts             # GIF decoder + frame iterator
    ├── audio-eq.ts        # pw-record → FFT → EQ bars
    ├── heatmap.ts         # Simulated heatmap
    ├── image.ts           # Static image animation
    └── startup.ts         # Wipe/rain/pulse startup sequences
```

**Transport modes:**
- `BinaryTransport` — shells out to a control binary per command. Safe for one-shot use.
- `SerialTransport` — holds the serial port open for animation. Acquired on animation start,
  released on stop. Brightness is sent as a native serial packet. Use `dark-matrix release`
  to reclaim the port for `matrix.sh`.

**Frame storage:** column-major `Uint8Array` (`frame[col * 34 + row]`).
Wire format for BW frames is row-major — `packBW` handles the transposition.

**Deck server API:**

| Endpoint | Method | Description |
|---|---|---|
| `/api/import` | POST | Multipart upload — converts PNG/GIF/JSON to project format |
| `/api/export/gif` | POST | Render project frames to animated GIF |
| `/api/export/png` | POST | Render a single frame to PNG |
| `/api/modules` | GET | Returns `{ left, right }` availability from daemon |
| `/api/prefs` | GET/PUT | Persist deck UI preferences |
| `/api/library` | GET | List saved projects in `~/.config/dark-matrix/library/` |
| `/api/library` | POST | Save project `{ name, project, copy? }` — `copy:true` writes a `_copy` variant |
| `/api/library/:name` | GET | Load a saved project |
| `/api/library/:name/rename` | PUT | Rename a project `{ newName }` |
| `/api/library/:name` | DELETE | Delete a project |
| `/ws` | WebSocket | Live preview — streams frame commands to daemon |

---

## Troubleshooting

```sh
# View daemon logs
journalctl --user -u dark-matrix -f

# Check service status
systemctl --user status dark-matrix

# Reload config without restart
systemctl --user kill --signal=HUP dark-matrix
```

---

## Development

```sh
git clone <repo> ~/projects/dark-matrix
cd ~/projects/dark-matrix
pnpm install
pnpm build

# Install systemd user service
node dist/cli/index.js install --user-systemd

# Enable /dev/cros_ec access (privacy switches)
sudo node dist/cli/index.js install --ec-access

# Install Claude Code PostToolUse hook (optional)
node dist/cli/index.js install --claude-hooks
```

```sh
pnpm build          # compile TS → dist/
pnpm test           # vitest (~486 tests)
pnpm test --watch   # watch mode
```

Deploy daemon changes after build:

```sh
cp -r dist/* ~/.local/share/dark-matrix/dist/
systemctl --user restart dark-matrix
```

Or reinstall fully (also updates node binary and systemd unit):

```sh
node dist/cli/index.js install --user-systemd
systemctl --user daemon-reload && systemctl --user restart dark-matrix
```

---

## Remaining tasks

### High priority

- [x] `--speed` option for `scroll` (slow=10fps/1px, normal=20fps/1px, fast=20fps/2px)
- [ ] Verify left/right calibration is correct on hardware (run `dark-matrix calibrate`)
- [x] Audio EQ: `idle_eq_source: "monitor" | "mic"` config key
- [x] GIF idle animation: `idle_animation: "gif"` + `idle_gif_path`, `idle_gif_mode`, `idle_gif_dual` config keys
- [x] Pixel animation editor (`dark-matrix ui`)

### Medium priority

- [ ] Notification display content: show camera icon / mic icon on module when switch fires
  (currently shows scroll text — display intent carries no visual content yet)
- [ ] Scroll speed config in `daemon` config block (not just CLI flag)
- [ ] Multiple idle animations in rotation (round-robin or random)
- [ ] `dark-matrix status` — show current intent, brightness, module paths
- [x] HUD presets mode — three-column preset editor, named presets, CLI switching
- [x] Audio visualizer mode — multiple styles, monitor/mic source
- [ ] Data, runes, games modes (stubs present, not implemented)
- [ ] AI/generative art mode

### Low priority / nice to have

- [ ] `udev monitor` hot-plug (replace 500ms polling with event-driven detection)
- [ ] Configurable notification → animation mappings (which animation plays per source)
- [ ] GIF as notification content (e.g., VM-start plays skulltalk.gif)
- [ ] Network/CPU monitors (not in original scope — add if wanted)
- [ ] Re-point `matrix.sh` aliases to `dark-matrix` after Phase 4 stable
- [ ] Scroll wraps with pixel-perfect seam at module boundary (verify no off-by-one)

### Open risks

- **R2** ~~Left/right USB path assignment unconfirmed~~ **Confirmed**: `4.2:1.0` = left, `3.3:1.0` = right
- **R4** Audio EQ fps ceiling unverified empirically at 30fps target
