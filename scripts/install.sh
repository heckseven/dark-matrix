#!/bin/sh
# dark-matrix installer
# Usage: curl -fsSL https://raw.githubusercontent.com/heckseven/dark-matrix/main/scripts/install.sh | sh
set -euf

REPO="heckseven/dark-matrix"
INSTALL_DIR="$HOME/.local/share/dark-matrix"
BIN_DIR="$HOME/.local/bin"
UNIT_DIR="$HOME/.config/systemd/user"

# ── Arch detection ────────────────────────────────────────────────────────────
case "$(uname -m)" in
  x86_64)  ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
  *) printf 'Unsupported architecture: %s\n' "$(uname -m)" >&2; exit 1 ;;
esac

# ── Version resolution ────────────────────────────────────────────────────────
VERSION="${DM_VERSION:-}"
if [ -z "$VERSION" ]; then
  VERSION=$(curl -sf "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//')
fi
if [ -z "$VERSION" ]; then
  printf 'Failed to determine latest version. Set DM_VERSION= to override.\n' >&2
  exit 1
fi

TARBALL="dark-matrix-${VERSION}-linux-${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$VERSION/$TARBALL"

printf 'Installing dark-matrix %s (%s)...\n' "$VERSION" "$ARCH"

# ── Stop existing service ─────────────────────────────────────────────────────
systemctl --user stop dark-matrix 2>/dev/null || true

# ── Download + extract ────────────────────────────────────────────────────────
TMP=$(mktemp -d)
# shellcheck disable=SC2064
trap "rm -rf '$TMP'" EXIT

printf 'Downloading %s\n' "$URL"
curl -fL --progress-bar "$URL" -o "$TMP/$TARBALL"
tar -xzf "$TMP/$TARBALL" -C "$TMP"

# ── Install files ─────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$UNIT_DIR"

# Copy tarball contents into install dir (rsync-style: overwrite, keep structure)
cp -r "$TMP/dark-matrix/." "$INSTALL_DIR/"
chmod 0755 "$INSTALL_DIR/node"

# ── Shell wrapper ─────────────────────────────────────────────────────────────
cat > "$BIN_DIR/dark-matrix" << WRAPPER
#!/bin/sh
exec "$INSTALL_DIR/node" "$INSTALL_DIR/dist/bundles/cli.js" "\$@"
WRAPPER
chmod 0755 "$BIN_DIR/dark-matrix"

# ── systemd unit ──────────────────────────────────────────────────────────────
cp "$INSTALL_DIR/systemd/dark-matrix.service" "$UNIT_DIR/"

# Enabling the user service needs a reachable user systemd/D-Bus instance, which
# is often absent under `curl | sh` over SSH or as root. Guard it so a failure
# never aborts the rest of the install (set -e), and fall back to clear manual
# instructions. The `if` also suspends set -e for the condition.
USER_NAME=$(id -un)
if systemctl --user daemon-reload 2>/dev/null \
   && systemctl --user enable --now dark-matrix 2>/dev/null; then
  printf 'Service enabled and started.\n'
  # Recommend lingering so the daemon starts at boot and survives logout.
  if command -v loginctl >/dev/null 2>&1 \
     && [ "$(loginctl show-user "$USER_NAME" -p Linger --value 2>/dev/null)" != "yes" ]; then
    printf 'Tip: start dark-matrix at boot and keep it running after logout:\n'
    printf '  sudo loginctl enable-linger %s\n' "$USER_NAME"
  fi
else
  printf 'Warning: could not enable the systemd user service automatically.\n'
  if [ -z "${XDG_RUNTIME_DIR:-}" ] || [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    printf '  No user D-Bus/systemd session detected (common over SSH or as root).\n'
  fi
  printf '  The unit is installed at %s/dark-matrix.service\n' "$UNIT_DIR"
  printf '  Enable it from a normal login session with:\n'
  printf '    systemctl --user daemon-reload && systemctl --user enable --now dark-matrix\n'
  printf '    sudo loginctl enable-linger %s   # optional: start at boot\n' "$USER_NAME"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
printf '\ndark-matrix %s installed.\n' "$VERSION"

# PATH hint
case ":${PATH}:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'Note: add %s to PATH, e.g. echo '\''export PATH="$HOME/.local/bin:$PATH"'\'' >> ~/.bashrc\n' "$BIN_DIR" ;;
esac

printf 'Verify with: dark-matrix ping\n\n'

# ── Serial port group check ───────────────────────────────────────────────────
SERIAL_DEV=""
for dev in /dev/ttyACM0 /dev/ttyUSB0; do
  [ -e "$dev" ] && SERIAL_DEV="$dev" && break
done
if [ -n "$SERIAL_DEV" ]; then
  SERIAL_GROUP=$(stat -c '%G' "$SERIAL_DEV" 2>/dev/null || true)
  if [ -n "$SERIAL_GROUP" ] && ! id -nG 2>/dev/null | grep -qw "$SERIAL_GROUP"; then
    printf 'Warning: not in group "%s" (required for serial port access).\n' "$SERIAL_GROUP"
    printf '  sudo usermod -aG %s %s\n' "$SERIAL_GROUP" "$(id -un)"
    printf '  Log out and back in for the change to take effect.\n\n'
  fi
fi

# ── Optional dependencies ─────────────────────────────────────────────────────
MISSING=""
for bin in ffmpeg wpctl pw-dump yt-dlp dbus-monitor; do
  command -v "$bin" >/dev/null 2>&1 || MISSING="$MISSING $bin"
done
if [ -n "$MISSING" ]; then
  printf 'Optional packages not found:%s\n' "$MISSING"
  if command -v apt-get >/dev/null 2>&1; then
    printf '  sudo apt install ffmpeg wireplumber pipewire-utils yt-dlp dbus-x11\n'
  elif command -v dnf >/dev/null 2>&1; then
    printf '  sudo dnf install ffmpeg wireplumber pipewire-utils yt-dlp dbus-tools\n'
  elif command -v pacman >/dev/null 2>&1; then
    printf '  sudo pacman -S ffmpeg wireplumber pipewire yt-dlp dbus\n'
  fi
fi
