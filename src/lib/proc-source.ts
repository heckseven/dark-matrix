import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export type ProcStats = {
  cpuPct: number;               // 0–100
  ramPct: number;               // 0–100
  netRxBps: number;             // bytes/sec
  netTxBps: number;             // bytes/sec
  cpuCores: number[];           // per-core % usage (0–100), length = logical core count
  batteryPct: number | null;    // 0–100, null when no battery present
  batteryCharging: boolean | null; // false = discharging (on battery), null = no battery
  gpuPct: number | null;        // GPU utilization 0–100, null when unavailable
  gpuTempC: number | null;      // GPU temperature in °C, null when unavailable
};

type CpuRaw = { total: number; idle: number };
type NetRaw = { rx: bigint; tx: bigint };

type CpuAllRaw = { agg: CpuRaw; cores: CpuRaw[] };

async function readCpuAllRaw(): Promise<CpuAllRaw> {
  const text = await fs.readFile('/proc/stat', 'utf-8');
  let agg: CpuRaw = { total: 0, idle: 0 };
  const cores: CpuRaw[] = [];
  for (const line of text.split('\n')) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const label = line.slice(0, spaceIdx);
    if (label !== 'cpu' && !/^cpu\d+$/.test(label)) continue;
    const parts = line.slice(spaceIdx + 1).trim().split(/\s+/).map(Number);
    const [user=0, nice=0, system=0, idle=0, iowait=0, irq=0, softirq=0, steal=0] = parts;
    const raw: CpuRaw = {
      total: user + nice + system + idle + iowait + irq + softirq + steal,
      idle: idle + iowait,
    };
    if (label === 'cpu') agg = raw;
    else cores.push(raw);
  }
  return { agg, cores };
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

type BatteryRaw = { pct: number; charging: boolean } | null;

async function readBatteryRaw(): Promise<BatteryRaw> {
  let dir: string[];
  try {
    dir = await fs.readdir('/sys/class/power_supply');
  } catch {
    return null;
  }
  for (const name of dir) {
    if (!/^BAT\d+$/i.test(name)) continue;
    try {
      const [capText, statusText] = await Promise.all([
        fs.readFile(`/sys/class/power_supply/${name}/capacity`, 'utf-8'),
        fs.readFile(`/sys/class/power_supply/${name}/status`, 'utf-8').catch(() => 'Unknown'),
      ]);
      const pct = parseInt(capText.trim(), 10);
      if (isNaN(pct)) continue;
      const status = statusText.trim();
      return { pct: Math.max(0, Math.min(100, pct)), charging: status === 'Charging' || status === 'Full' };
    } catch { /* try next */ }
  }
  return null;
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

// ── GPU stats ─────────────────────────────────────────────────────────────

let nvidiaSmiMissing = false;

async function readNvidiaSmiStats(): Promise<{ pct: number; tempC: number } | null> {
  if (nvidiaSmiMissing) return null;
  try {
    const { stdout } = await execFileP('nvidia-smi', [
      '--query-gpu=utilization.gpu,temperature.gpu',
      '--format=csv,noheader,nounits',
    ], { timeout: 1500 });
    const parts = stdout.trim().split(',').map(s => parseInt(s.trim(), 10));
    const pct   = parts[0];
    const tempC = parts[1];
    if (pct !== undefined && tempC !== undefined && !isNaN(pct) && !isNaN(tempC)) {
      return { pct: Math.max(0, Math.min(100, pct)), tempC };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') nvidiaSmiMissing = true;
  }
  return null;
}

async function readDrmBusyPct(): Promise<number | null> {
  try {
    const entries = await fs.readdir('/sys/class/drm');
    for (const name of entries.filter(n => /^card\d+$/.test(n)).sort()) {
      try {
        const text = await fs.readFile(`/sys/class/drm/${name}/device/gpu_busy_percent`, 'utf-8');
        const pct = parseInt(text.trim(), 10);
        if (!isNaN(pct)) return Math.max(0, Math.min(100, pct));
      } catch { /* try next card */ }
    }
  } catch { /* /sys/class/drm not available */ }
  return null;
}

async function readGpuHwmonTempC(): Promise<number | null> {
  const GPU_NAMES = new Set(['amdgpu', 'nouveau', 'nvidia', 'i915', 'xe']);
  try {
    const entries = await fs.readdir('/sys/class/hwmon');
    for (const name of entries) {
      try {
        const hwName = (await fs.readFile(`/sys/class/hwmon/${name}/name`, 'utf-8')).trim();
        if (!GPU_NAMES.has(hwName)) continue;
        const raw = await fs.readFile(`/sys/class/hwmon/${name}/temp1_input`, 'utf-8');
        const mc = parseInt(raw.trim(), 10);
        if (!isNaN(mc) && mc > 0) return Math.round(mc / 1000);
      } catch { /* try next hwmon */ }
    }
  } catch { /* /sys/class/hwmon not available */ }
  return null;
}

async function readGpuStats(): Promise<{ pct: number | null; tempC: number | null }> {
  const nvidia = await readNvidiaSmiStats();
  if (nvidia) return { pct: nvidia.pct, tempC: nvidia.tempC };
  const [pct, tempC] = await Promise.all([readDrmBusyPct(), readGpuHwmonTempC()]);
  return { pct, tempC };
}

export function watchProcStats(
  onStats: (s: ProcStats) => void,
  opts?: { intervalMs?: number },
): () => void {
  const intervalMs = opts?.intervalMs ?? 500;
  let prevAgg:   CpuRaw | null = null;
  let prevCores: CpuRaw[]      = [];
  let prevNet:   NetRaw | null = null;
  let prevTime = 0;
  let polling = false;
  let disposed = false;

  const handle = setInterval(async () => {
    if (polling || disposed) return;
    polling = true;
    try {
      const now = Date.now();
      const [{ agg, cores }, ramPct, net, battery, gpu] = await Promise.all([readCpuAllRaw(), readRamPct(), readNetRaw(), readBatteryRaw(), readGpuStats()]);

      if (prevAgg === null || prevNet === null) {
        prevAgg   = agg;
        prevCores = cores;
        prevNet   = net;
        prevTime  = now;
        return;
      }

      const dTotal = agg.total - prevAgg.total;
      const dIdle  = agg.idle  - prevAgg.idle;
      const cpuPct = dTotal > 0 ? ((dTotal - dIdle) / dTotal) * 100 : 0;

      const cpuCores = cores.map((core, i) => {
        const prev = prevCores[i];
        if (!prev) return 0;
        const dt2 = core.total - prev.total;
        const di  = core.idle  - prev.idle;
        return dt2 > 0 ? ((dt2 - di) / dt2) * 100 : 0;
      });

      const dt = (now - prevTime) / 1000;
      const netRxBps = dt > 0 ? Number(net.rx - prevNet.rx) / dt : 0;
      const netTxBps = dt > 0 ? Number(net.tx - prevNet.tx) / dt : 0;

      prevAgg   = agg;
      prevCores = cores;
      prevNet   = net;
      prevTime  = now;

      onStats({
        cpuPct:          Math.max(0, Math.min(100, cpuPct)),
        ramPct:          Math.max(0, Math.min(100, ramPct)),
        netRxBps:        Math.max(0, netRxBps),
        netTxBps:        Math.max(0, netTxBps),
        cpuCores:        cpuCores.map(v => Math.max(0, Math.min(100, v))),
        batteryPct:      battery?.pct ?? null,
        batteryCharging: battery?.charging ?? null,
        gpuPct:          gpu.pct,
        gpuTempC:        gpu.tempC,
      });
    } catch (err) {
      process.stderr.write(`dark-matrix: proc-source: poll failed: ${String(err)}\n`);
    } finally {
      polling = false;
    }
  }, intervalMs);

  return () => { disposed = true; clearInterval(handle); };
}
