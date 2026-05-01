import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process');

import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

import { readSwitches, watchSwitches } from './ec-switches.js';
import type { SwitchEvent } from './ec-switches.js';

// Build a fake ChildProcess with stdout/stderr streams and close/error events.
function makeProc(stdout: string, exitCode: number, spawnError?: Error) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  // Emit asynchronously so callers can attach handlers first.
  Promise.resolve().then(() => {
    if (spawnError) { proc.emit('error', spawnError); return; }
    proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  });

  return proc;
}

// CAM_SW response then MIC_SW response, in call order.
function setupSpawn(camOut: string, camCode: number, micOut: string, micCode: number) {
  mockSpawn
    .mockImplementationOnce(() => makeProc(camOut, camCode) as ReturnType<typeof spawn>)
    .mockImplementationOnce(() => makeProc(micOut, micCode) as ReturnType<typeof spawn>);
}

describe('readSwitches', () => {
  beforeEach(() => mockSpawn.mockReset());

  it('parses GPIO output into cam and mic values', async () => {
    setupSpawn('GPIO CAM_SW = 0\n', 0, 'GPIO MIC_SW = 1\n', 0);
    const state = await readSwitches('/fake/ectool');
    expect(state).toEqual({ cam: 0, mic: 1 });
  });

  it('throws when ectool exits non-zero', async () => {
    setupSpawn('', 1, 'GPIO MIC_SW = 0\n', 0);
    await expect(readSwitches('/fake/ectool')).rejects.toThrow();
  });
});

describe('watchSwitches', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSpawn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Set up N pairs of cam/mic responses.
  function setupPoll(polls: Array<{ cam: number; mic: number }>) {
    for (const p of polls) {
      mockSpawn
        .mockImplementationOnce(() => makeProc(`GPIO CAM_SW = ${p.cam}\n`, 0) as ReturnType<typeof spawn>)
        .mockImplementationOnce(() => makeProc(`GPIO MIC_SW = ${p.mic}\n`, 0) as ReturnType<typeof spawn>);
    }
  }

  it('emits SwitchEvent when CAM_SW changes from 0 to 1', async () => {
    setupPoll([{ cam: 0, mic: 0 }, { cam: 1, mic: 0 }]);

    const events: SwitchEvent[] = [];
    const dispose = watchSwitches((e) => events.push(e), { intervalMs: 100, ectoolPath: '/fake/ectool' });

    // First tick — establishes baseline, no event.
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve(); // flush setImmediate callbacks

    // Second tick — CAM_SW changed.
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    dispose();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'cam', value: 1, prev: 0 });
  });

  it('does not emit when value is unchanged', async () => {
    setupPoll([{ cam: 0, mic: 0 }, { cam: 0, mic: 0 }]);

    const events: SwitchEvent[] = [];
    const dispose = watchSwitches((e) => events.push(e), { intervalMs: 100, ectoolPath: '/fake/ectool' });

    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    dispose();
    expect(events).toHaveLength(0);
  });

  it('dispose stops polling', async () => {
    setupPoll([{ cam: 0, mic: 0 }]);

    const events: SwitchEvent[] = [];
    const dispose = watchSwitches((e) => events.push(e), { intervalMs: 100, ectoolPath: '/fake/ectool' });

    // Establish baseline.
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    dispose();

    // Advance further — no additional spawn calls should occur.
    const callsBefore = mockSpawn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(mockSpawn.mock.calls.length).toBe(callsBefore);
    expect(events).toHaveLength(0);
  });

  it('continues polling after ectool failure and writes to stderr', async () => {
    // First poll: spawn error. Second poll: success for state baseline.
    mockSpawn
      .mockImplementationOnce(() => makeProc('', 0, new Error('spawn ENOENT')) as ReturnType<typeof spawn>)
      .mockImplementationOnce(() => makeProc('', 0, new Error('spawn ENOENT')) as ReturnType<typeof spawn>)
      // Second poll succeeds.
      .mockImplementationOnce(() => makeProc('GPIO CAM_SW = 0\n', 0) as ReturnType<typeof spawn>)
      .mockImplementationOnce(() => makeProc('GPIO MIC_SW = 0\n', 0) as ReturnType<typeof spawn>);

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const events: SwitchEvent[] = [];
    const dispose = watchSwitches((e) => events.push(e), { intervalMs: 100, ectoolPath: '/fake/ectool' });

    // First tick — fails.
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(stderrSpy).toHaveBeenCalled();

    // Second tick — succeeds, no crash.
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    dispose();
    stderrSpy.mockRestore();
  });
});
