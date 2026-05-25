# dark-matrix — agent guide

Architecture invariants and conventions for AI agents working on this codebase.
See [CONTRIBUTING.md](CONTRIBUTING.md) for build and deploy mechanics.
See [README.md](README.md) for full feature and config documentation.

---

## Commit conventions

- Imperative mood, ≤72 chars, no period
- No `Co-Authored-By` trailer
- No emoji
- Prefix: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `chore(scope):`

Commits must use `HARNESS_COMMIT=1 git commit ...` — a pre-commit hook blocks commits without this marker.

---

## Key invariants

### Setup state

`config.uncalibrated` is the single source of truth for whether the device has been set up.

- `bootstrapConfig()` writes `uncalibrated: true` on first run
- `dark-matrix calibrate` writes `uncalibrated: false` after the user confirms left/right
- The Deck's skip button also writes `uncalibrated: false` via PUT `/api/config`
- The welcome screen shows when `uncalibrated === true`; it does not reappear after calibration

Never use `deckPrefs.setupComplete` or any other field for this check.

### Serial device paths

Module device paths are always `/dev/serial/by-path/...` symlinks — never raw `ttyACMn`.
The by-path form is stable across reboots and replug events; ttyACMn enumeration order is not.

### Transport selection

- `SerialTransport` — holds the port open across frames; used for all animation (daemon's main loop and live preview)
- `BinaryTransport` — spawns a control binary per command; used for one-shot CLI commands

Brightness in `SerialTransport` is a native 4-byte serial packet `[0x32, 0xAC, 0x00, pct]` — no external binary needed.

### Animation interface

All animations are async iterables:

```typescript
interface Animation {
  [Symbol.asyncIterator](): AsyncIterator<Frame>;
  stop(): void;
}
```

`runAnimation()` drives the loop. Never drive a `SerialTransport` frame write outside of `runAnimation` — it manages port lifecycle.

### TypeScript: exactOptionalPropertyTypes

`tsconfig.json` has `exactOptionalPropertyTypes: true`. You cannot pass `undefined` for an optional property — use a conditional spread:

```typescript
// wrong — TypeScript error
const opts = { ectoolPath: config.ectool_path };

// correct
const opts = {
  ...(config.ectool_path !== undefined ? { ectoolPath: config.ectool_path } : {}),
};
```

### HUD mode

- On WebSocket open, apply the active preset from the **in-memory store** — not from disk (disk may be stale from a previous session)
- The `hud-presets` IPC response must **not** re-send `hud-config` — the daemon's live state is authoritative
- Audio-viz must gate on `hudHardwareActive`, not `hudAudioStreaming`, to avoid competing with the HUD loop's `pw-record` process

### Config schema

The config is Zod-validated (`src/lib/config.ts`). Changes to the schema require updating:
1. The Zod schema
2. `DEFAULT_CONFIG`
3. Any `bootstrapConfig` logic that touches the changed field

---

## Testing

```sh
pnpm test          # all tests
pnpm test --watch  # watch mode
pnpm typecheck     # tsc --noEmit
```

Two tests are known pre-existing failures unrelated to any recent work:
- `daemon.test.ts` — ping response shape mismatch (version field added in Wave 3)
- `notification-assets.test.ts` — path changed from `assets/` to `library/`

Do not attempt to fix these as part of unrelated changes.

---

## File layout — where things live

| Concern | File |
|---|---|
| Daemon event loop + IPC handlers | `src/daemon/index.ts` |
| All CLI commands | `src/cli/index.ts` |
| Deck HTTP server + API routes | `src/deck/server.ts` |
| Config schema + loader + bootstrap | `src/lib/config.ts` |
| Serial transport (both modes) | `src/lib/transport.ts` |
| Brightness sensor loop | `src/lib/brightness.ts` |
| Notification priority queue | `src/lib/dispatcher.ts` |
| Frame type + bit-packing | `src/lib/frame.ts` |
| Animation runtime | `src/lib/animation.ts` |
| Deck web app shell | `src/deck/web/App.tsx` |
| First-run welcome screen | `src/deck/web/components/WelcomeScreen.tsx` |

---

## IPC protocol

Unix socket at `$XDG_RUNTIME_DIR/dark-matrix.sock`. JSON-line: one JSON object per message, newline-terminated.

Send `{ cmd: 'ping' }` → `{ ok: true, pong: true, version: string }`.

All commands return `{ ok: true, ... }` on success or `{ ok: false, error: string }` on failure.

---

## Release

Releases are cut by pushing a `v*` tag. GitHub Actions builds x64 and arm64 tarballs, bundles daemon and CLI with esbuild (serialport and sharp are external), packages a pinned node binary, and publishes a GitHub Release. See `.github/workflows/release.yml`.

User install: `curl -fsSL .../scripts/install.sh | sh`
