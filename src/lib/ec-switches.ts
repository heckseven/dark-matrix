import { spawn } from 'node:child_process';

export type SwitchState = { cam: number; mic: number };

export type SwitchEvent = {
  type: 'cam' | 'mic';
  value: number;
  prev: number;
};

const GPIO_RE = /GPIO \w+ = (\d)/;

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

export function watchSwitches(
  onEvent: (e: SwitchEvent) => void,
  opts?: { intervalMs?: number; ectoolPath?: string }
): () => void {
  const intervalMs = opts?.intervalMs ?? 500;
  const ectoolPath = opts?.ectoolPath ?? 'ectool';

  let prev: SwitchState | null = null;
  let polling = false;
  let notFound = false;
  let handle: ReturnType<typeof setInterval> | null = null;

  handle = setInterval(async () => {
    if (polling || notFound) return;
    polling = true;
    try {
      const next = await readSwitches(ectoolPath);
      if (prev === null) {
        prev = next;
        return;
      }
      if (next.cam !== prev.cam) onEvent({ type: 'cam', value: next.cam, prev: prev.cam });
      if (next.mic !== prev.mic) onEvent({ type: 'mic', value: next.mic, prev: prev.mic });
      prev = next;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        notFound = true;
        process.stderr.write(`ec-switches: ectool not found on PATH, skipping EC switch feature\n`);
        if (handle !== null) { clearInterval(handle); handle = null; }
      } else {
        process.stderr.write(`ec-switches: ectool error: ${String(err)}\n`);
      }
    } finally {
      polling = false;
    }
  }, intervalMs);

  return () => {
    if (handle !== null) {
      clearInterval(handle);
      handle = null;
    }
  };
}
