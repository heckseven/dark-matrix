import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import type { HudPreset } from './config.js';

type TriggerEngineOpts = {
  presets: HudPreset[];
  onActivate: (name: string) => void;
};

type TriggerEngine = {
  updatePresets(presets: HudPreset[]): void;
  updateStats(stats: { cpuPct: number; ramPct: number; netRxBps: number; netTxBps: number }): void;
  notifyIdle(): void;
  notifyActive(): void;
  stop(): void;
};

// Maps config metric names to stats field names
const METRIC_MAP: Record<string, keyof { cpuPct: number; ramPct: number; netRxBps: number; netTxBps: number }> = {
  cpu:    'cpuPct',
  ram:    'ramPct',
  net_rx: 'netRxBps',
  net_tx: 'netTxBps',
};

type Stats = { cpuPct: number; ramPct: number; netRxBps: number; netTxBps: number };

export function createPresetTriggerEngine(opts: TriggerEngineOpts): TriggerEngine {
  let presets = opts.presets;

  // Idle/active state
  let isIdle = false;

  // Latest stats
  let latestStats: Stats | null = null;

  // Threshold hysteresis: map of "<presetIdx>:<triggerIdx>" -> consecutive matching ticks
  const thresholdCounters = new Map<string, number>();

  // Interface state: name -> 'up' | 'down'
  const ifaceState = new Map<string, 'up' | 'down'>();

  // VM state: name -> 'running' | 'stopped'
  const vmState = new Map<string, 'running' | 'stopped'>();

  // Last activated preset name
  let lastActivated: string | null = null;

  // --- Helpers ---

  function currentHhmm(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function timeInRange(from: string, to: string, current: string): boolean {
    if (from <= to) {
      return current >= from && current < to;
    }
    // Wraps midnight
    return current >= from || current < to;
  }

  // --- Evaluation ---

  function evaluate(): void {
    for (let pi = 0; pi < presets.length; pi++) {
      const preset = presets[pi]!;
      const triggers = preset.triggers;

      // No triggers = never auto-activates
      if (!triggers || triggers.length === 0) continue;

      let allMatch = true;
      for (let ti = 0; ti < triggers.length; ti++) {
        const trigger = triggers[ti]!;

        if (trigger.type === 'time') {
          const hhmm = currentHhmm();
          if (!timeInRange(trigger.from, trigger.to, hhmm)) {
            allMatch = false;
            break;
          }
        } else if (trigger.type === 'idle') {
          if (!isIdle) { allMatch = false; break; }
        } else if (trigger.type === 'active') {
          if (isIdle) { allMatch = false; break; }
        } else if (trigger.type === 'threshold') {
          if (!latestStats) { allMatch = false; break; }
          const statsKey = METRIC_MAP[trigger.metric];
          if (!statsKey) { allMatch = false; break; }
          const key = `${pi}:${ti}`;
          const value = latestStats[statsKey];
          let conditionMet = true;
          if (trigger.above !== undefined && value <= trigger.above) conditionMet = false;
          if (trigger.below !== undefined && value >= trigger.below) conditionMet = false;

          if (conditionMet) {
            const count = (thresholdCounters.get(key) ?? 0) + 1;
            thresholdCounters.set(key, count);
            if (count < 5) { allMatch = false; break; }
          } else {
            thresholdCounters.set(key, 0);
            allMatch = false;
            break;
          }
        } else if (trigger.type === 'interface') {
          const state = ifaceState.get(trigger.name) ?? 'down';
          if (state !== trigger.state) { allMatch = false; break; }
        } else if (trigger.type === 'vm') {
          const state = vmState.get(trigger.name) ?? 'stopped';
          const wantedState = trigger.state ?? 'running';
          if (state !== wantedState) { allMatch = false; break; }
        }
      }

      if (allMatch) {
        if (lastActivated !== preset.name) {
          lastActivated = preset.name;
          opts.onActivate(preset.name);
        }
        return;
      }
    }
    // No preset matched — don't reset lastActivated, no switch
  }

  // Reset hysteresis counters when presets change
  function resetThresholdCounters(): void {
    thresholdCounters.clear();
  }

  // --- Interface polling (2s interval) ---

  async function pollInterfaces(): Promise<void> {
    let changed = false;
    try {
      const text = await fsPromises.readFile('/proc/net/dev', 'utf-8');
      const names: string[] = [];
      for (const line of text.split('\n').slice(2)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colon = trimmed.indexOf(':');
        if (colon === -1) continue;
        const name = trimmed.slice(0, colon).trim();
        if (name === 'lo') continue;
        names.push(name);
      }

      for (const name of names) {
        try {
          const operstate = (await fsPromises.readFile(`/sys/class/net/${name}/operstate`, 'utf-8')).trim();
          const newState: 'up' | 'down' = operstate === 'up' ? 'up' : 'down';
          if (ifaceState.get(name) !== newState) {
            ifaceState.set(name, newState);
            changed = true;
          }
        } catch (err) {
          // ENOENT = interface gone, treat as down
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            if (ifaceState.get(name) !== 'down') {
              ifaceState.set(name, 'down');
              changed = true;
            }
          }
        }
      }

      // Mark interfaces that disappeared from /proc/net/dev as down
      for (const [name] of ifaceState) {
        if (!names.includes(name)) {
          if (ifaceState.get(name) !== 'down') {
            ifaceState.set(name, 'down');
            changed = true;
          }
        }
      }
    } catch {
      // /proc/net/dev unreadable — non-fatal
    }

    if (changed) evaluate();
  }

  const ifaceInterval = setInterval(() => { void pollInterfaces(); }, 2000);

  // --- VM watching (fs.watch on libvirt qemu pid dir) ---

  let vmWatcher: fs.FSWatcher | null = null;

  function startVmWatch(): void {
    const dir = '/var/run/libvirt/qemu/';
    try {
      vmWatcher = fs.watch(dir, { persistent: false }, (event, filename) => {
        if (event !== 'rename' || !filename) return;
        const fn = filename.toString();
        if (!fn.endsWith('.pid')) return;
        const name = fn.slice(0, -4);
        void (async () => {
          try {
            await fsPromises.access(`${dir}${fn}`);
            // File exists = running
            if (vmState.get(name) !== 'running') {
              vmState.set(name, 'running');
              evaluate();
            }
          } catch {
            // File gone = stopped
            if (vmState.get(name) !== 'stopped') {
              vmState.set(name, 'stopped');
              evaluate();
            }
          }
        })();
      });
      vmWatcher.on('error', () => {
        vmWatcher = null;
      });
    } catch (err) {
      // ENOENT = libvirt not installed, no-op
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        process.stderr.write(`dark-matrix: preset-triggers: vm watch failed: ${String(err)}\n`);
      }
    }
  }

  startVmWatch();

  // --- 60s interval for time-based evaluation ---

  const timeInterval = setInterval(() => { evaluate(); }, 60_000);

  // --- Public API ---

  return {
    updatePresets(newPresets: HudPreset[]): void {
      presets = newPresets;
      resetThresholdCounters();
      evaluate();
    },

    updateStats(stats: Stats): void {
      latestStats = stats;
      evaluate();
    },

    notifyIdle(): void {
      isIdle = true;
      evaluate();
    },

    notifyActive(): void {
      isIdle = false;
      evaluate();
    },

    stop(): void {
      clearInterval(timeInterval);
      clearInterval(ifaceInterval);
      vmWatcher?.close();
      vmWatcher = null;
    },
  };
}
