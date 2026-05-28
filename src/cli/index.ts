import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { convertImage, renderPreview } from '../lib/image-convert.js';
import { SerialTransport } from '../lib/transport.js';
import { runAnimation } from '../lib/animation.js';
import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

import { sendToDaemon } from '../lib/daemon-client.js';
import { loadConfig, DEFAULT_CONFIG, resolveConfigPath } from '../lib/config.js';
import { enumerateMatrixModules } from '../lib/modules.js';

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
const WRAPPER_DIR = path.join(os.homedir(), '.local', 'bin');
const REPO = 'heckseven/dark-matrix';

function run(cmd: string, args: string[], opts?: { cwd?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code ?? `signal:${signal}`}`)));
    child.on('error', reject);
  });
}

async function cmdInstallUserSystemd() {
  const nodeBin = process.execPath;
  const distSrc = path.resolve(__dirname, '..');
  const unitSrc = path.resolve(__dirname, '../../systemd', UNIT_NAME);
  const pkgSrc = path.resolve(__dirname, '../../package.json');
  const lockSrc = path.resolve(__dirname, '../../pnpm-lock.yaml');
  const wrapperPath = path.join(WRAPPER_DIR, 'dark-matrix');

  // Stop service before replacing files (non-fatal — may not be installed yet)
  await run('systemctl', ['--user', 'stop', 'dark-matrix']).catch(() => {});

  await fs.mkdir(INSTALL_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(UNIT_DIR, { recursive: true });
  await fs.mkdir(WRAPPER_DIR, { recursive: true });

  await fs.copyFile(nodeBin, path.join(INSTALL_DIR, 'node'));
  await fs.chmod(path.join(INSTALL_DIR, 'node'), 0o755);
  await fs.cp(distSrc, path.join(INSTALL_DIR, 'dist'), { recursive: true });
  await fs.copyFile(pkgSrc, path.join(INSTALL_DIR, 'package.json'));
  await fs.copyFile(lockSrc, path.join(INSTALL_DIR, 'pnpm-lock.yaml'));
  await fs.copyFile(unitSrc, path.join(UNIT_DIR, UNIT_NAME));

  // Remove stale artifact from earlier installs
  await fs.rm(path.join(INSTALL_DIR, 'daemon.mjs'), { force: true });

  // Install production dependencies (serialport + sharp runtime, not bundled)
  await run('pnpm', ['install', '--prod', '--frozen-lockfile', '--node-linker=hoisted'], { cwd: INSTALL_DIR });

  // Build native cros-ec privacy helper (no-op if gcc is absent — falls back to ectool)
  const nativeSrc = path.resolve(__dirname, '../../src/native/cros-ec-privacy.c');
  const nativeDest = path.join(INSTALL_DIR, 'dark-matrix-privacy');
  try {
    await run('gcc', ['-O2', '-Wall', '-o', nativeDest, nativeSrc]);
    await fs.chmod(nativeDest, 0o755);
    process.stdout.write(`Built native privacy helper at ${nativeDest}\n`);
  } catch {
    process.stdout.write(`Note: gcc not found — privacy switch monitoring will fall back to ectool if configured\n`);
  }

  // Write shell wrapper so `dark-matrix` is available on PATH
  const wrapper = [
    '#!/bin/sh',
    `exec "${path.join(INSTALL_DIR, 'node')}" \\`,
    `     "${path.join(INSTALL_DIR, 'dist', 'bundles', 'cli.js')}" "$@"`,
  ].join('\n') + '\n';
  await fs.writeFile(wrapperPath, wrapper, 'utf8');
  await fs.chmod(wrapperPath, 0o755);

  const pathDirs = (process.env['PATH'] ?? '').split(':');
  if (!pathDirs.includes(WRAPPER_DIR)) {
    process.stdout.write(`Note: add ${WRAPPER_DIR} to PATH to use the dark-matrix command\n`);
  }

  // Enable and start service
  try {
    await run('systemctl', ['--user', 'daemon-reload']);
    await run('systemctl', ['--user', 'enable', '--now', 'dark-matrix']);
    process.stdout.write(`Service enabled and started. Run: dark-matrix ping\n`);
  } catch (err) {
    process.stderr.write(`systemctl failed: ${(err as Error).message}\n`);
    process.stdout.write(`Run manually: systemctl --user daemon-reload && systemctl --user enable --now dark-matrix\n`);
  }
}

async function cmdSelfUpdate() {
  const archMap: Record<string, string> = { x64: 'x64', arm64: 'arm64' };
  const arch = archMap[process.arch];
  if (!arch) {
    process.stderr.write(`Unsupported architecture: ${process.arch}\n`);
    process.exit(1);
  }

  let currentVersion = 'dev';
  try {
    currentVersion = (await fs.readFile(path.join(INSTALL_DIR, 'version.txt'), 'utf8')).trim();
  } catch { /* dev install — no version.txt, always proceed */ }

  process.stdout.write('Checking for updates...\n');
  let latestVersion: string;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dark-matrix-cli' },
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const data = await res.json() as { tag_name?: string };
    latestVersion = data.tag_name ?? '';
    if (!latestVersion) throw new Error('No tag_name in response');
  } catch (err) {
    process.stderr.write(`Failed to fetch latest release: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (currentVersion !== 'dev' && currentVersion === latestVersion) {
    process.stdout.write(`Already up to date (${currentVersion})\n`);
    return;
  }

  process.stdout.write(`Updating ${currentVersion} → ${latestVersion}\n`);

  const tarball = `dark-matrix-${latestVersion}-linux-${arch}.tar.gz`;
  const url = `https://github.com/${REPO}/releases/download/${latestVersion}/${tarball}`;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dark-matrix-update-'));

  try {
    process.stdout.write(`Downloading ${tarball}...\n`);
    await run('curl', ['-fL', '--progress-bar', url, '-o', path.join(tmpDir, tarball)]);

    await run('systemctl', ['--user', 'stop', 'dark-matrix']).catch(() => {});
    await fs.mkdir(INSTALL_DIR, { recursive: true });
    await run('tar', ['-xzf', path.join(tmpDir, tarball), '-C', INSTALL_DIR, '--strip-components=1']);
    await fs.chmod(path.join(INSTALL_DIR, 'node'), 0o755);

    const unitDest = path.join(UNIT_DIR, UNIT_NAME);
    await fs.mkdir(UNIT_DIR, { recursive: true });
    await fs.copyFile(path.join(INSTALL_DIR, 'systemd', UNIT_NAME), unitDest);

    await run('systemctl', ['--user', 'daemon-reload']);
    await run('systemctl', ['--user', 'restart', 'dark-matrix']);
    process.stdout.write(`Updated to ${latestVersion}\n`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function cmdUninstall(purge: boolean) {
  const wrapperPath = path.join(WRAPPER_DIR, 'dark-matrix');
  const unitPath = path.join(UNIT_DIR, UNIT_NAME);
  const configDir = path.join(os.homedir(), '.config', 'dark-matrix');

  await run('systemctl', ['--user', 'disable', '--now', 'dark-matrix']).catch(() => {});
  await run('systemctl', ['--user', 'daemon-reload']).catch(() => {});

  await fs.rm(wrapperPath, { force: true });
  await fs.rm(unitPath, { force: true });
  await fs.rm(INSTALL_DIR, { recursive: true, force: true });

  if (purge) {
    await fs.rm(configDir, { recursive: true, force: true });
    process.stdout.write(`Removed ${INSTALL_DIR}, ${wrapperPath}, ${unitPath}, ${configDir}\n`);
  } else {
    process.stdout.write(`Removed ${INSTALL_DIR}, ${wrapperPath}, ${unitPath}\n`);
    process.stdout.write(`Config preserved at ${configDir}. Run with --purge to also remove it.\n`);
  }
}

async function cmdInstallEcAccess() {
  const ruleSrc = path.resolve(__dirname, '../../udev/99-cros-ec-user.rules');
  const dest = '/etc/udev/rules.d/99-cros-ec-user.rules';
  const rule = await fs.readFile(ruleSrc, 'utf8');
  process.stdout.write(`# To enable /dev/cros_ec user access, run as root:\n`);
  process.stdout.write(`sudo tee ${dest} <<'EOF'\n${rule}EOF\n`);
  process.stdout.write(`sudo udevadm control --reload-rules && sudo udevadm trigger --subsystem-match=ec\n`);
  process.stdout.write(`sudo usermod -aG plugdev $USER\n`);
  process.stdout.write(`# Log out and back in for the group change to take effect.\n`);
  process.stdout.write(`# The dark-matrix privacy helper (bundled in the release) will then read\n`);
  process.stdout.write(`# camera and microphone switch state directly from /dev/cros_ec.\n`);
}

async function cmdInstallClaudeHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const socketPath = process.env['DARK_MATRIX_SOCKET']
    ?? `/run/user/${process.getuid!()}/dark-matrix.sock`;

  if (!/^\/[a-zA-Z0-9_\-.\/]+\.sock$/.test(socketPath)) {
    process.stderr.write(`Error: DARK_MATRIX_SOCKET path contains unsafe characters: ${socketPath}\n`);
    process.exit(1);
  }

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

  const isDarkMatrix = (h: unknown) =>
    typeof h === 'object' && h !== null && JSON.stringify(h).includes('dark-matrix');

  const hookTypes = ['PostToolUse', 'Stop', 'Notification'] as const;
  let installed = 0;
  for (const hookType of hookTypes) {
    const existing = (hooksObj[hookType] as unknown[] | undefined) ?? [];
    if (existing.some(isDarkMatrix)) continue;
    hooksObj[hookType] = [...existing, hookEntry];
    installed++;
  }

  if (installed === 0) {
    process.stdout.write(`dark-matrix hooks already present in ${settingsPath}\n`);
    return;
  }

  settings['hooks'] = hooksObj;
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  process.stdout.write(`Installed ${installed} hook(s) (PostToolUse, Stop, Notification) in ${settingsPath}\n`);
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
  const config = await loadConfig();
  const devicePath = device ?? config.modules.left;

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

  const config = await loadConfig();
  const leftDev = config.modules.left;
  const rightDev = config.modules.right;

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

async function showOnDevice(imagePath: string, devicePath: string, mode: 'bw' | 'gray') {
  const frame = await convertImage(imagePath, { mode, fit: 'contain' });
  const anim = staticAnim(frame);
  const transport = new SerialTransport();
  return runAnimation(anim, { transport, devicePath, mode });
}

async function cmdDisplay(args: string[]) {
  const name = args[0];
  const mode = 'bw';
  if (!name || !['yeah', 'runes', '0x07', 'panic'].includes(name)) {
    process.stderr.write(`Unknown preset "${name ?? ''}". Options: yeah, runes, 0x07, panic\n`);
    process.exit(1);
  }
  const config = await loadConfig();
  const leftDev = config.modules.left;
  const rightDev = config.modules.right;

  switch (name) {
    case 'yeah': {
      const [stopL, stopR] = await Promise.all([
        showOnDevice(path.join(ASSET_DIR, 'heck.png'), leftDev, mode),
        showOnDevice(path.join(ASSET_DIR, 'yeah.png'), rightDev, mode),
      ]);
      process.stdout.write('Displaying: heck | yeah (Ctrl+C to stop)\n');
      process.once('SIGINT', () => { stopL(); stopR(); process.exit(0); });
      break;
    }
    case 'runes': {
      const stop = await showOnDevice(path.join(ASSET_DIR, 'runes.png'), leftDev, mode);
      process.stdout.write('Displaying: runes (Ctrl+C to stop)\n');
      process.once('SIGINT', () => { stop(); process.exit(0); });
      break;
    }
    case '0x07': {
      const stop = await showOnDevice(path.join(ASSET_DIR, '0X07.png'), leftDev, mode);
      process.stdout.write('Displaying: 0x07 (Ctrl+C to stop)\n');
      process.once('SIGINT', () => { stop(); process.exit(0); });
      break;
    }
    case 'panic': {
      const frame = createFrame();
      frame.fill(255);
      const anim = staticAnim(frame);
      const transport = new SerialTransport();
      const stopL = runAnimation(anim, { transport, devicePath: leftDev, mode });
      const stopR = runAnimation(staticAnim(frame), { transport, devicePath: rightDev, mode });
      process.stdout.write('PANIC MODE (Ctrl+C to stop)\n');
      process.once('SIGINT', () => { stopL(); stopR(); process.exit(0); });
      break;
    }
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
    const config = await loadConfig();
    const devicePath = args[args.indexOf('--device') + 1] ?? config.modules.left;
    const anim = staticAnim(frame);
    const transport = new SerialTransport();
    const stop = runAnimation(anim, { transport, devicePath, mode });
    process.stdout.write(`Displaying ${imagePath} (Ctrl+C to stop)\n`);
    process.once('SIGINT', () => { stop(); process.exit(0); });
  }
}

async function cmdCalibrate() {
  const modules = await enumerateMatrixModules();
  if (modules.length < 2) {
    process.stderr.write(`Error: found ${modules.length} module(s), need at least 2 to calibrate.\n`);
    return;
  }
  const [devA, devB] = [modules[0]!, modules[1]!];

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

  const litFrame = createFrame();
  litFrame.fill(255);
  const blankFrame = createFrame();

  const animLit = staticAnim(litFrame);
  const animBlank = staticAnim(blankFrame);

  process.stdout.write('Calibrating module sides...\n');
  process.stdout.write(`Sending solid white to: ${devA}\n`);
  process.stdout.write(`Sending blank to:       ${devB}\n\n`);

  const stopA = runAnimation(animLit,   { transport, devicePath: devA, mode: 'bw' });
  const stopB = runAnimation(animBlank, { transport, devicePath: devB, mode: 'bw' });

  const answer = await ask('Which side is lit? [left/right]: ');
  stopA(); stopB();
  rl.close();

  await transport.close();

  const leftIsA = answer.trim().toLowerCase() === 'left';
  const leftDev  = leftIsA ? devA : devB;
  const rightDev = leftIsA ? devB : devA;

  const configPath = resolveConfigPath();
  let config: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    config = (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      ? (parsed as Record<string, unknown>)
      : { ...DEFAULT_CONFIG };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }

  config['modules'] = { left: leftDev, right: rightDev };
  config['uncalibrated'] = false;

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });

  await run('systemctl', ['--user', 'restart', 'dark-matrix']).catch(() => {});

  process.stdout.write(`Left: ${leftDev}\nRight: ${rightDev}\nConfig updated. Daemon reloaded.\n`);
}

async function cmdPlay(args: string[]) {
  const loop = args.includes('--loop');
  const filePath = args.find(a => !a.startsWith('-'));
  if (!filePath) {
    process.stderr.write('Usage: dark-matrix play [--loop] <path>\n');
    process.exit(1);
  }
  const absPath = path.resolve(filePath);
  try {
    const res = await sendToDaemon({ cmd: 'play', path: absPath, loop });
    if (!res['ok']) {
      process.stderr.write(`Error: ${res['error'] ?? JSON.stringify(res)}\n`);
      process.exit(1);
    }
    process.stdout.write(loop ? 'Playing (run "release" to stop).\n' : 'Playing.\n');
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }
}

async function cmdLife(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'list') {
    try {
      const config = await loadConfig();
      const biomes = config.biome_presets ?? [];
      if (biomes.length === 0) {
        process.stdout.write('No biomes configured. Add biomes via: dark-matrix ui\n');
      } else {
        process.stdout.write('random\n');
        for (const b of biomes) process.stdout.write(`${b.name}\n`);
      }
    } catch (err) {
      process.stderr.write(`Error reading config: ${(err as Error).message}\n`);
      process.exit(1);
    }
    return;
  }

  let side: 'left' | 'right' | 'both';
  let name: string | undefined;

  if (sub === 'left' || sub === 'right') {
    side = sub;
    name = args[1];
  } else {
    side = 'both';
    name = sub;
  }

  if (!name) {
    process.stderr.write('Usage: dark-matrix life list\n       dark-matrix life [left|right] <biome|random>\n');
    process.exit(1);
  }

  if (name !== 'random') {
    try {
      const config = await loadConfig();
      const biomes = config.biome_presets ?? [];
      if (!biomes.some(b => b.name === name)) {
        const available = ['random', ...biomes.map(b => b.name)].join(', ');
        process.stderr.write(`Unknown biome "${name}". Available: ${available}\n`);
        process.exit(1);
      }
    } catch (err) {
      process.stderr.write(`Warning: could not read config: ${(err as Error).message}\n`);
    }
  }

  const cmd: Record<string, unknown> = { cmd: 'hud-config' };
  if (side === 'left'  || side === 'both') { cmd['leftWidget']  = 'life'; cmd['leftBiomeName']  = name; }
  if (side === 'right' || side === 'both') { cmd['rightWidget'] = 'life'; cmd['rightBiomeName'] = name; }

  try {
    const res = await sendToDaemon(cmd);
    if (res['ok']) {
      const target = side === 'both' ? 'both sides' : side;
      process.stdout.write(`Set ${target} to life: ${name}\n`);
    } else {
      process.stderr.write(`Error: ${res['error'] ?? JSON.stringify(res)}\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }
}

async function cmdDeck(args: string[]): Promise<void> {
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '7340', 10) : 7340;
  const { startDeckServer } = await import('../deck/server.js');
  const server = await startDeckServer({ port });
  process.stdout.write(`Deck running at ${server.url}\nPress Ctrl-C to stop.\n`);

  const openUrl = server.url;
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
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
  case 'self-update': await cmdSelfUpdate(); break;
  case 'uninstall':   await cmdUninstall(args.includes('--purge')); break;
  case 'play':       await cmdPlay(args); break;
  case 'ui':         await cmdDeck(args); break;
  case 'show':       await cmdShow(args); break;
  case 'show-split': await cmdShowSplit(args); break;
  case 'display':    await cmdDisplay(args); break;
  case 'image':      await cmdImage(args); break;
  case 'calibrate':  await cmdCalibrate(); break;
  case 'ping': {
    try {
      const res = await sendToDaemon({ cmd: 'ping' });
      process.stdout.write(res['pong'] ? `pong  version: ${res['version'] ?? 'unknown'}\n` : `unexpected: ${JSON.stringify(res)}\n`);
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`);
      process.exit(1);
    }
    break;
  }
  case 'status': {
    try {
      const res = await sendToDaemon({ cmd: 'status' }) as Record<string, unknown>;
      const mods = res['modules'] as { left: boolean; right: boolean } | undefined;
      const uptimeMs = typeof res['uptimeMs'] === 'number' ? res['uptimeMs'] : null;
      const uptimeSec = uptimeMs !== null ? Math.floor(uptimeMs / 1000) : null;
      const uptimeStr = uptimeSec !== null
        ? `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`
        : 'unknown';
      process.stdout.write(
        `version:    ${res['version'] ?? 'unknown'}\n` +
        `uptime:     ${uptimeStr}\n` +
        `animation:  ${res['animationName'] ?? 'unknown'}\n` +
        `brightness: ${res['brightnessValue'] ?? '?'} (${res['brightnessMode'] ?? '?'})\n` +
        `left:       ${mods?.left ? 'online' : 'offline'}\n` +
        `right:      ${mods?.right ? 'online' : 'offline'}\n`
      );
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
  case 'life':  await cmdLife(args); break;
  case 'hud': {
    const sub = args[0];
    if (sub === 'preset') {
      const name = args[1];
      if (!name) {
        process.stderr.write('Usage: dark-matrix hud preset <name>\n');
        process.exit(1);
      }
      try {
        const res = await sendToDaemon({ cmd: 'hud-preset', name });
        if (res['ok']) {
          process.stdout.write(`Switched to "${name}".\n`);
        } else {
          process.stderr.write(`Error: ${res['error'] ?? JSON.stringify(res)}\n`);
          process.exit(1);
        }
      } catch (err) {
        process.stderr.write(`${(err as Error).message}\n`);
        process.exit(1);
      }
    } else {
      process.stderr.write('Usage: dark-matrix hud preset <name>\n');
      process.exit(1);
    }
    break;
  }
  default:
    process.stderr.write([
      'Usage: dark-matrix <command>',
      '  install [--user-systemd|--ec-access|--claude-hooks]',
      '  self-update',
      '  uninstall [--purge]',
      '  show <image> [--device <path>] [--mode bw|gray]',
      '  show-split <left> <right> [--mode bw|gray]',
      '  display [yeah|runes|0x07|panic]',
      '  image <path> [--preview] [--mode bw|gray]',
      '  play [--loop] <path>',
      '  ui [--port <n>]',
      '  scroll [--hold] [--size tiny|small|medium|large] [--speed slow|normal|fast] <text>',
      '  animate gif [--hold] [--dual] [--mode bw|gray] <path>',
      '  life list',
      '  life [left|right] <biome|random>',
      '  hud preset <name>',
      '  calibrate',
      '  ping',
      '  status',
      '  release',
    ].join('\n') + '\n');
    if (cmd !== undefined) process.exit(1);
}
