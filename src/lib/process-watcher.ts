import fsPromises from 'node:fs/promises';

// Standalone process presence watcher. Polls /proc, reading each process's
// full command line, and hands the sample to a consumer. Kept independent of
// the preset trigger engine so other subsystems (e.g. notification routing)
// can consume the same sample later without pulling in trigger logic.

export type ProcessWatcher = { stop(): void };

// Reads the full command line of every process under procRoot. Each returned
// string is one process's argv joined by spaces (NUL separators collapsed).
// procRoot is injectable so tests can point at a fixture directory.
export async function readProcessCmdlines(procRoot = '/proc'): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fsPromises.readdir(procRoot);
  } catch {
    // /proc unreadable (non-Linux, sandbox) — no processes visible.
    return [];
  }

  const selfPid = String(process.pid);
  // Read every PID's cmdline concurrently — on a busy host serializing hundreds
  // of tiny reads each poll can approach the poll interval.
  const reads = entries
    .filter(entry => /^\d+$/.test(entry) && entry !== selfPid)
    .map(async (entry) => {
      const raw = await fsPromises.readFile(`${procRoot}/${entry}/cmdline`);
      if (raw.length === 0) return null; // kernel threads have an empty cmdline
      return raw.toString('utf8').replace(/\0/g, ' ').trim() || null;
    });

  const cmdlines: string[] = [];
  for (const result of await Promise.allSettled(reads)) {
    // Rejected reads = PID vanished mid-scan or /proc/<pid> unreadable — skip.
    if (result.status === 'fulfilled' && result.value) cmdlines.push(result.value);
  }
  return cmdlines;
}

export function createProcessWatcher(opts: {
  intervalMs?: number;
  procRoot?: string;
  onSample: (cmdlines: string[]) => void;
}): ProcessWatcher {
  const intervalMs = opts.intervalMs ?? 2000;
  let stopped = false;
  let inFlight = false;

  async function tick(): Promise<void> {
    // Skip if a prior scan is still running so a slow tick can't overlap the
    // next one and deliver an out-of-order (stale) sample.
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const cmdlines = await readProcessCmdlines(opts.procRoot);
      if (!stopped) opts.onSample(cmdlines);
    } finally {
      inFlight = false;
    }
  }

  // Prime immediately so a trigger can fire without waiting a full interval.
  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();

  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
    },
  };
}
