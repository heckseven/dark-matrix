import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UNIT_NAME = 'dark-matrix.service';
const INSTALL_DIR = path.join(os.homedir(), '.local', 'share', 'dark-matrix');
const UNIT_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');

async function cmdInstallUserSystemd() {
  const nodeBin = process.execPath;
  const daemonSrc = path.resolve(__dirname, '../daemon/index.js');
  const unitSrc = path.resolve(__dirname, '../../systemd', UNIT_NAME);

  await fs.mkdir(INSTALL_DIR, { recursive: true });
  await fs.mkdir(UNIT_DIR, { recursive: true });

  await fs.copyFile(nodeBin, path.join(INSTALL_DIR, 'node'));
  await fs.chmod(path.join(INSTALL_DIR, 'node'), 0o755);
  await fs.copyFile(daemonSrc, path.join(INSTALL_DIR, 'daemon.mjs'));
  await fs.copyFile(unitSrc, path.join(UNIT_DIR, UNIT_NAME));

  process.stdout.write(`Installed ${UNIT_NAME} to ${UNIT_DIR}\n`);
  process.stdout.write(`Run: systemctl --user daemon-reload && systemctl --user enable --now dark-matrix\n`);
}

async function cmdInstallEcAccess() {
  const ruleSrc = path.resolve(__dirname, '../../udev/99-cros-ec-user.rules');
  const dest = '/etc/udev/rules.d/99-cros-ec-user.rules';
  const rule = await fs.readFile(ruleSrc, 'utf8');
  process.stdout.write(`# To enable /dev/cros_ec user access, run as root:\n`);
  process.stdout.write(`sudo tee ${dest} <<'EOF'\n${rule}EOF\n`);
  process.stdout.write(`sudo udevadm control --reload-rules && sudo udevadm trigger --subsystem-match=ec\n`);
  process.stdout.write(`\n# Then install ectool (build from chromium-ec or use Framework's package):\n`);
  process.stdout.write(`# https://github.com/FrameworkComputer/EmbeddedController\n`);
}

async function cmdInstallClaudeHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const socketPath = process.env['DARK_MATRIX_SOCKET']
    ?? `/run/user/${process.getuid!()}/dark-matrix.sock`;

  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    // start fresh if missing or invalid
  }

  const hook = {
    matcher: '*',
    hooks: [{
      type: 'command',
      command: `curl -sf --unix-socket ${socketPath} -X POST http://localhost/hook -H 'Content-Type: application/json' -d @-`,
    }],
  };

  const existing = (settings['hooks'] as unknown[]) ?? [];
  const alreadyInstalled = existing.some(
    (h) => typeof h === 'object' && h !== null && (h as Record<string, unknown>)['matcher'] === '*'
      && JSON.stringify(h).includes('dark-matrix'),
  );

  if (alreadyInstalled) {
    process.stdout.write(`dark-matrix hook already present in ${settingsPath}\n`);
    return;
  }

  settings['hooks'] = [...existing, hook];
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  process.stdout.write(`Installed PostToolUse hook in ${settingsPath}\n`);
  process.stdout.write(`Restart Claude Code to activate.\n`);
}

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'install':
    switch (args[0]) {
      case '--user-systemd':   await cmdInstallUserSystemd(); break;
      case '--ec-access':      await cmdInstallEcAccess(); break;
      case '--claude-hooks':   await cmdInstallClaudeHooks(); break;
      default:
        process.stderr.write(`Usage: dark-matrix install [--user-systemd|--ec-access|--claude-hooks]\n`);
        process.exit(1);
    }
    break;
  default:
    process.stderr.write(`Usage: dark-matrix <command>\n  install [--user-systemd|--ec-access|--claude-hooks]\n`);
    if (cmd !== undefined) process.exit(1);
}
