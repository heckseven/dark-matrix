import { spawn } from 'node:child_process';

export type MicEvent = { active: boolean };

export const DARK_MATRIX_APP_NAME = 'dark-matrix';

function spawnOutput(cmd: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: false });
    let stdout = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', (code) => resolve({ stdout, code: code ?? 1 }));
    proc.on('error', () => resolve({ stdout: '', code: 1 }));
  });
}

type PwNode = {
  type?: string;
  info?: { state?: string; props?: Record<string, unknown> };
};

export async function isMicActive(pwDumpPath = 'pw-dump'): Promise<boolean> {
  const { stdout, code } = await spawnOutput(pwDumpPath, []);
  if (code !== 0 || !stdout) return false;
  let nodes: PwNode[];
  try { nodes = JSON.parse(stdout) as PwNode[]; } catch { return false; }
  return nodes.some(n =>
    n.type === 'PipeWire:Interface:Node' &&
    n.info?.props?.['media.class'] === 'Stream/Input/Audio' &&
    n.info?.props?.['application.name'] !== 'pw-record' &&
    n.info?.props?.['application.name'] !== DARK_MATRIX_APP_NAME &&
    n.info?.state === 'running',
  );
}

export function watchMic(
  onEvent: (e: MicEvent) => void,
  opts?: { intervalMs?: number; pwDumpPath?: string },
): () => void {
  const intervalMs = opts?.intervalMs ?? 2000;
  const pwDumpPath = opts?.pwDumpPath ?? 'pw-dump';
  let prev: boolean | null = null;
  let polling = false;
  let disposed = false;

  const handle = setInterval(async () => {
    if (polling || disposed) return;
    polling = true;
    try {
      const active = await isMicActive(pwDumpPath);
      if (prev === null) {
        prev = active;
        if (active) onEvent({ active });
        return;
      }
      if (active !== prev) {
        prev = active;
        onEvent({ active });
      }
    } catch (err) {
      process.stderr.write(`dark-matrix: mic-source: pactl poll failed: ${String(err)}\n`);
    } finally {
      polling = false;
    }
  }, intervalMs);

  return () => {
    disposed = true;
    clearInterval(handle);
  };
}
