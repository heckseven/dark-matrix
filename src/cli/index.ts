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
  // Copy node binary and compiled daemon into install dir
  const nodeBin = process.execPath;
  const daemonSrc = path.resolve(__dirname, '../daemon/index.js');
  const unitSrc = path.resolve(__dirname, '../../systemd', UNIT_NAME);

  await fs.mkdir(INSTALL_DIR, { recursive: true });
  await fs.mkdir(UNIT_DIR, { recursive: true });

  // Copy node binary
  await fs.copyFile(nodeBin, path.join(INSTALL_DIR, 'node'));
  await fs.chmod(path.join(INSTALL_DIR, 'node'), 0o755);

  // Copy compiled daemon
  await fs.copyFile(daemonSrc, path.join(INSTALL_DIR, 'daemon.mjs'));

  // Install unit file
  await fs.copyFile(unitSrc, path.join(UNIT_DIR, UNIT_NAME));

  process.stdout.write(`Installed ${UNIT_NAME} to ${UNIT_DIR}\n`);
  process.stdout.write(`Run: systemctl --user daemon-reload && systemctl --user enable --now dark-matrix\n`);
}

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'install':
    if (args[0] === '--user-systemd') {
      await cmdInstallUserSystemd();
    } else {
      process.stderr.write(`Usage: dark-matrix install --user-systemd\n`);
      process.exit(1);
    }
    break;
  default:
    process.stderr.write(`Usage: dark-matrix <command>\n  install --user-systemd\n`);
    if (cmd !== undefined) process.exit(1);
}
