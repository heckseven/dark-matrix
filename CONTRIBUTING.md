# Contributing

## Dev setup

```sh
git clone <repo> ~/projects/dark-matrix
cd ~/projects/dark-matrix
pnpm install
pnpm build
```

Requires Node 24+ and pnpm. Use nvm:

```sh
nvm install 24
nvm use 24
```

## Tests

```sh
pnpm test          # vitest, all tests
pnpm test --watch  # watch mode
pnpm typecheck     # tsc --noEmit, no emit
```

## Deploy to hardware

After building, install the daemon as a systemd user service:

```sh
node dist/cli/index.js install --user-systemd
```

This compiles esbuild bundles, installs runtime deps, copies the node binary, writes the
systemd unit, and starts the service.

For incremental changes during development (skips the full reinstall):

```sh
pnpm build
node dist/cli/index.js install --user-systemd
```

The service is restarted automatically. Check it with:

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
