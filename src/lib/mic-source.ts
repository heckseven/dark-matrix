import { spawn } from 'node:child_process';

export type MicEvent = { active: boolean };

function spawnOutput(cmd: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: false });
    let stdout = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', (code) => resolve({ stdout, code: code ?? 1 }));
    proc.on('error', () => resolve({ stdout: '', code: 1 }));
  });
}

export async function isMicActive(pactlPath = 'pactl'): Promise<boolean> {
  const { stdout, code } = await spawnOutput(pactlPath, ['list', 'source-outputs']);
  if (code !== 0) return false;
  return stdout.split('\n').some(l => l.startsWith('Source Output #'));
}

export function watchMic(
  onEvent: (e: MicEvent) => void,
  opts?: { intervalMs?: number; pactlPath?: string },
): () => void {
  const intervalMs = opts?.intervalMs ?? 2000;
  const pactlPath = opts?.pactlPath ?? 'pactl';
  let prev: boolean | null = null;
  let polling = false;
  let disposed = false;

  const handle = setInterval(async () => {
    if (polling || disposed) return;
    polling = true;
    try {
      const active = await isMicActive(pactlPath);
      if (prev === null) {
        prev = active;
        if (active) onEvent({ active });
        return;
      }
      if (active !== prev) {
        prev = active;
        onEvent({ active });
      }
    } catch {
      // pactl unavailable — non-fatal
    } finally {
      polling = false;
    }
  }, intervalMs);

  return () => {
    disposed = true;
    clearInterval(handle);
  };
}
