# dark-matrix

Framework16 LED Matrix control daemon. Two 9×34 LED modules (left/right), driven over
USB serial via a persistent TypeScript/Node.js daemon + CLI.

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
- `inputmodule-control` at `~/scripts/inputmodule-control.sh`
- User in `libvirt` group (for VM source)

### Install

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

### First-run calibration

After install, confirm which physical port is left vs right:

```sh
node dist/cli/index.js calibrate
```

This sends a test pattern to each port and prompts you to confirm which side lit up.
The mapping is stored in `~/.config/dark-matrix/config.json`.

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
| `release` | Release serial port handles (for compatibility with `matrix.sh`) |
| `calibrate` | Confirm left/right module assignment |

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
    "animation": "gol-random",   // "gol-random" | "scroll" | "image" | "none"
    "scroll_text": "DARK MATRIX"
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
    // to reload config without restarting: kill -HUP $(systemctl --user show -p MainPID dark-matrix | cut -d= -f2)
  }
}
```

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
├── lib/
│   ├── modules.ts         # Left/right module resolver (by USB topology)
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
    ├── animation.ts       # Tick loop + fps pacing
    ├── brightness.ts      # Brightness-based frame adjuster
    ├── gol.ts             # Game of Life
    ├── scroll.ts          # Dual-module text scroll
    ├── gif.ts             # GIF decoder + frame iterator
    ├── audio-eq.ts        # pw-record → FFT → EQ bars
    ├── heatmap.ts         # Simulated heatmap
    ├── image.ts           # Static image animation
    └── startup.ts         # Wipe/rain/pulse startup sequences
```

**Transport modes:**
- `BinaryTransport` — shells out to `inputmodule-control` per command. Safe for one-shot
  use; daemon uses this for static frames and commands.
- `SerialTransport` — holds the serial port open for animation. Daemon acquires on
  animation start, releases on stop. Use `dark-matrix release` to reclaim port for
  `matrix.sh` during transition.

**Frame storage:** column-major `Uint8Array` (`frame[col * 34 + row]`).
Wire format for BW frames is row-major — `packBW` handles the transposition.

---

## Dev

```sh
pnpm build          # compile TS → dist/
pnpm test           # vitest (167 tests)
pnpm test --watch   # watch mode
```

Reinstall daemon after build changes:

```sh
node dist/cli/index.js install --user-systemd
systemctl --user restart dark-matrix
```

---

## Remaining tasks

### High priority

- [x] `--speed` option for `scroll` (slow=10fps/1px, normal=20fps/1px, fast=20fps/2px)
- [ ] Verify left/right calibration is correct on hardware (run `dark-matrix calibrate`)
- [x] Audio EQ: `idle_eq_source: "monitor" | "mic"` config key
- [x] GIF idle animation: `idle_animation: "gif"` + `idle_gif_path`, `idle_gif_mode`, `idle_gif_dual` config keys

### Medium priority

- [ ] Notification display content: show camera icon / mic icon on module when switch fires
  (currently shows scroll text — display intent carries no visual content yet)
- [ ] Scroll speed config in `daemon` config block (not just CLI flag)
- [ ] Multiple idle animations in rotation (round-robin or random)
- [ ] `dark-matrix status` — show current intent, brightness, module paths

### Low priority / nice to have

- [ ] `udev monitor` hot-plug (replace 500ms polling with event-driven detection)
- [ ] Configurable notification → animation mappings (which animation plays per source)
- [ ] GIF as notification content (e.g., VM-start plays skulltalk.gif)
- [ ] Network/CPU monitors (not in original scope — add if wanted)
- [ ] Re-point `matrix.sh` aliases to `dark-matrix` after Phase 4 stable
- [ ] Scroll wraps with pixel-perfect seam at module boundary (verify no off-by-one)

### Open risks

- **R2** Left/right USB path assignment unconfirmed — run `calibrate` to lock in
- **R4** Audio EQ fps ceiling unverified empirically at 30fps target
