import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import type { HudPreset } from './config.js';
import type { ProcStats } from './proc-source.js';
import { matchesGlob } from './notification-routing.js';

type TriggerEngineOpts = {
  presets: HudPreset[];
  onActivate: (name: string) => void;
  // Preset to fall back to when no trigger matches. When set (and it names a
  // real preset), the engine reverts to it instead of leaving the last-matched
  // preset stuck. Undefined preserves the legacy sticky behaviour.
  defaultPreset?: string;
};

// Consecutive process-poll ticks a matched process may be absent before its
// trigger is considered no-longer-matching. Activation is immediate; only
// disappearance is debounced, so a brief app restart doesn't flip the HUD.
const PROCESS_MISS_LIMIT = 3;

type Stats = Pick<ProcStats, 'cpuPct' | 'ramPct' | 'netRxBps' | 'netTxBps' | 'batteryPct'>;

type TriggerEngine = {
  updatePresets(presets: HudPreset[]): void;
  updateStats(stats: Stats): void;
  updateProcesses(cmdlines: string[]): void;
  updateDefaultPreset(name: string | undefined): void;
  stop(): void;
};

// Maps config metric names to stats field names
const METRIC_MAP: Record<string, keyof Stats> = {
  cpu:     'cpuPct',
  ram:     'ramPct',
  net_rx:  'netRxBps',
  net_tx:  'netTxBps',
  battery: 'batteryPct',
};

export function createPresetTriggerEngine(opts: TriggerEngineOpts): TriggerEngine {
  let presets = opts.presets;
  let defaultPreset = opts.defaultPreset;

  // Latest stats
  let latestStats: Stats | null = null;

  // Threshold hysteresis: map of "<presetName>:<triggerIdx>" -> consecutive matching ticks
  const thresholdCounters = new Map<string, number>();

  // Interface state: name -> 'up' | 'down'
  const ifaceState = new Map<string, 'up' | 'down'>();

  // VM state: name -> 'running' | 'stopped'
  const vmState = new Map<string, 'running' | 'stopped'>();

  // Process-trigger debounced state, keyed "<presetName>:<triggerIdx>":
  //   sticky — the current (debounced) match state read by evaluate()
  //   miss   — consecutive absent poll ticks while still sticky
  // Bookkeeping advances only in updateProcesses (once per poll), so evaluate()
  // calls driven by other watchers never accelerate the disappearance debounce.
  const processState = new Map<string, { sticky: boolean; miss: number }>();

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

      const isAny = preset.match === 'any';
      let matchCount = 0;

      for (let ti = 0; ti < triggers.length; ti++) {
        const trigger = triggers[ti]!;
        let triggerMatch = false;

        if (trigger.type === 'time') {
          triggerMatch = timeInRange(trigger.from, trigger.to, currentHhmm());
        } else if (trigger.type === 'threshold') {
          if (latestStats) {
            const statsKey = METRIC_MAP[trigger.metric];
            if (statsKey) {
              const key = `${preset.name}:${ti}`;
              const value = latestStats[statsKey];
              if (value === null) {
                // Metric unavailable (e.g. no battery on this machine)
                thresholdCounters.set(key, 0);
              } else {
                let conditionMet = true;
                if (trigger.above !== undefined && value <= trigger.above) conditionMet = false;
                if (trigger.below !== undefined && value >= trigger.below) conditionMet = false;
                if (conditionMet) {
                  const count = (thresholdCounters.get(key) ?? 0) + 1;
                  thresholdCounters.set(key, count);
                  triggerMatch = count >= 5;
                } else {
                  thresholdCounters.set(key, 0);
                }
              }
            }
          }
        } else if (trigger.type === 'interface') {
          triggerMatch = (ifaceState.get(trigger.name) ?? 'down') === trigger.state;
        } else if (trigger.type === 'vm') {
          const state = vmState.get(trigger.name) ?? 'stopped';
          triggerMatch = state === (trigger.state ?? 'running');
        } else if (trigger.type === 'day') {
          const DOW_MAP: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
          const today = new Date().getDay();
          triggerMatch = trigger.days.some(d => DOW_MAP[d] === today);
        } else if (trigger.type === 'date') {
          const now = new Date();
          triggerMatch = now.getMonth() + 1 === trigger.month && now.getDate() === trigger.day;
        } else if (trigger.type === 'process') {
          triggerMatch = processState.get(`${preset.name}:${ti}`)?.sticky ?? false;
        }

        if (triggerMatch) {
          matchCount++;
          if (isAny) break;
        } else if (!isAny) {
          break;
        }
      }

      const presetMatches = isAny ? matchCount > 0 : matchCount === triggers.length;
      if (presetMatches) {
        if (lastActivated !== preset.name) {
          lastActivated = preset.name;
          opts.onActivate(preset.name);
        }
        return;
      }
    }

    // No preset matched. When a default preset is configured, revert to it so a
    // trigger that stops matching (e.g. the watched app closed) doesn't leave
    // its preset stuck. Without a default, preserve the legacy sticky behaviour.
    if (defaultPreset && defaultPreset !== lastActivated && presets.some(p => p.name === defaultPreset)) {
      lastActivated = defaultPreset;
      opts.onActivate(defaultPreset);
    }
  }

  // Drop debounced trigger state whose key no longer exists after a preset
  // change, but PRESERVE state for triggers whose (preset name, index) are
  // unchanged. Clearing everything would make evaluate() momentarily see all
  // process/threshold triggers as non-matching; now that a no-match reverts to
  // the default preset, that would flip the HUD to the default and back on
  // every unrelated config save (updatePresets runs on every reload).
  function pruneDebounceState(): void {
    const valid = new Set<string>();
    for (const preset of presets) {
      const triggers = preset.triggers;
      if (!triggers) continue;
      for (let ti = 0; ti < triggers.length; ti++) valid.add(`${preset.name}:${ti}`);
    }
    for (const key of [...thresholdCounters.keys()]) if (!valid.has(key)) thresholdCounters.delete(key);
    for (const key of [...processState.keys()]) if (!valid.has(key)) processState.delete(key);
  }

  // Advance the disappearance debounce for every process trigger against the
  // latest /proc sample. Activation is immediate; a matched process must be
  // absent for PROCESS_MISS_LIMIT consecutive samples before it flips off.
  function updateProcessState(cmdlines: string[]): void {
    for (const preset of presets) {
      const triggers = preset.triggers;
      if (!triggers) continue;
      for (let ti = 0; ti < triggers.length; ti++) {
        const trigger = triggers[ti]!;
        if (trigger.type !== 'process') continue;
        const key = `${preset.name}:${ti}`;
        const raw = cmdlines.some(c => matchesGlob(trigger.glob, c));
        const prev = processState.get(key);
        if (raw) {
          processState.set(key, { sticky: true, miss: 0 });
        } else if (prev?.sticky) {
          const miss = prev.miss + 1;
          processState.set(key, miss >= PROCESS_MISS_LIMIT ? { sticky: false, miss: 0 } : { sticky: true, miss });
        }
      }
    }
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
      pruneDebounceState();
      evaluate();
    },

    updateStats(stats: Stats): void {
      latestStats = stats;
      evaluate();
    },

    updateProcesses(cmdlines: string[]): void {
      updateProcessState(cmdlines);
      evaluate();
    },

    updateDefaultPreset(name: string | undefined): void {
      defaultPreset = name;
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
