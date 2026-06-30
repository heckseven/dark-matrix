import { spawn } from 'node:child_process';

export type VmEvent = {
  running: string[];
  started: string[];
  stopped: string[];
};

function spawnOutput(cmd: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: false });
    let stdout = '';
    // Attach error handlers before touching stdio: on a spawn failure stdout may
    // be null, and an unhandled stream 'error' (e.g. EPIPE) would be fatal (M20).
    proc.on('error', () => resolve({ stdout: '', code: 1 }));
    proc.stdout?.on('error', () => { /* pipe error on spawn failure — close settles */ });
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', (code) => resolve({ stdout, code: code ?? 1 }));
  });
}

export async function listRunningVms(virshPath = 'virsh'): Promise<string[]> {
  const { stdout, code } = await spawnOutput(virshPath, ['list', '--name']);
  if (code !== 0) return [];
  return stdout.split('\n').map(l => l.trim()).filter(Boolean);
}

export function watchVms(
  onEvent: (e: VmEvent) => void,
  opts?: { intervalMs?: number; virshPath?: string }
): () => void {
  const intervalMs = opts?.intervalMs ?? 2000;
  const virshPath = opts?.virshPath ?? 'virsh';
  let prev = new Set<string>();
  let disposed = false;

  const poll = async () => {
    if (disposed) return;
    let names: string[];
    try {
      names = await listRunningVms(virshPath);
    } catch {
      process.stderr.write('dark-matrix: vm-source: virsh poll failed\n');
      return;
    }
    const curr = new Set(names);
    const started = names.filter(n => !prev.has(n));
    const stopped = [...prev].filter(n => !curr.has(n));
    if (started.length > 0 || stopped.length > 0) {
      onEvent({ running: names, started, stopped });
    }
    prev = curr;
  };

  const handle = setInterval(poll, intervalMs);

  return () => {
    disposed = true;
    clearInterval(handle);
  };
}
