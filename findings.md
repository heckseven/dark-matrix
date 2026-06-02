## probe-usb-topology

### Raw command output

**udevadm info -q all -n /dev/ttyACM0**
```
P: /devices/pci0000:00/0000:00:08.1/0000:c5:00.3/usb1/1-3/1-3.3/1-3.3:1.0/tty/ttyACM0
E: DEVPATH=/devices/pci0000:00/0000:00:08.1/0000:c5:00.3/usb1/1-3/1-3.3/1-3.3:1.0/tty/ttyACM0
E: ID_PATH=pci-0000:c5:00.3-usb-0:3.3:1.0
E: ID_PATH_TAG=pci-0000_c5_00_3-usb-0_3_3_1_0
E: ID_SERIAL_SHORT=FRAKDEBZ0100000000
E: ID_USB_INTERFACE_NUM=00
S: serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0
S: serial/by-path/pci-0000:c5:00.3-usbv2-0:3.3:1.0
S: serial/by-id/usb-Framework_Computer_Inc_LED_Matrix_Input_Module_FRAKDEBZ0100000000-if00
```

**udevadm info -q all -n /dev/ttyACM1**
```
P: /devices/pci0000:00/0000:00:08.1/0000:c5:00.3/usb1/1-4/1-4.2/1-4.2:1.0/tty/ttyACM1
E: DEVPATH=/devices/pci0000:00/0000:00:08.1/0000:c5:00.3/usb1/1-4/1-4.2/1-4.2:1.0/tty/ttyACM1
E: ID_PATH=pci-0000:c5:00.3-usb-0:4.2:1.0
E: ID_PATH_TAG=pci-0000_c5_00_3-usb-0_4_2_1_0
E: ID_SERIAL_SHORT=FRAKDEBZ0100000000
E: ID_USB_INTERFACE_NUM=00
S: serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0
S: serial/by-path/pci-0000:c5:00.3-usbv2-0:4.2:1.0
S: serial/by-id/usb-Framework_Computer_Inc_LED_Matrix_Input_Module_FRAKDEBZ0100000000-if00
```

**ls -la /sys/bus/usb/devices/** — both `1-3.3` and `1-4.2` present, resolving to:
```
/sys/devices/pci0000:00/0000:00:08.1/0000:c5:00.3/usb1/1-3/1-3.3
/sys/devices/pci0000:00/0000:00:08.1/0000:c5:00.3/usb1/1-4/1-4.2
```

**Framework devices (vendor 32ac):**
```
PORT:1-3.3  vendor:32ac  product:0020  (LED Matrix)
PORT:1-4.2  vendor:32ac  product:0020  (LED Matrix)
PORT:1-4.3  vendor:32ac  product:0012
PORT:2-2.2  vendor:32ac  product:0005
```

**ls -la /dev/serial/by-path/**
```
pci-0000:c5:00.3-usb-0:3.3:1.0  -> ../../ttyACM0
pci-0000:c5:00.3-usb-0:4.2:1.0  -> ../../ttyACM1
```

### Path mapping

| ttyACM | DEVPATH (abbreviated)                      | ID_PATH                          | ID_SERIAL_SHORT      |
|--------|--------------------------------------------|----------------------------------|----------------------|
| ttyACM0 | .../usb1/1-3/1-3.3/1-3.3:1.0/tty/ttyACM0 | pci-0000:c5:00.3-usb-0:3.3:1.0  | FRAKDEBZ0100000000   |
| ttyACM1 | .../usb1/1-4/1-4.2/1-4.2:1.0/tty/ttyACM1 | pci-0000:c5:00.3-usb-0:4.2:1.0  | FRAKDEBZ0100000000   |

Both modules share identical `ID_SERIAL_SHORT`. Port `1-3.3` → `ttyACM0`; port `1-4.2` → `ttyACM1`. The stable device paths are `/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0` and `/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0`.

**What's determinable statically:** The port-to-ttyACMn mapping is consistent with the `by-path` symlinks. The physical port numbers (`1-3.3`, `1-4.2`) are hardwired to the internal USB hub topology of the Framework 16 — these are not hotplug USB-A ports, they are internal header connections. The `by-path` symlinks are generated deterministically from port path, not enumeration order.

**What needs live testing to confirm:** A reboot or replug cycle would verify that `ttyACMn` minor numbers don't shift (e.g., ttyACM0 becoming ttyACM1 after reboot). However, the `by-path` symlinks are immune to that — they key on physical port, not enumeration order. Code should reference `/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0` and `...4.2:1.0` rather than `/dev/ttyACM0`/`ttyACM1`.

### Recommendation

**needs-live-test**

The port-path topology is clearly distinct (`1-3.3` vs `1-4.2`) and the `by-path` symlinks already encode this mapping stably. However, left/right physical assignment (which port is which matrix) has not been confirmed by swapping or labeling — a single reboot plus visual verification (send a pattern to one path, observe which panel lights up) would elevate this to `stable`.
## probe-serial-contention

### Current port holders

lsof and fuser both returned empty (exit 1) — no process is currently holding /dev/ttyACM0 or /dev/ttyACM1 open. Both devices exist on the system (/dev/ttyACM0, /dev/ttyACM1 enumerated).

### inputmodule-control serial lifecycle

One-shot per command. Every command function opens a fresh port and drops it when the function returns (Rust Drop on the local binding).

Key evidence:

- `simple_cmd` (`inputmodule-control/src/inputmodule.rs:399-411`): opens port, calls `simple_cmd_port`, returns — port dropped at end of scope.
- `brightness_cmd`, `sleeping_cmd`, `animate_cmd`, `debug_mode_cmd`, `all_brightnesses_cmd`, `display_gray_image_cmd`, `animation_fps_cmd`, `pwm_freq_cmd`, `fps_cmd`, `power_mode_cmd`, `get_device_version` — all open via `serialport::new(...).open()` at the top of each function and drop at return. No port handle is stored across calls.
- The only long-lived port usage is in `gif_cmd` and `b1display_bw_image_cmd` (via `open_serialport`), but these are persistent only for the duration of a single blocking invocation (looping GIF playback), not across separate CLI invocations.
- Multi-command invocations (e.g. `--image-bw` + `--brightness` in one CLI call) open a **separate** port for each flag, sequentially, not a shared connection.
- Python reference implementation confirms the pattern explicitly — `send_command_raw` comment reads "Opens new serial connection every time" and uses `with serial.Serial(...) as s:` (context manager, closes on exit). (`python/inputmodule/inputmodule/__init__.py:129-143`)

Lifecycle summary: **open → write → (read) → close**, per command, per invocation.

### Contention analysis

On Linux, `serialport` opens the TTY with O_RDWR | O_NOCTTY | O_NONBLOCK. A second `open()` on the same device by a different process will **succeed** — Linux serial devices are not exclusively locked by default. However, concurrent writes from two openers will interleave bytes and corrupt the protocol framing, producing garbage commands or silent failures on the device.

Practical impact if a daemon holds `/dev/ttyACM0` open with `SerialTransport` while `matrix.sh` runs `inputmodule-control`:
- Both opens succeed (no EBUSY).
- If the daemon is actively writing (e.g. a clock tick), bytes from `matrix.sh` and the daemon interleave on the wire → malformed command → device ignores or misinterprets it.
- If the daemon is idle (port open, no writes in flight), `matrix.sh` writes successfully and the daemon's next write succeeds too — the state the daemon believes it set will have been clobbered by `matrix.sh`, causing a visual glitch on the next daemon update.
- `matrix.sh` calls two sequential `inputmodule-control` invocations in the `yeah` case (`--serial-dev /dev/ttyACM1` then `--serial-dev /dev/ttyACM0`), each a separate process. The daemon must not be writing concurrently with either.

### Recommendation

**BinaryTransport (shell-out-per-command)**

Since `inputmodule-control` is architecturally one-shot and `matrix.sh` must continue to work without modification, the daemon should not hold the port open persistently. Shell out per command: acquire the port, write, release. This naturally serializes access with any other caller and requires zero coordination with existing scripts.
## probe-pipewire

### PipeWire status
All three services active and running since 2026-04-28:
- pipewire.service: active (running)
- pipewire-pulse.service: active (running)
- wireplumber.service: active (running)

### pw-record availability
`/usr/bin/pw-record` — compiled and linked with libpipewire 1.0.5

### Audio nodes
Sinks:
- ID: 49  Name: alsa_output.pci-0000_c5_00.6.analog-stereo  Class: Audio/Sink  (Family 17h/19h HD Audio Controller Analog Stereo)

Sources:
- ID: 50  Name: alsa_input.pci-0000_c5_00.6.analog-stereo  Class: Audio/Source  (Family 17h/19h HD Audio Controller Analog Stereo)

Monitor sources (for system audio capture):
- Name: alsa_output.pci-0000_c5_00.6.analog-stereo.monitor  (implicit — PipeWire exposes a monitor source for every sink by appending `.monitor`; not listed as a separate pw-dump object but addressable by name as a `--target`)

Default mic: alsa_input.pci-0000_c5_00.6.analog-stereo

### User permissions
Groups: plugdev (confirmed) — no `audio` or `pipewire` group membership.
Can record without special group: yes — PipeWire grants access to the session user via the user session bus; no `audio` group required.

### Exact commands

System audio (monitor):
`pw-record --target=alsa_output.pci-0000_c5_00.6.analog-stereo.monitor --format=s16 --rate=44100 --channels=1 -`

Microphone:
`pw-record --target=alsa_input.pci-0000_c5_00.6.analog-stereo --format=s16 --rate=44100 --channels=1 -`

### Caveats
- `pactl` is not installed (no `pulseaudio-utils` package); only pw-record/pw-dump/pw-cli are available.
- Node IDs (49/50) are not stable across reboots — always use node names, not IDs, in `--target`.
- The monitor source (`...analog-stereo.monitor`) does not appear in `pw-dump` as its own object; it is a virtual endpoint synthesized by WirePlumber from the sink. It is addressable by name in pw-record `--target` but cannot be enumerated via pw-dump's media.class filter.
- Default rate for pw-record is 48000 Hz — the commands above override to 44100 Hz as specified. Either works; 48000 is the native ALSA rate for this hardware and avoids resampling.

## probe-claude-hooks

### ~/.claude/ structure
```
drwxrwxr-x  19  .
-rw-rw-r--      .active-campaign
lrwxrwxrwx      agents -> ../dotfiles/.claude/agents
drwxrwxr-x      backups/
drwxrwxr-x      campaign-TlGzGB/
-rw-------      .credentials.json
drwxrwxr-x      debug/
lrwxrwxrwx      docs -> ../dotfiles/.claude/docs
-rw-------  66K history.jsonl
drwxrwxr-x      hooks/   (contains notify.sh symlink only)
drwxrwxr-x      plugins/
drwxrwxr-x      projects/   (per-project JSONL session transcripts)
drwxrwxr-x      session-env/
drwx------      sessions/
lrwxrwxrwx      settings.json -> ../dotfiles/.claude/settings.json
lrwxrwxrwx      skills -> ../dotfiles/.claude/skills
```

### settings.json hooks section
Currently configured: `Stop` (notify.sh stop) and `Notification` (idle_prompt, permission_prompt).
No PostToolUse/PreToolUse hooks configured yet. Example of the format in use:
```json
"hooks": {
  "Stop": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/notify.sh stop" }] }],
  "Notification": [
    { "matcher": "idle_prompt", "hooks": [{ "type": "command", "command": "~/.claude/hooks/notify.sh idle" }] }
  ]
}
```

### Session log format
Log file location: `~/.claude/projects/<project-hash>/<session-uuid>.jsonl`
Contains tool use events: yes
Update frequency: real-time (entries written as events occur — timestamps span the session duration with sub-second granularity, not flushed at end)

Example tool_use entry (inside an assistant message line):
```json
{
  "type": "tool_use",
  "id": "toolu_014hg8YmJrYFQEPa5PGidZSM",
  "name": "Bash",
  "input": {
    "command": "cd ~/projects/inputmodule-rs && git diff HEAD 2>/dev/null | head -500",
    "description": "Show git diff of user's changes in inputmodule-rs"
  },
  "caller": { "type": "direct" }
}
```
Sub-agent spawn entries use `"name": "Agent"` with `"input": { "subagent_type": "...", "description": "...", "prompt": "..." }`.
Each entry is a full JSONL line with outer fields: `type`, `uuid`, `timestamp`, `sessionId`, `cwd`, `message.content[].type == "tool_use"`.

Caveats: the JSONL line is the full assistant message object — tool_use items are nested inside `message.content[]`. Parsing requires extracting the content array, not matching on top-level type.

### Hook mechanism
Event types available: PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact, Notification

Stdin payload format (all hooks receive this JSON on stdin):
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/dir",
  "permission_mode": "ask|allow",
  "hook_event_name": "PreToolUse"
}
```
PostToolUse/PreToolUse add: `tool_name`, `tool_input`, `tool_result`
UserPromptSubmit adds: `user_prompt`
Stop/SubagentStop add: `reason`

Env vars available to hook script:
- `$CLAUDE_PROJECT_DIR` — project root
- `$CLAUDE_PLUGIN_ROOT` — plugin dir (if invoked from a plugin hook)
- `$CLAUDE_ENV_FILE` — SessionStart only: write to persist env vars into session
- `$CLAUDE_CODE_REMOTE` — set if remote context

Can invoke arbitrary shell command: yes

Exit code semantics:
- 0: success, stdout shown in transcript
- 2: stderr fed back to Claude as blocking error
- other: non-blocking error

Hooks run in parallel for all matching entries. Loaded at session start — changes require restart.

### Example hook script
```sh
#!/bin/sh
# PostToolUse hook — POSTs tool use event to dark-matrix daemon
# Registered in settings.json under "PostToolUse" with matcher "*"
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // "unknown"')
ts=$(date -Iseconds)
payload=$(echo "$input" | jq -c --arg ts "$ts" '. + {received_at: $ts}')
echo "$payload" | curl -sf --unix-socket "${XDG_RUNTIME_DIR:-/run/user/1000}/dark-matrix.sock" \
  -X POST http://localhost/event \
  -H "Content-Type: application/json" \
  -d @- > /dev/null 2>&1 || true
exit 0
```

### Recommendation
hooks-push

PostToolUse/PreToolUse hooks deliver structured JSON (tool_name, tool_input, tool_result) synchronously to any shell command with no polling overhead. The daemon gets a clean event per tool call with no parsing of nested JSONL required. Log-tail is viable but adds latency, requires tracking file rotation across sessions, and means parsing the full assistant message object to extract the nested content array. The hook path is one curl call per event and is already proven by the notify.sh pattern in this repo.
## probe-serial-throughput

### Baud rate / USB speed

`stty -F /dev/ttyACM0 -a` reports `speed 9600 baud` — this is a nominal/legacy CDC ACM
setting. USB CDC ACM does not use baud rate for actual data transfer speed; the value is
passed to the firmware as metadata but the transport runs at USB 2.0 Full-Speed (12 Mbps
raw, ~1 MB/s effective after USB framing overhead). The baud rate setting is irrelevant
to throughput.

### Wire protocol

```
Command byte: 0x06 (DisplayBwImage)
Header: FWK_MAGIC[0x32, 0xAC] + cmd[1 byte] = 3 bytes
BW frame payload: 39 bytes (306 pixels packed LSB-first as bits: ceil(306/8) = 39)
Total bytes per BW frame: 42 bytes
```

```
Grayscale frame uses 10 serial writes:
  SendCol (0x07): 9 × [FWK_MAGIC(2) + cmd(1) + col_idx(1) + 34 brightness vals] = 9 × 38 = 342 bytes
  CommitCols (0x08): FWK_MAGIC(2) + cmd(1) = 3 bytes
Total bytes per grayscale frame: 345 bytes
```

Sources:
- `inputmodule-control/src/inputmodule.rs:16` — `FWK_MAGIC = [0x32, 0xAC]`
- `inputmodule-control/src/inputmodule.rs:26-53` — `Command` enum (DisplayBwImage=0x06, SendCol=0x07, CommitCols=0x08)
- `inputmodule-control/src/inputmodule.rs:424-431` — `simple_cmd_port`: writes `buffer[0..3+args.len()]`
- `inputmodule-control/src/inputmodule.rs:513-518` — `send_col`: args = col_idx(1) + 34 brightness vals
- `inputmodule-control/src/inputmodule.rs:590-610` — `display_bw_image_cmd`: 39-byte vals array
- `inputmodule-control/src/inputmodule.rs:633-658` — `display_gray_image_cmd`: 9 send_col + commit_cols
- `python/inputmodule/inputmodule/ledmatrix.py:88` — Python confirms `vals = [0 for _ in range(39)]` for BW
- `python/inputmodule/inputmodule/ledmatrix.py:233-243` — Python confirms `StageGreyCol` + `DrawGreyColBuffer` pattern

### Throughput calculations

**Nominal baud-rate math (academic — baud rate is not the real limit):**
- Formula: `fps = 115200 / (10 × bytes_per_frame)`
- BW: 115200 / (10 × 42) = **274 fps**
- Grayscale: 115200 / (10 × 345) = **33 fps**

**USB Full-Speed practical ceiling (~1 MB/s effective throughput):**
- BW: 1,000,000 / 42 = **~23,800 fps** (absurd — firmware is the real limit)
- Grayscale: 1,000,000 / 345 = **~2,900 fps** (same)

**Note:** USB CDC ACM runs at USB 2.0 Full-Speed (12 Mbps). The nominal baud rate
(9600 or 115200) is metadata passed to the firmware via a CDC control request; it does
not throttle USB bulk transfer speed. The actual throughput ceiling is USB packet
overhead + firmware processing time on the RP2040. Neither limit has been characterized
empirically here — the firmware's IS31FL3741A PWM cycle (~29 kHz frame rate) and
RP2040 USB interrupt latency are the real governors. Practical expectation based on
similar RP2040 USB-CDC projects: sustained 60–120 fps for BW frames is achievable;
grayscale (10 serial writes per frame) is closer to 30–60 fps.

**BinaryTransport (shell-out per frame):**
- Measured: `--brightness` (write + read response): ~35–41ms; write-only `--pattern`: ~55–63ms
- `image_bw` is write-only; estimate ~40ms (port open + write + close, no response wait)
- `SERIAL_TIMEOUT` is 20ms (`inputmodule-control/src/inputmodule.rs:68`)
- Max fps: 1000 / 40ms = **~25 fps** (optimistic); 1000 / 60ms = **~16 fps** (pessimistic)
- These are single-module numbers. Two modules in sequence halves it: **~8–12 fps** for split/span.

### Recommendation

**Use `SerialTransport` (direct Node.js serial writes) for animation.**

BinaryTransport is capped at ~16–25 fps for a single module due to process spawn + port
open/close overhead on every frame — and this was already called out in probe-serial-contention
as the safe default for non-animation commands. For animation loops at ≥30 fps, the
overhead is unacceptable.

`SerialTransport` holds the port open across frames, sending only the 42-byte BW command
per tick. At USB Full-Speed the wire is never the bottleneck; firmware PWM cycle and RP2040
processing are. Target **30 fps** for BW animation as a conservative, demonstrably safe
ceiling that leaves firmware headroom. If empirical testing (probe 0.3) shows the firmware
can sustain faster, raise to 60 fps.

For grayscale animation (345 bytes, 10 writes per frame), target **15–20 fps** — the 10
sequential serial writes add latency even with a held port.

The `BinaryTransport` remains correct for one-shot commands (brightness, pattern, image
display) where the ~40ms overhead is imperceptible and the architectural safety (no
persistent port hold) outweighs the cost. The `dark-matrix release` mechanism is only
needed if the daemon uses `SerialTransport`; document this clearly in `transport.ts`.
## probe-fw16-switches

### Input devices found

No Framework16 privacy switch input device is present. Full enumeration of `/proc/bus/input/devices` (names only):
- Lid Switch (event0) — SW=1 (SW_LID)
- Power Button (event1)
- Video Bus (event2)
- PIXA3854:00 093A:0274 Mouse (event3)
- PIXA3854:00 093A:0274 Touchpad (event4)
- Framework Laptop 16 Keyboard Module - ANSI (event5) — no SW
- Framework Laptop 16 Keyboard Module - ANSI System Control (event6) — no SW
- Framework Laptop 16 Keyboard Module - ANSI Consumer Control (event7) — no SW
- Framework Laptop 16 Keyboard Module - ANSI Wireless Radio Control (event8) — no SW
- Framework Laptop 16 Keyboard Module - ANSI Keyboard (event9) — no SW
- HDA ATI HDMI / HD-Audio Generic HDMI nodes (event10–16) — SW=0x140 (SW_LINEOUT_INSERT|SW_VIDEOOUT_INSERT, HDMI plug detection only)

No device advertises SW_MUTE_DEVICE (bit 14 / 0x4000) or SW_CAMERA_LENS_COVER (bit 15 / 0x8000).

Consumer Control (event7) KEY bitmap checked — KEY_MICMUTE (0x1B3), KEY_CAMERA (0x212), KEY_PRIVACY_SCREEN_TOGGLE (0x1EF): none present.

### User permissions
Groups: plugdev (confirmed) — not in `input` group
/dev/input/event* permissions: crw-rw---- root input (all nodes)
Input group member: no

### Privacy switch device

Device: not found
Name: N/A
EV_SW capabilities: N/A

Infrastructure present but not surfacing an input device:
- cros-ec stack is fully loaded: `cros_ec`, `cros_ec_proto`, `cros_ec_dev`, `cros_ec_lpcs`, `cros_ec_chardev`, `gpio_cros_ec` (gpiochip1, base 768, 94 lines)
- `/dev/cros_ec` exists: `crw------- root root` — root-only, no input group
- `chromeos_privacy_screen` kernel module is installed (`/lib/modules/6.17.0-20-generic/kernel/drivers/platform/chrome/chromeos_privacy_screen.ko.zst`) but **not loaded** — this driver targets ePrivacy e-ink overlay screens, not physical mic/camera toggle switches
- No `framework_laptop` or `ec_switches` platform driver is registered
- HID devices 0003:32AC:0012.000C and .000E are hid-generic with vendor-specific (0xff00) HID report descriptors — these are the proprietary LED matrix control interfaces, not switch reporters
- IIO device from HID sensor hub (0018:32AC:001B) is an ambient light sensor (`in_illuminance_raw`), not a switch

### Permission verdict

not-found

No kernel input device exposes the physical mic mute or camera shutter switches. The switches are likely read by the EC firmware and would require either: (a) `ectool switches` via `/dev/cros_ec` (root-only), or (b) a kernel driver that does not yet exist for this hardware — the Framework 16 privacy switches are not yet surfaced as `EV_SW` input events under kernel 6.17.0-20-generic.

### Phase 2 pre-step: COMPLETE

- udev rule installed: `KERNEL=="cros_ec", GROUP="plugdev", MODE="0660"` → `/dev/cros_ec` is now user-accessible
- ectool built from `~/projects/EmbeddedController` (`make BOARD=host utils`) → binary at `build/host/util/ectool`
- EC board: `lotus_v3.4.113371` (Framework 16)
- Privacy switch GPIOs confirmed via `ectool gpioget`:
  - `CAM_SW` — camera privacy switch (0=covered, 1=open)
  - `MIC_SW` — microphone privacy switch (0=muted, 1=active)
- `ectool switches` does NOT include privacy switches — must use `gpioget CAM_SW` / `gpioget MIC_SW`
- ectool binary path: `~/projects/EmbeddedController/build/host/util/ectool`

### Caveats
- `ectool` is not installed system-wide — callers must use full path or add to PATH.
- `dmesg` is blocked for unprivileged users on this system (`read kernel buffer failed: Operation not permitted`), so kernel boot messages could not be inspected for EC switch registration.
- The Framework 16 keyboard module (USB 32AC:0012) does expose a "Wireless Radio Control" interface (event8, rfkill) but this maps to the airplane-mode key, not the physical privacy switches on the chassis.
- A future `framework_laptop` platform driver or EC firmware update adding HID usage codes could expose these as `SW_MUTE_DEVICE`/`SW_CAMERA_LENS_COVER` events, but that is not the current state.
- For dark-matrix purposes: the privacy switches cannot be polled or reacted to in userspace without root or a new udev rule granting access to `/dev/cros_ec` (and installing `ectool` or writing a direct ioctl client).

---

## Synthesis — Architecture Decisions Locked

### 1. Transport: Dual-mode (not pick-one)

**Probe 0.2** said BinaryTransport. **Probe 0.3** contradicts it for animation.
The correct architecture uses both:

| Mode | Implementation | When |
|---|---|---|
| `BinaryTransport` | Shell out to `inputmodule-control` per command | All one-shot commands: brightness, patterns, images, misc |
| `SerialTransport` | Hold port open, direct Node.js serial writes | Animation sequences only — daemon takes exclusive write access during playback |

The daemon starts in BinaryTransport mode. On animation start, it transitions to
SerialTransport (opens port, holds it). On animation stop, it releases the port
and returns to BinaryTransport. The `dark-matrix release` command forces port
release so matrix.sh can run during transition.

**fps targets:** 30fps BW (42 bytes/frame), 15–20fps grayscale (345 bytes/frame).

---

### 2. Side Detection: Use by-path symlinks, not ttyACMn

Replace all ttyACM references in SPEC and code with by-path paths:

| Role | Stable path | Current ttyACM |
|---|---|---|
| Module A (port 1-3.3) | `/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0` | ttyACM0 |
| Module B (port 1-4.2) | `/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0` | ttyACM1 |

Left/right assignment (which path is which side) is **not yet confirmed** — needs
one visual check: send a pattern to one path, observe which panel lights up.
Status: `needs-live-test`. Code should be written against by-path names; left/right
assignment goes in config and is set during first-run calibration.

---

### 3. FW16 Privacy Switches: Blocked — mitigation required

**The mic and camera switches are not accessible from userspace under kernel 6.17.**
No evdev device exposes them. They live in the EC and are readable only via
`/dev/cros_ec` (root-only).

Two mitigation paths (in order of preference):

1. **udev rule + ectool** (fast): Add a udev rule granting the active user read access
   to `/dev/cros_ec`, install `ectool`, poll `ectool gpioget CAM_SW` and `ectool gpioget MIC_SW`
   every ~500ms from the daemon. This is a pre-Phase-2 setup step, not a code change.
   ```
   # /etc/udev/rules.d/99-cros-ec-user.rules
   KERNEL=="cros_ec", GROUP="plugdev", MODE="0660"
   ```
   Then install ectool: `sudo apt install ectool` (if available) or build from source.

2. **kernel driver** (correct but slow): A `framework_laptop` or EC switch driver
   that maps EC switch state to `EV_SW` input events. Not available for kernel 6.17.
   Monitor Framework kernel patches — may land in a future version.

**Phase 2 status:** Mic/camera notification feature is blocked until one of the above
is in place. Add as a pre-Phase-2 setup step in SPEC.

---

### 4. Claude Activity: hooks-push confirmed

Register `PostToolUse` hook with matcher `"*"` in `~/.claude/settings.json`.
Payload includes `tool_name`, `tool_input`, `tool_result`. Sub-agent spawns appear
as `tool_name: "Agent"`. Hook pipes to daemon via `curl --unix-socket`.
Install via `dark-matrix install --claude-hooks` only — never auto-installed.

---

### 5. PipeWire: Confirmed, no permissions needed

No `audio` group required. Use node names (not IDs) — IDs change across reboots.

```sh
# System audio monitor
pw-record --target=alsa_output.pci-0000_c5_00.6.analog-stereo.monitor \
  --format=s16 --rate=44100 --channels=1 -

# Microphone
pw-record --target=alsa_input.pci-0000_c5_00.6.analog-stereo \
  --format=s16 --rate=44100 --channels=1 -
```

Note: 48000 Hz is native hardware rate; 44100 triggers resampling. Consider
defaulting to 48000 in the daemon config.

---

### Open items after Phase 0

| Item | Action |
|---|---|
| Left/right by-path assignment | Visual check: send pattern to each path, note which side lights up |
| ectool + udev rule for /dev/cros_ec | DONE — udev rule installed, ectool built from Framework/EmbeddedController (BOARD=host utils) |
| Confirm animation fps empirically | First animation in Phase 3 will validate 30fps ceiling |
