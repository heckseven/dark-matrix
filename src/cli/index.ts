import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { convertImage } from '../lib/image-convert.js';
import { SerialTransport } from '../lib/transport.js';
import { runAnimation } from '../lib/animation.js';
import type { Frame } from '../lib/frame.js';

function staticAnim(frame: Frame) {
  let stopped = false;
  return {
    [Symbol.asyncIterator]() {
      return { async next() { return stopped ? { value: frame, done: true as const } : { value: frame, done: false as const }; } };
    },
    stop() { stopped = true; },
  };
}

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

function parseShowFlags(args: string[]): { imagePath: string; device: string | undefined; mode: 'bw' | 'gray'; fit: 'fill' | 'contain' | 'cover' } {
  let imagePath: string | undefined;
  let device: string | undefined;
  let mode: 'bw' | 'gray' = 'bw';
  let fit: 'fill' | 'contain' | 'cover' = 'contain';

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--device' || a === '-d') { device = args[++i]; }
    else if (a === '--mode' && (args[i + 1] === 'bw' || args[i + 1] === 'gray')) { mode = args[++i] as 'bw' | 'gray'; }
    else if (a === '--fit' && (args[i + 1] === 'fill' || args[i + 1] === 'contain' || args[i + 1] === 'cover')) { fit = args[++i] as 'fill' | 'contain' | 'cover'; }
    else if (!a.startsWith('-')) { imagePath = a; }
  }

  if (!imagePath) {
    process.stderr.write('Usage: dark-matrix show <image> [--device <path>] [--mode bw|gray] [--fit fill|contain|cover]\n');
    process.exit(1);
  }

  return { imagePath, device, mode, fit };
}

async function cmdShow(args: string[]) {
  const { imagePath, device, mode, fit } = parseShowFlags(args);
  const devicePath = device ?? '/dev/serial/by-path/pci-0000:00:14.0-usb-0:3.3:1.0';

  const frame = await convertImage(imagePath, { mode, fit });
  const anim = staticAnim(frame);
  const transport = new SerialTransport();

  const stop = runAnimation(anim, { transport, devicePath, mode });
  process.stdout.write(`Displaying ${imagePath} on ${devicePath} (Ctrl+C to stop)\n`);

  process.once('SIGINT', () => { stop(); process.exit(0); });
}

async function cmdShowSplit(args: string[]) {
  const positional = args.filter(a => !a.startsWith('-'));
  const flags = args.filter(a => a.startsWith('-'));

  if (positional.length < 2) {
    process.stderr.write('Usage: dark-matrix show-split <left-image> <right-image> [--mode bw|gray] [--fit fill|contain|cover]\n');
    process.exit(1);
  }

  const { mode, fit } = parseShowFlags([...flags, positional[0]!]);
  const [leftPath, rightPath] = positional as [string, string];

  const leftDev = '/dev/serial/by-path/pci-0000:00:14.0-usb-0:3.3:1.0';
  const rightDev = '/dev/serial/by-path/pci-0000:00:14.0-usb-0:4.2:1.0';

  const [leftFrame, rightFrame] = await Promise.all([
    convertImage(leftPath, { mode, fit }),
    convertImage(rightPath, { mode, fit }),
  ]);

  const leftAnim = staticAnim(leftFrame);
  const rightAnim = staticAnim(rightFrame);
  const transport = new SerialTransport();

  const stopLeft = runAnimation(leftAnim, { transport, devicePath: leftDev, mode });
  const stopRight = runAnimation(rightAnim, { transport, devicePath: rightDev, mode });

  process.stdout.write(`Displaying split: ${leftPath} | ${rightPath} (Ctrl+C to stop)\n`);
  process.once('SIGINT', () => { stopLeft(); stopRight(); process.exit(0); });
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
  case 'show':       await cmdShow(args); break;
  case 'show-split': await cmdShowSplit(args); break;
  default:
    process.stderr.write(`Usage: dark-matrix <command>\n  install [--user-systemd|--ec-access|--claude-hooks]\n  show <image> [--device <path>] [--mode bw|gray]\n  show-split <left> <right> [--mode bw|gray]\n`);
    if (cmd !== undefined) process.exit(1);
}
