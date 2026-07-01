import { describe, it, expect } from 'vitest';
import { createPresetTriggerEngine } from './preset-triggers.js';
import type { HudPreset } from './config.js';

// Minimal widget slots — only the trigger logic is under test here.
const CLOCK = { widget: 'clock', face: 'elegant' } as const;

function presets(): HudPreset[] {
  return [
    { name: 'daw', left: CLOCK, right: CLOCK, triggers: [{ type: 'process', glob: '*bitwig*' }] },
    { name: 'home', left: CLOCK, right: CLOCK },
  ] as unknown as HudPreset[];
}

const BITWIG = '/usr/lib/jvm/java -cp bitwig.jar com.bitwig.Main';

describe('process triggers', () => {
  it('activates a preset immediately when a matching process appears', () => {
    const activated: string[] = [];
    const engine = createPresetTriggerEngine({
      presets: presets(),
      defaultPreset: 'home',
      onActivate: (n) => activated.push(n),
    });

    engine.updateProcesses([BITWIG]);
    expect(activated).toEqual(['daw']);

    // Still present on the next sample — no redundant re-activation.
    engine.updateProcesses([BITWIG]);
    expect(activated).toEqual(['daw']);
    engine.stop();
  });

  it('matches JVM/Electron apps by glob, not by exact process name', () => {
    const activated: string[] = [];
    const engine = createPresetTriggerEngine({
      presets: presets(),
      defaultPreset: 'home',
      onActivate: (n) => activated.push(n),
    });
    // argv[0] is "java", but the glob matches the full command line.
    engine.updateProcesses(['java -jar /opt/bitwig/bitwig.jar']);
    expect(activated).toEqual(['daw']);
    engine.stop();
  });

  it('debounces disappearance: reverts to default only after 3 missed samples', () => {
    const activated: string[] = [];
    const engine = createPresetTriggerEngine({
      presets: presets(),
      defaultPreset: 'home',
      onActivate: (n) => activated.push(n),
    });

    engine.updateProcesses([BITWIG]);
    expect(activated).toEqual(['daw']);

    // Two missed samples — still sticky, no revert yet.
    engine.updateProcesses([]);
    engine.updateProcesses([]);
    expect(activated).toEqual(['daw']);

    // Third miss crosses the limit — revert to the default preset.
    engine.updateProcesses([]);
    expect(activated).toEqual(['daw', 'home']);
    engine.stop();
  });

  it('does not revert when no default preset is configured (legacy sticky)', () => {
    const activated: string[] = [];
    const engine = createPresetTriggerEngine({
      presets: presets(),
      onActivate: (n) => activated.push(n),
    });

    engine.updateProcesses([BITWIG]);
    engine.updateProcesses([]);
    engine.updateProcesses([]);
    engine.updateProcesses([]);
    engine.updateProcesses([]);
    expect(activated).toEqual(['daw']);
    engine.stop();
  });

  it('preserves an active process match across a preset reload (no default-revert flicker)', () => {
    const activated: string[] = [];
    const engine = createPresetTriggerEngine({
      presets: presets(),
      defaultPreset: 'home',
      onActivate: (n) => activated.push(n),
    });

    engine.updateProcesses([BITWIG]);
    expect(activated).toEqual(['daw']);

    // A config reload (e.g. the user saved an unrelated setting) re-supplies the
    // same presets. Debounce state must survive so the HUD doesn't bounce to the
    // default preset and back.
    engine.updatePresets(presets());
    expect(activated).toEqual(['daw']);
    engine.stop();
  });

  it('re-activates after the process returns following a revert', () => {
    const activated: string[] = [];
    const engine = createPresetTriggerEngine({
      presets: presets(),
      defaultPreset: 'home',
      onActivate: (n) => activated.push(n),
    });

    engine.updateProcesses([BITWIG]);
    engine.updateProcesses([]);
    engine.updateProcesses([]);
    engine.updateProcesses([]); // revert to home
    engine.updateProcesses([BITWIG]); // back again
    expect(activated).toEqual(['daw', 'home', 'daw']);
    engine.stop();
  });
});
