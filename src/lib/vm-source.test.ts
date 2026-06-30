import { describe, it, expect, vi } from 'vitest';
import { listRunningVms, watchVms } from './vm-source.js';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

function makeProc(stdout: string, exitCode: number): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdoutEmitter = new EventEmitter();
  (proc as unknown as Record<string, unknown>)['stdout'] = stdoutEmitter;
  (proc as unknown as Record<string, unknown>)['stderr'] = new EventEmitter();
  // Use real setTimeout(0) — no fake timers in these tests
  setTimeout(() => {
    stdoutEmitter.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  }, 0);
  return proc;
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

describe('listRunningVms', () => {
  it('parses virsh output with two VM names', async () => {
    mockSpawn.mockImplementationOnce(() => makeProc('vm-alpha\nvm-beta\n', 0));
    expect(await listRunningVms()).toEqual(['vm-alpha', 'vm-beta']);
  });

  it('returns [] when virsh exits non-zero', async () => {
    mockSpawn.mockImplementationOnce(() => makeProc('', 1));
    expect(await listRunningVms()).toEqual([]);
  });

  it('does not crash when the spawned child has no stdout (M20)', async () => {
    mockSpawn.mockImplementationOnce(() => {
      const proc = new EventEmitter() as ChildProcess;
      // Spawn failure: stdio is null. Touching proc.stdout.on without a guard
      // would throw synchronously inside the Promise executor.
      (proc as unknown as Record<string, unknown>)['stdout'] = null;
      (proc as unknown as Record<string, unknown>)['stderr'] = null;
      setTimeout(() => proc.emit('error', new Error('spawn ENOENT')), 0);
      return proc;
    });
    await expect(listRunningVms()).resolves.toEqual([]);
  });
});

describe('watchVms', () => {
  it('emits event with started/stopped when VM set changes', async () => {
    mockSpawn
      .mockImplementationOnce(() => makeProc('vm-alpha\n', 0))
      .mockImplementationOnce(() => makeProc('vm-beta\n', 0));

    const onEvent = vi.fn();
    const dispose = watchVms(onEvent, { intervalMs: 20 });

    await sleep(70); // let 2–3 polls fire

    dispose();
    expect(onEvent.mock.calls.length).toBeGreaterThanOrEqual(2);
    const second = onEvent.mock.calls[1]![0];
    expect(second.started).toContain('vm-beta');
    expect(second.stopped).toContain('vm-alpha');
  });

  it('does NOT emit when running set is unchanged', async () => {
    mockSpawn.mockImplementation(() => makeProc('vm-alpha\n', 0));

    const onEvent = vi.fn();
    const dispose = watchVms(onEvent, { intervalMs: 20 });

    await sleep(70);
    dispose();

    // First poll: empty→alpha (1 emit). Subsequent polls: unchanged (no emit).
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('disposer stops polling', async () => {
    mockSpawn.mockImplementation(() => makeProc('', 0));
    const onEvent = vi.fn();
    const dispose = watchVms(onEvent, { intervalMs: 20 });
    dispose();

    await sleep(60);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
