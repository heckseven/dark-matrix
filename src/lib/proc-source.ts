import fs from 'node:fs/promises';

export type ProcStats = {
  cpuPct: number;    // 0–100
  ramPct: number;    // 0–100
  netRxBps: number;  // bytes/sec
  netTxBps: number;  // bytes/sec
};

type CpuRaw = { total: number; idle: number };
type NetRaw = { rx: bigint; tx: bigint };

async function readCpuRaw(): Promise<CpuRaw> {
  const text = await fs.readFile('/proc/stat', 'utf-8');
  const parts = (text.split('\n')[0] ?? '').trim().split(/\s+/).slice(1).map(Number);
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = parts;
  return {
    total: user + nice + system + idle + iowait + irq + softirq + steal,
    idle: idle + iowait,
  };
}

async function readRamPct(): Promise<number> {
  const text = await fs.readFile('/proc/meminfo', 'utf-8');
  let total = 0, avail = 0;
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = parseInt(line.slice(colon + 1).trim(), 10);
    if (key === 'MemTotal') total = val;
    else if (key === 'MemAvailable') avail = val;
    if (total && avail) break;
  }
  return total > 0 ? ((total - avail) / total) * 100 : 0;
}

async function readNetRaw(): Promise<NetRaw> {
  const text = await fs.readFile('/proc/net/dev', 'utf-8');
  let rx = 0n, tx = 0n;
  for (const line of text.split('\n').slice(2)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    if (trimmed.slice(0, colon).trim() === 'lo') continue;
    const parts = trimmed.slice(colon + 1).trim().split(/\s+/);
    rx += BigInt(parts[0] ?? '0');
    tx += BigInt(parts[8] ?? '0');
  }
  return { rx, tx };
}

export function watchProcStats(
  onStats: (s: ProcStats) => void,
  opts?: { intervalMs?: number },
): () => void {
  const intervalMs = opts?.intervalMs ?? 1000;
  let prevCpu: CpuRaw | null = null;
  let prevNet: NetRaw | null = null;
  let prevTime = 0;
  let polling = false;
  let disposed = false;

  const handle = setInterval(async () => {
    if (polling || disposed) return;
    polling = true;
    try {
      const now = Date.now();
      const [cpu, ramPct, net] = await Promise.all([readCpuRaw(), readRamPct(), readNetRaw()]);

      if (prevCpu === null || prevNet === null) {
        prevCpu = cpu;
        prevNet = net;
        prevTime = now;
        return;
      }

      const dTotal = cpu.total - prevCpu.total;
      const dIdle  = cpu.idle  - prevCpu.idle;
      const cpuPct = dTotal > 0 ? ((dTotal - dIdle) / dTotal) * 100 : 0;

      const dt = (now - prevTime) / 1000;
      const netRxBps = dt > 0 ? Number(net.rx - prevNet.rx) / dt : 0;
      const netTxBps = dt > 0 ? Number(net.tx - prevNet.tx) / dt : 0;

      prevCpu = cpu;
      prevNet = net;
      prevTime = now;

      onStats({
        cpuPct:   Math.max(0, Math.min(100, cpuPct)),
        ramPct:   Math.max(0, Math.min(100, ramPct)),
        netRxBps: Math.max(0, netRxBps),
        netTxBps: Math.max(0, netTxBps),
      });
    } catch (err) {
      process.stderr.write(`dark-matrix: proc-source: poll failed: ${String(err)}\n`);
    } finally {
      polling = false;
    }
  }, intervalMs);

  return () => { disposed = true; clearInterval(handle); };
}
