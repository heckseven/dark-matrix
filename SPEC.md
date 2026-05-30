# dark-matrix — Project Specification

Framework16 LED Matrix (9×34px per module, two modules) control system.
Hardware: RP2040 + IS31FL3741A, USB Serial API via `inputmodule-control`.

---

## Architecture

```
dark-matrix/
├── src/
│   ├── daemon/          # systemd user service — event loop, source watchers, IPC socket
│   ├── cli/             # CLI — manual control, image conversion, animation triggers
│   └── lib/
│       ├── modules.ts   # Left/right detection via USB topology
│       ├── transport.ts # Serial abstraction (BinaryTransport | SerialTransport)
│       ├── frame.ts     # Frame type: shared 9×34 buffer + bit-packing helpers
│       ├── animation.ts # Async iterator animation runtime + lifecycle interface
│       ├── config.ts    # Config loader (zod v4 validated)
│       └── brightness.ts# Sensor polling + hysteresis + time-of-day fallback
├── animations/          # Animation definitions (GoL, scroll, generative, gif, audio)
├── images/              # Source images (heck, yeah, 0x07, runes)
└── firmware/            # Firmware patch reference (frozen — do not reflash casually)
```

**Primary runtime:** TypeScript/Node.js daemon (`dark-matrix`), managed as a
systemd user service. Watches system events and drives both modules via a persistent
event loop. CLI communicates with the daemon via Unix socket; can also hit serial
directly for one-shot commands if the daemon isn't running.

**Firmware:** Flash `~/projects/inputmodule-rs/` patches once, then freeze. All new
features go host-side via the serial API.

---

## Execution Phases

### Phase 0 — Spike ✓ COMPLETE

Six parallel probes run. Full results in `findings.md`. Decisions locked.

| Probe | Finding | Decision |
|---|---|---|
| 0.1 USB topology | by-path symlinks are stable; ttyACMn enumeration can shift | Use `/dev/serial/by-path/` — never ttyACM directly |
| 0.2 Serial contention | inputmodule-control is one-shot; concurrent writes corrupt frames | BinaryTransport for commands |
| 0.3 Throughput | BinaryTransport ~16-25fps (spawn overhead); direct serial ~30fps+ | SerialTransport for animation; BinaryTransport for commands |
| 0.4 FW16 switches | No evdev device — switches are EC-only, /dev/cros_ec is root-only | Blocked; requires udev rule + ectool pre-Phase-2 |
| 0.5 Claude hooks | PostToolUse hook system confirmed; curl --unix-socket pattern works | hooks-push |
| 0.6 PipeWire | pw-record works, no special group needed, node names not IDs | See audio node names in findings.md |

---

### Phase 1 — Infrastructure

Order: 1.1 → (1.2, 1.3, 1.4 parallel) → (1.5, 1.6 parallel) → 1.7

- **1.1** Project scaffold: `package.json` (TS strict, ESM, Node 20+, Vitest, zod v4),
  `tsconfig.json`, `vitest.config.ts`, `.gitignore`. `pnpm test` runs clean.
- **1.2** [P0.1] Module detector (`lib/modules.ts`): resolve left/right module by
  `/dev/serial/by-path/` symlink — never by ttyACMn. Left/right assignment stored in
  config after one-time visual calibration (`dark-matrix calibrate`). Unit-tested
  against udevadm fixtures from findings.md.
- **1.3** [P0.2, P0.3] Serial abstraction (`lib/transport.ts`): single interface
  `MatrixTransport.{frame, command, brightness, image}`. **Dual-mode — both impls kept:**
  - `BinaryTransport` — shells out to `inputmodule-control` per command. Default mode.
    Naturally serializes with `matrix.sh`. One-shot: open → write → close per call.
  - `SerialTransport` — holds port open, direct writes via `serialport@12`. Animation
    mode only. Daemon acquires port on animation start, releases on stop.
  Target fps: **30fps BW** (42 bytes/frame), **15–20fps grayscale** (345 bytes/frame).
  Include `dark-matrix release` command to force port release for `matrix.sh` compat.
- **1.4** Config loader (`lib/config.ts`): zod v4 schema, first-run generates default,
  `SIGHUP` triggers hot-reload, corrupt JSON fails loudly.
- **1.5** [P1.4] Brightness module (`lib/brightness.ts`): sensor polling with
  configurable hysteresis threshold + smoothing window; time-of-day fallback.
  Validates sensor raw value is a non-negative integer before formula application.
- **1.6** [P1.1] Daemon skeleton + IPC (`src/daemon/index.ts`): event loop, Unix socket
  at `$XDG_RUNTIME_DIR/dark-matrix.sock`, JSON-line protocol.
  `SIGTERM` handler closes all serial ports before exit.
  `dark-matrix ping` round-trips.
- **1.7** [P1.2–1.6] systemd user unit: `dark-matrix.service` installed via
  `dark-matrix install --user-systemd`. `systemctl --user start dark-matrix` brings up
  daemon, acquires both modules, brightness loop is ticking.
  Hot-plug: poll device list every 500ms (udev rule deferred to post-Phase 1 if needed).

**Frame type (`lib/frame.ts`):** shared 9×34 `Uint8Array` buffer with bit-packing
helpers. All animation and transport code works in terms of `Frame` — no scattered
pixel math.

**Animation lifecycle interface:**

```ts
interface Animation {
  [Symbol.asyncIterator](): AsyncIterator<Frame>;
  stop(): void;   // signals iterator to return, triggers cleanup
}
```

All animations implement this. No generator pull model — event-driven animations
use async iterators that yield frames as they become available.

---

### Phase 2 — Notifications

**Pre-step (before any Phase 2 work):** Enable `/dev/cros_ec` user access:
```
# /etc/udev/rules.d/99-cros-ec-user.rules
KERNEL=="cros_ec", OWNER="heckseven", MODE="0660"
```
Then install `ectool`. Without this, mic/camera switch state is inaccessible.

Order: (2.1, 2.2, 2.3 parallel) → 2.4

- **2.1** [P0.4 pre-step] Mic/cam switch source: poll `ectool switches` every 500ms
  via `/dev/cros_ec`; emit state-change events. Requires pre-step above.
  Fallback if pre-step not done: feature silently disabled with log warning.
- **2.2** VM source: poll `virsh list --name` or libvirt socket (`/var/run/libvirt/
  libvirt-sock`, user is in `libvirt` group) every 2s; emit running-VM count changes.
- **2.3** [P0.5] Claude activity source: `PostToolUse` hook with matcher `"*"` in
  `~/.claude/settings.json`. Hook POSTs JSON stdin to daemon via `curl --unix-socket`.
  Sub-agent spawns: `tool_name == "Agent"`, read `tool_input.subagent_type`.
  Install via `dark-matrix install --claude-hooks` (explicit, reversible, never auto).
- **2.4** Notification dispatcher: maps source events → display intents with priority
  queue + duration. **Display affinity** is a separate concept: dispatcher sets
  priority/timing, `modules.ts` handles left/right/span placement. No coupling between
  the two.

---

### Phase 3 — Animations

Order: 3.1 → (3.2, 3.3, 3.4, 3.5 parallel)

- **3.1** Animation runtime: tick loop at fps ceiling from P0.3; feeds `Frame` objects
  to transport via `MatrixTransport.frame()`. No frame drops at target fps.
- **3.2** Text scroll (span mode): logical 9×68 buffer, 5×7 font, continuous scroll
  across both modules with no seam jitter.
- **3.3** GIF playback: `sharp` decode + resize + dither, frame timing from GIF delays.
  Two-module slice mode.
- **3.4** Startup sequences: on daemon start and module-reconnect. Configurable.
- **3.5** [P0.6] Audio-reactive EQ: `pw-record` child process → FFT (`fft.js` with
  CJS wrapper) → 9-band log-scaled bars → `Frame`. Sources:
  - Monitor: `--target=alsa_output.pci-0000_c5_00.6.analog-stereo.monitor`
  - Mic: `--target=alsa_input.pci-0000_c5_00.6.analog-stereo`
  - Format: `--format=s16 --rate=48000 --channels=1 -` (48000 = native, no resample)
  - Use node names not IDs (IDs change across reboots)
  No special group required. PipeWire grants access via user session.

---

### Phase 4 — Images

Order: 4.1 → (4.2, 4.3 parallel)

- **4.1** Image conversion pipeline: `sharp` — resize → grayscale or threshold+dither
  → 9×34 `Frame`. Input limited to PNG, JPEG, GIF (no SVG — disabled). Path validated
  via `fs.realpath` + home-dir allowlist before passing to `sharp`.
- **4.2** Terminal preview: unicode half-block approximation of the 9×34 frame.
  `dark-matrix image foo.png --preview`
- **4.3** Migrate existing commands: `dark-matrix display {yeah,0x07,runes,panic}`.
  `runes` also prints temple ASCII art. Asset files copied into `images/` from
  `~/projects/framework/led-matrix/`. Original `matrix.sh` stays untouched.

---

## Side Detection

Both modules share `ID_SERIAL_SHORT=FRAKDEBZ0100000000` — **only port topology
distinguishes them.** Always reference modules by `/dev/serial/by-path/` symlinks,
never by `/dev/ttyACMn` (enumeration order can shift across reboots).

**Stable paths (from findings.md):**
- Port `1-3.3` → `/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0`
- Port `1-4.2` → `/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0`

Left/right physical assignment is not yet confirmed. One-time calibration:
run `dark-matrix calibrate` — it sends a pattern to each port and asks which
side lit up; stores the mapping in config.

---

## Module Coordination

- **Mirror**: Same content on both (default).
- **Split**: Different content per side (dispatcher handles via display affinity).
- **Span**: Logical 9×68 — content flows across both modules seamlessly.

Split and span require Phase 0.1 stability confirmation.

---

## Brightness

- Primary: ambient light sensor at `/sys/bus/iio/devices/iio:device0/in_illuminance_raw`
  - Sensor path validated at load time — must match `/sys/bus/iio/devices/iio:device*/in_illuminance_raw`
  - Formula: `(raw / 14) + 7`, capped at 255 (from matrix.sh — keep)
  - Hysteresis: configurable threshold + smoothing window
- Fallback: time-of-day curve by month (b1=14 night / b2=54 dawn/dusk / b3=140 noon)
- Override: manual value persists until next ambient change

---

## Dependency Choices (locked)

| Package | Version | Notes |
|---|---|---|
| `serialport` | `^12` | Native addon — pin exact version, `node-gyp` required at install |
| `zod` | `^4.0.0` | v4 not v3 — new project starts on current |
| `sharp` | `^0.33` | Prebuilt binary, no runtime `node-gyp`, Apache-2.0 |
| `fft.js` | `^4` | CJS-only — wrap with `createRequire`; pure JS, no native deps |
| `vitest` | latest | ESM-native testing |

No `node-udev` (stale ESM). Use `udevadm monitor` subprocess for hotplug events.
No `node-libvirt`. Use `virsh list --name` subprocess or libvirt socket directly.
No `fftw3` FFI. Pure `fft.js` is sufficient for 9-band EQ; no native addon liability.

---

## Security Requirements

These are design constraints, not afterthoughts:

| Area | Requirement |
|---|---|
| Unix socket | `chmod(sockPath, 0o600)` immediately after bind |
| Config brightness formula | Structured object `{multiplier, offset}` — never eval a config string |
| Image paths | `fs.realpath` + home-dir allowlist + explicit MIME allowlist (PNG/JPEG/GIF only, no SVG) |
| Child processes | Always `spawn(cmd, args[])` — never `exec` or `shell: true` |
| Claude hook payload | Treat as untrusted: validate field types/lengths; never interpolate into scroll text without escaping |
| Serial device paths | Validate against `/dev/ttyACM[0-9]+` or `/dev/ttyUSB[0-9]+` at config load |
| Sensor path | Validate against `/sys/bus/iio/devices/iio:device*/in_illuminance_raw` |
| Sensor raw value | Validate non-negative integer before formula; don't propagate NaN |
| SIGTERM | Close all serial port handles before exit |
| SIGHUP | Hot-reload config without restart |

---

## Config Schema

```jsonc
// ~/.config/dark-matrix/config.json
{
  "modules": {
    // use by-path symlinks — never ttyACMn directly
    "left":  "/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0",
    "right": "/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0"
  },
  "brightness": {
    "mode": "sensor",          // "sensor" | "time" | "manual"
    "sensor_path": "/sys/bus/iio/devices/iio:device0/in_illuminance_raw",
    "multiplier": 0.071,       // formula: (raw * multiplier) + offset
    "offset": 7,               // structured — never a freeform eval string
    "min": 7,
    "max": 255,
    "hysteresis": 10,          // min raw delta before recalculating
    "manual_value": 100
  },
  "startup": {
    "animation": "gol-random", // "gol-random" | "scroll" | "image" | "none"
    "scroll_text": "DARK MATRIX"
  },
  "daemon": {
    "poll_interval_ms": 500
  }
}
```

---

## Firmware Patches (frozen)

Flash `~/projects/inputmodule-rs/` once. Do not modify until a compelling reason
to reflash exists. Current patches:

| Change | Notes |
|---|---|
| Pattern2 + Pattern3 GoL seeds | Organic math-seeded starts, stabilize to static |
| Startup: 3×GoL at 420 frames each (random pick) | Replaces 8-animation lottery |
| "HECKS" display (was "LOTUS") | Personal tag |

Reflashing requires physical DIP2 switch — cannot be fully automated.
`inputmodule-control --bootloader` can enter bootloader but DIP2 must stay ON to
hold it there for UF2 copy.

---

## Migration (matrix.sh)

`matrix.sh` and all aliases stay untouched during transition. `dark-matrix` is additive
until stable. When stable, re-point aliases to the new CLI.

| matrix.sh feature | dark-matrix equivalent (Phase 4) |
|---|---|
| Light sensor brightness | Daemon brightness module |
| Time-of-day fallback | Same module, same logic |
| `yeah` (split heck/yeah) | `dark-matrix display yeah` |
| `panic` pattern | `dark-matrix display panic` |
| `runes` image + terminal art | `dark-matrix display runes` |
| `0x07` image | `dark-matrix display 0x07` |
| Aliases | Re-point after Phase 4 stable |

`dark-matrix release` — drops daemon's serial port handles so `matrix.sh` can run
during the transition without EBUSY errors.

---

## Open Risks

| # | Risk | Status | Mitigation |
|---|---|---|---|
| R1 | Serial contention during animation | Resolved | Daemon releases port after animation; `dark-matrix release` for manual compat |
| R2 | USB by-path left/right assignment not confirmed | Open | One-time `dark-matrix calibrate` visual check |
| R3 | FW16 privacy switches inaccessible | Open | Phase 2 pre-step: udev rule + ectool install |
| R4 | Audio-reactive fps ceiling unverified empirically | Open | First animation in Phase 3 will validate; firmware fallback if needed (needs sign-off) |
| R5 | Claude hooks touch `~/.claude/` | Managed | Explicit `--claude-hooks` install only; never auto |

---

## Non-Goals (v1)

- Mobile companion app
- Cloud sync / web UI
- Windows / macOS support
- Upstream firmware PR
- Network / CPU monitors (not in Phase 1–4 scope; add later if wanted)
