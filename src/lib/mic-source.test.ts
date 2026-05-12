import { describe, it, expect, vi } from 'vitest';
import { isMicActive, watchMic } from './mic-source.js';
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

const ACTIVE_DUMP = JSON.stringify([
  { id: 1, type: 'PipeWire:Interface:Node', info: { state: 'running', props: { 'media.class': 'Stream/Input/Audio', 'application.name': 'zoom' } } },
]);

const INACTIVE_DUMP = JSON.stringify([
  { id: 2, type: 'PipeWire:Interface:Node', info: { state: 'running', props: { 'media.class': 'Audio/Sink', 'application.name': 'pipewire' } } },
]);

describe('isMicActive', () => {
  it('returns true when a running Stream/Input/Audio node is present', async () => {
    mockSpawn.mockImplementationOnce(() => makeProc(ACTIVE_DUMP, 0));
    expect(await isMicActive()).toBe(true);
  });

  it('returns false when no Stream/Input/Audio nodes are running', async () => {
    mockSpawn.mockImplementationOnce(() => makeProc(INACTIVE_DUMP, 0));
    expect(await isMicActive()).toBe(false);
  });

  it('returns false when pw-dump output is empty', async () => {
    mockSpawn.mockImplementationOnce(() => makeProc('', 0));
    expect(await isMicActive()).toBe(false);
  });

  it('returns false when pw-dump exits non-zero', async () => {
    mockSpawn.mockImplementationOnce(() => makeProc('', 1));
    expect(await isMicActive()).toBe(false);
  });

  it('returns false when output is invalid JSON', async () => {
    mockSpawn.mockImplementationOnce(() => makeProc('not json', 0));
    expect(await isMicActive()).toBe(false);
  });

  it('returns false for a paused (not running) input stream', async () => {
    const dump = JSON.stringify([
      { id: 3, type: 'PipeWire:Interface:Node', info: { state: 'paused', props: { 'media.class': 'Stream/Input/Audio' } } },
    ]);
    mockSpawn.mockImplementationOnce(() => makeProc(dump, 0));
    expect(await isMicActive()).toBe(false);
  });

  it('passes custom pwDumpPath to spawn', async () => {
    mockSpawn.mockImplementationOnce(() => makeProc('[]', 0));
    await isMicActive('/usr/local/bin/pw-dump');
    expect(mockSpawn).toHaveBeenCalledWith('/usr/local/bin/pw-dump', [], expect.any(Object));
  });
});

describe('watchMic', () => {
  it('emits active=true on first poll when mic is already active', async () => {
    mockSpawn.mockImplementation(() => makeProc(ACTIVE_DUMP, 0));

    const onEvent = vi.fn();
    const dispose = watchMic(onEvent, { intervalMs: 20 });

    await sleep(50);
    dispose();
    expect(onEvent).toHaveBeenCalledWith({ active: true });
  });

  it('does not emit on first poll when mic is inactive', async () => {
    mockSpawn.mockImplementation(() => makeProc(INACTIVE_DUMP, 0));

    const onEvent = vi.fn();
    const dispose = watchMic(onEvent, { intervalMs: 20 });

    await sleep(50);
    dispose();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('emits active=true when mic becomes active', async () => {
    mockSpawn
      .mockImplementationOnce(() => makeProc(INACTIVE_DUMP, 0))   // first: inactive baseline
      .mockImplementation(() => makeProc(ACTIVE_DUMP, 0));         // subsequent: active

    const onEvent = vi.fn();
    const dispose = watchMic(onEvent, { intervalMs: 20 });

    await sleep(70);
    dispose();
    expect(onEvent).toHaveBeenCalledWith({ active: true });
  });

  it('emits active=false when mic becomes inactive', async () => {
    mockSpawn
      .mockImplementationOnce(() => makeProc(ACTIVE_DUMP, 0))     // first: active baseline
      .mockImplementation(() => makeProc(INACTIVE_DUMP, 0));       // subsequent: inactive

    const onEvent = vi.fn();
    const dispose = watchMic(onEvent, { intervalMs: 20 });

    await sleep(70);
    dispose();
    const calls = onEvent.mock.calls.map(c => c[0]);
    expect(calls).toContainEqual({ active: false });
  });

  it('does not emit when state is unchanged', async () => {
    mockSpawn.mockImplementation(() => makeProc(INACTIVE_DUMP, 0));

    const onEvent = vi.fn();
    const dispose = watchMic(onEvent, { intervalMs: 20 });

    await sleep(70);
    dispose();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('disposer stops polling', async () => {
    mockSpawn.mockImplementation(() => makeProc(ACTIVE_DUMP, 0));

    const onEvent = vi.fn();
    const dispose = watchMic(onEvent, { intervalMs: 20 });

    await sleep(30); // let first poll complete
    const callsAtDispose = onEvent.mock.calls.length;
    dispose();

    await sleep(60); // confirm no new polls fire after dispose
    expect(onEvent.mock.calls.length).toBe(callsAtDispose);
  });
});
