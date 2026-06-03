import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

/**
 * mic: 0 = active/live, 1 = muted/killed — matches MIC_SW GPIO polarity (hardware-confirmed)
 * cam: 1 = active/live, 0 = covered/killed — CAM_SW GPIO is inverted relative to mic
 * All read paths normalise to these polarities.
 */
export type SwitchState = { cam: number; mic: number };

export type SwitchEvent = {
  type: 'cam' | 'mic';
  value: number;
  prev: number;
};

export type SwitchSource = 'sysfs' | 'native' | 'ectool' | 'none';

const GPIO_RE = /GPIO \w+ = (\d)/;
const PRIVACY_SYSFS = '/sys/devices/platform/framework_laptop/framework_privacy';

function gpioGet(ectoolPath: string, gpioName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ectoolPath, ['gpioget', gpioName], { shell: false });
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ectool gpioget ${gpioName} exited ${code}: ${stderr.trim()}`));
        return;
      }
      const m = GPIO_RE.exec(stdout);
      if (!m || m[1] === undefined) {
        reject(new Error(`ectool gpioget ${gpioName}: unexpected output: ${stdout.trim()}`));
        return;
      }
      resolve(parseInt(m[1], 10));
    });
  });
}

export async function readSwitches(ectoolPath?: string): Promise<SwitchState> {
  const bin = ectoolPath ?? 'ectool';
  const [cam, mic] = await Promise.all([
    gpioGet(bin, 'CAM_SW'),
    gpioGet(bin, 'MIC_SW'),
  ]);
  return { cam, mic };
}

async function readSwitchesSysfs(): Promise<SwitchState> {
  const content = await fs.readFile(PRIVACY_SYSFS, 'utf-8');
  let cam = 0;
  let mic = 0;
  for (const line of content.split('\n')) {
    if (line.startsWith('[Microphone]')) mic = line.includes('unmuted') ? 0 : 1;
    if (line.startsWith('[Camera]')) cam = line.includes('unmuted') ? 1 : 0;
  }
  return { cam, mic };
}

async function sysfsAvailable(): Promise<boolean> {
  try {
    await fs.access(PRIVACY_SYSFS);
    return true;
  } catch {
    return false;
  }
}

const NATIVE_RE = /^mic=(\d) cam=(\d)$/m;

function readSwitchesNative(helperPath: string): Promise<SwitchState> {
  return new Promise((resolve, reject) => {
    const proc = spawn(helperPath, [], { shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      const m = NATIVE_RE.exec(stdout);
      if (code === 0 && m && m[1] !== undefined && m[2] !== undefined) {
        const mic = parseInt(m[1], 10);
        const cam = parseInt(m[2], 10);
        if (!Number.isInteger(mic) || !Number.isInteger(cam) || mic < 0 || mic > 1 || cam < 0 || cam > 1) {
          reject(new Error(`cros-ec-privacy: unexpected switch values mic=${mic} cam=${cam}`));
          return;
        }
        resolve({ mic, cam });
      } else {
        reject(new Error(`cros-ec-privacy exited ${code}: ${stderr.trim() || stdout.trim()}`));
      }
    });
  });
}

async function nativeHelperAvailable(helperPath: string): Promise<boolean> {
  try {
    const st = await fs.lstat(helperPath);
    // Reject symlinks — a symlink to an attacker-controlled binary passes ownership/mode checks.
    if (st.isSymbolicLink()) return false;
    // Reject if world-writable — file lives in a user-owned dir, so world-writable means a
    // local attacker could replace it with an arbitrary binary executed by the daemon.
    if ((st.mode & 0o002) !== 0) return false;
    // Reject if not owned by the current user (getuid is POSIX-only; skip on Windows).
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return false;
    return true;
  } catch {
    return false;
  }
}

export interface WatchSwitchesOpts {
  intervalMs?: number;
  nativeHelperPath?: string;
  ectoolPath?: string;
  onSource?: (s: SwitchSource) => void;
  /**
   * Called on every successful poll, including the first tick.
   * The first-tick call primes the caller's state cache before change events begin firing.
   */
  onState?: (s: SwitchState) => void;
}

export function watchSwitches(
  onEvent: (e: SwitchEvent) => void,
  opts?: WatchSwitchesOpts
): () => void {
  const intervalMs = opts?.intervalMs ?? 500;
  const nativeHelperPath = opts?.nativeHelperPath;
  const ectoolPath = opts?.ectoolPath;

  let prev: SwitchState | null = null;
  let polling = false;
  let source: SwitchSource | null = null;
  let stopped = false;
  let handle: ReturnType<typeof setInterval> | null = null;

  handle = setInterval(async () => {
    if (polling || stopped) return;
    polling = true;
    try {
      if (source === null) {
        if (await sysfsAvailable()) {
          source = 'sysfs';
        } else if (nativeHelperPath !== undefined && await nativeHelperAvailable(nativeHelperPath)) {
          source = 'native';
        } else if (ectoolPath !== undefined) {
          source = 'ectool';
        } else {
          source = 'none';
          process.stderr.write('ec-switches: no privacy switch source available (load framework-laptop-kmod or set ectool_path in config)\n');
          stopped = true;
          if (handle !== null) { clearInterval(handle); handle = null; }
          opts?.onSource?.('none');
          return;
        }
        opts?.onSource?.(source);
      }

      const next = source === 'sysfs'
        ? await readSwitchesSysfs()
        : source === 'native'
          ? await readSwitchesNative(nativeHelperPath!)
          : await readSwitches(ectoolPath);
      opts?.onState?.(next);
      if (prev === null) { prev = next; return; }
      if (next.cam !== prev.cam) onEvent({ type: 'cam', value: next.cam, prev: prev.cam });
      if (next.mic !== prev.mic) onEvent({ type: 'mic', value: next.mic, prev: prev.mic });
      prev = next;
    } catch (err: unknown) {
      const isNotFound = source === 'ectool' && (err as NodeJS.ErrnoException).code === 'ENOENT';
      const msg = isNotFound
        ? `ec-switches: ectool not found — set ectool_path in config to its absolute path`
        : `ec-switches: ${source ?? 'source'} unavailable (${String(err)}) — EC switch monitoring disabled`;
      process.stderr.write(`${msg}\n`);
      stopped = true;
      if (handle !== null) { clearInterval(handle); handle = null; }
    } finally {
      polling = false;
    }
  }, intervalMs);

  return () => {
    stopped = true;
    if (handle !== null) {
      clearInterval(handle);
      handle = null;
    }
  };
}
