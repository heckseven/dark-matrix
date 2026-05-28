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

Two tests are pre-existing failures unrelated to any recent work — skip them, don't fix them:

- `daemon.test.ts` — ping response shape mismatch (version field added in Wave 3)
- `notification-assets.test.ts` — path changed from `assets/` to `library/`

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

See [README.md](README.md) for full architecture documentation, config schema, API reference,
and feature descriptions.

For AI agent conventions and project invariants, see [CLAUDE.md](CLAUDE.md).
