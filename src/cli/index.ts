import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { convertImage, renderPreview } from '../lib/image-convert.js';
import { SerialTransport } from '../lib/transport.js';
import { runAnimation } from '../lib/animation.js';
import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

import { sendToDaemon } from '../lib/daemon-client.js';

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
  const distSrc = path.resolve(__dirname, '..');
  const unitSrc = path.resolve(__dirname, '../../systemd', UNIT_NAME);

  await fs.mkdir(INSTALL_DIR, { recursive: true });
  await fs.mkdir(UNIT_DIR, { recursive: true });

  await fs.copyFile(nodeBin, path.join(INSTALL_DIR, 'node'));
  await fs.chmod(path.join(INSTALL_DIR, 'node'), 0o755);
  await fs.cp(distSrc, path.join(INSTALL_DIR, 'dist'), { recursive: true });
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

  const hookEntry = {
    matcher: '*',
    hooks: [{
      type: 'command',
      command: `curl -sf --unix-socket ${socketPath} -X POST http://localhost/hook -H 'Content-Type: application/json' -d @-`,
    }],
  };

  const hooksObj = (typeof settings['hooks'] === 'object' && settings['hooks'] !== null && !Array.isArray(settings['hooks']))
    ? settings['hooks'] as Record<string, unknown[]>
    : {};

  const existing = (hooksObj['PostToolUse'] as unknown[] | undefined) ?? [];
  const alreadyInstalled = existing.some(
    (h) => typeof h === 'object' && h !== null && JSON.stringify(h).includes('dark-matrix'),
  );

  if (alreadyInstalled) {
    process.stdout.write(`dark-matrix hook already present in ${settingsPath}\n`);
    return;
  }

  settings['hooks'] = { ...hooksObj, PostToolUse: [...existing, hookEntry] };
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
  const devicePath = device ?? LEFT_DEV;

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

  const leftDev = LEFT_DEV;
  const rightDev = RIGHT_DEV;

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

const ASSET_DIR = path.resolve(__dirname, '../../images');
const LEFT_DEV = '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:4.2:1.0';
const RIGHT_DEV = '/dev/serial/by-path/pci-0000:c5:00.3-usb-0:3.3:1.0';

async function showOnDevice(imagePath: string, devicePath: string, mode: 'bw' | 'gray') {
  const frame = await convertImage(imagePath, { mode, fit: 'contain' });
  const anim = staticAnim(frame);
  const transport = new SerialTransport();
  return runAnimation(anim, { transport, devicePath, mode });
}

async function cmdDisplay(args: string[]) {
  const name = args[0];
  const mode = 'bw';

  switch (name) {
    case 'yeah': {
      const [stopL, stopR] = await Promise.all([
        showOnDevice(path.join(ASSET_DIR, 'heck.png'), LEFT_DEV, mode),
        showOnDevice(path.join(ASSET_DIR, 'yeah.png'), RIGHT_DEV, mode),
      ]);
      process.stdout.write('Displaying: heck | yeah (Ctrl+C to stop)\n');
      process.once('SIGINT', () => { stopL(); stopR(); process.exit(0); });
      break;
    }
    case 'runes': {
      const stop = await showOnDevice(path.join(ASSET_DIR, 'runes.png'), LEFT_DEV, mode);
      process.stdout.write('Displaying: runes (Ctrl+C to stop)\n');
      process.once('SIGINT', () => { stop(); process.exit(0); });
      break;
    }
    case '0x07': {
      const stop = await showOnDevice(path.join(ASSET_DIR, '0X07.png'), LEFT_DEV, mode);
      process.stdout.write('Displaying: 0x07 (Ctrl+C to stop)\n');
      process.once('SIGINT', () => { stop(); process.exit(0); });
      break;
    }
    case 'panic': {
      const frame = createFrame();
      frame.fill(255);
      const anim = staticAnim(frame);
      const transport = new SerialTransport();
      const stopL = runAnimation(anim, { transport, devicePath: LEFT_DEV, mode });
      const stopR = runAnimation(staticAnim(frame), { transport, devicePath: RIGHT_DEV, mode });
      process.stdout.write('PANIC MODE (Ctrl+C to stop)\n');
      process.once('SIGINT', () => { stopL(); stopR(); process.exit(0); });
      break;
    }
    default:
      process.stderr.write(`Unknown preset "${name ?? ''}". Options: yeah, runes, 0x07, panic\n`);
      process.exit(1);
  }
}

async function cmdImage(args: string[]) {
  const imagePath = args.find(a => !a.startsWith('-'));
  const preview = args.includes('--preview');
  const mode = args.includes('--mode') ? (args[args.indexOf('--mode') + 1] as 'bw' | 'gray') : 'gray';

  if (!imagePath) {
    process.stderr.write('Usage: dark-matrix image <path> [--preview] [--mode bw|gray]\n');
    process.exit(1);
  }

  const frame = await convertImage(imagePath, { mode, fit: 'contain' });

  if (preview) {
    process.stdout.write(renderPreview(frame) + '\n');
  } else {
    const devicePath = args[args.indexOf('--device') + 1] ?? LEFT_DEV;
    const anim = staticAnim(frame);
    const transport = new SerialTransport();
    const stop = runAnimation(anim, { transport, devicePath, mode });
    process.stdout.write(`Displaying ${imagePath} (Ctrl+C to stop)\n`);
    process.once('SIGINT', () => { stop(); process.exit(0); });
  }
}

async function cmdCalibrate() {
  // Release daemon's port handles if it's running
  try {
    await sendToDaemon({ cmd: 'release' });
    process.stdout.write('Released daemon port handles.\n');
    await new Promise<void>(r => setTimeout(r, 200));
  } catch {
    // daemon not running — proceed directly
  }

  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>(res => rl.question(q, res));

  const transport = new SerialTransport();

  // Send all-lit to left candidate, blank to right
  const litFrame = createFrame();
  litFrame.fill(255);
  const blankFrame = createFrame();

  const animLit = staticAnim(litFrame);
  const animBlank = staticAnim(blankFrame);

  process.stdout.write('Calibrating module sides...\n');
  process.stdout.write(`Sending solid white to: ${LEFT_DEV}\n`);
  process.stdout.write(`Sending blank to:       ${RIGHT_DEV}\n\n`);

  const stopA = runAnimation(animLit,   { transport, devicePath: LEFT_DEV,  mode: 'bw' });
  const stopB = runAnimation(animBlank, { transport, devicePath: RIGHT_DEV, mode: 'bw' });

  const answer = await ask('Which side is lit? [left/right]: ');
  stopA(); stopB();

  const leftIsA = answer.trim().toLowerCase() === 'left';
  const leftDev  = leftIsA ? LEFT_DEV  : RIGHT_DEV;
  const rightDev = leftIsA ? RIGHT_DEV : LEFT_DEV;

  process.stdout.write(`\nLeft module:  ${leftDev}\nRight module: ${rightDev}\n`);
  process.stdout.write('Update your config.json modules.left and modules.right with these paths.\n');

  rl.close();
}

async function cmdDesigner(args: string[]): Promise<void> {
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '7340', 10) : 7340;
  const { startDesignerServer } = await import('../designer/server.js');
  const server = await startDesignerServer({ port });
  process.stdout.write(`Designer running at ${server.url}\nPress Ctrl-C to stop.\n`);

  const openUrl = server.url;
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  const { spawn } = await import('node:child_process');
  const child = spawn(opener, [openUrl], { stdio: 'ignore', detached: true });
  child.unref();

  const shutdown = async () => { await server.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
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
  case 'designer':   await cmdDesigner(args); break;
  case 'show':       await cmdShow(args); break;
  case 'show-split': await cmdShowSplit(args); break;
  case 'display':    await cmdDisplay(args); break;
  case 'image':      await cmdImage(args); break;
  case 'calibrate':  await cmdCalibrate(); break;
  case 'ping': {
    try {
      const res = await sendToDaemon({ cmd: 'ping' });
      process.stdout.write(res['pong'] ? 'pong\n' : `unexpected: ${JSON.stringify(res)}\n`);
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`);
      process.exit(1);
    }
    break;
  }
  case 'release': {
    try {
      const res = await sendToDaemon({ cmd: 'release' });
      process.stdout.write(res['ok'] ? 'Ports released.\n' : `Error: ${JSON.stringify(res)}\n`);
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`);
      process.exit(1);
    }
    break;
  }
  case 'scroll': {
    const hold = args.includes('--hold');
    const sizeIdx = args.indexOf('--size');
    const size = sizeIdx !== -1 ? args[sizeIdx + 1] : undefined;
    const speedIdx = args.indexOf('--speed');
    const speed = speedIdx !== -1 ? args[speedIdx + 1] : undefined;
    if (speed !== undefined && !['slow', 'normal', 'fast'].includes(speed)) {
      process.stderr.write('--speed must be slow, normal, or fast\n');
      process.exit(1);
    }
    const text = args.filter((a, i) =>
      !a.startsWith('-') && args[i-1] !== '--size' && args[i-1] !== '--speed'
    ).join(' ');
    if (!text) {
      process.stderr.write('Usage: dark-matrix scroll [--hold] [--size tiny|small|medium|large] [--speed slow|normal|fast] <text>\n');
      process.exit(1);
    }
    try {
      const res = await sendToDaemon({ cmd: 'scroll', text, hold, ...(size ? { size } : {}), ...(speed ? { speed } : {}) });
      if (!res['ok']) {
        process.stderr.write(`Error: ${res['error'] ?? JSON.stringify(res)}\n`);
        process.exit(1);
      }
      process.stdout.write(hold ? 'Scrolling (run "release" to stop).\n' : 'Scrolling.\n');
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`);
      process.exit(1);
    }
    break;
  }
  case 'animate': {
    const sub = args[0];
    if (sub !== 'gif') {
      process.stderr.write('Usage: dark-matrix animate gif [--hold] <path>\n');
      process.exit(1);
    }
    const hold = args.includes('--hold');
    const dual = args.includes('--dual');
    const modeIdx = args.indexOf('--mode');
    const mode = modeIdx !== -1 ? args[modeIdx + 1] : undefined;
    if (mode !== undefined && mode !== 'bw' && mode !== 'gray') {
      process.stderr.write('--mode must be bw or gray\n');
      process.exit(1);
    }
    const gifPath = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '--mode').slice(1).join('') ?? '';
    if (!gifPath) {
      process.stderr.write('Usage: dark-matrix animate gif [--hold] [--dual] [--mode bw|gray] <path>\n');
      process.exit(1);
    }
    const absPath = path.resolve(gifPath);
    try {
      const res = await sendToDaemon({ cmd: 'animate', type: 'gif', path: absPath, hold, dual, ...(mode ? { mode } : {}) });
      if (!res['ok']) {
        process.stderr.write(`Error: ${res['error'] ?? JSON.stringify(res)}\n`);
        process.exit(1);
      }
      process.stdout.write(hold ? 'GIF playing (run "release" to stop).\n' : 'GIF playing.\n');
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`);
      process.exit(1);
    }
    break;
  }
  default:
    process.stderr.write([
      'Usage: dark-matrix <command>',
      '  install [--user-systemd|--ec-access|--claude-hooks]',
      '  show <image> [--device <path>] [--mode bw|gray]',
      '  show-split <left> <right> [--mode bw|gray]',
      '  display [yeah|runes|0x07|panic]',
      '  image <path> [--preview] [--mode bw|gray]',
      '  designer [--port <n>]',
      '  scroll [--hold] [--size tiny|small|medium|large] [--speed slow|normal|fast] <text>',
      '  animate gif [--hold] [--dual] [--mode bw|gray] <path>',
      '  calibrate',
      '  ping',
      '  release',
    ].join('\n') + '\n');
    if (cmd !== undefined) process.exit(1);
}
