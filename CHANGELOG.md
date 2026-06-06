# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries are generated from the commit log at release time via the `/release` skill
(grouping conventional commits since the previous tag). Keep commit subjects in the
`type(scope): subject` form so they land in the right section.

## [Unreleased]

_Nothing yet._

## [0.1.1] - 2026-06-06

### Fixed

- Ship `ws` and `fft.js` in the release tarball's runtime `node_modules`. These
  are loaded at runtime via `createRequire` (not bundled by esbuild), so the
  Deck UI (`dark-matrix ui`) failed with a missing `ws` module and the audio-EQ
  animation failed on `fft.js`. The bundle externals are now the single source
  of truth for the shipped runtime dependencies.
- Harden the installer's systemd step: a failed `systemctl --user enable --now`
  (common over SSH or as root, with no user D-Bus session) no longer aborts the
  install. It now falls back to clear manual instructions and suggests
  `loginctl enable-linger` so the daemon starts at boot and survives logout.
- Blank both modules after calibration. The module lit with solid white during
  calibration is now turned off instead of being left on at full brightness.

## [0.1.0] - 2026-06-02

### Added

**Daemon & hardware**
- Persistent TypeScript/Node.js daemon driving two 9×34 LED matrix modules over USB serial
- Adaptive brightness via ambient light sensor, time-of-day scheduling, or manual control
- SIGHUP config hot-reload and a Zod-validated config schema with sensible defaults
- Automatic module discovery via stable `/dev/serial/by-path` symlinks

**Deck web UI**
- Design mode: pixel animation editor with live hardware preview, full undo/redo, GIF/PNG import-export, and a reusable library (with read-only built-in starter designs)
- HUD mode: named widget-layout presets per module side, with triggers
- Audio mode: real-time visualizer with many render styles
- Video mode: matrix-rendered video playback
- Games mode: Game of Life biomes
- Config mode: daemon settings with live preview
- Theming system with presets and a custom accent color picker
- First-run welcome screen and a hardware/daemon status chip

**HUD widgets**
- Clock faces, system data widgets (CPU, RAM, network), audio visualizers, Game of Life, images, Claude usage, and timers, via a widget descriptor registry

**CLI**
- Guided `init` first-run setup (config → calibrate → optional-dependency check)
- `calibrate`, `ui`, `ping`, `status`, `release`
- `scroll`, `animate gif`, `image`, `show`, `show-split`, `display`, `hud preset`, `life`
- `install` (systemd user service, EC privacy-switch udev access, Claude Code hooks), `self-update`, `uninstall`
- Grouped color help with an ascii banner and `--version`

**Notifications**
- Priority-queued display intents from desktop (D-Bus), VM activity (libvirt), Claude Code hooks, and EC privacy switches (camera/mic)
- Glob- and urgency-based routing rules with text, design, or suppress actions

**Installation & distribution**
- One-line curl installer that registers and starts the systemd user service
- GitHub Actions release workflow building x64 and arm64 tarballs with a pinned Node binary and bundled native modules (serialport, sharp)
- In-place updates via `self-update`

**Project**
- Licensed under GPL-3.0-or-later
- Contributor guide, issue forms, and a commit-lint CI check
