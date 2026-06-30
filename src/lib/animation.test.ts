import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAnimation, nextFrameAnchor } from './animation.js';
import type { Animation } from './animation.js';
import { createFrame } from './frame.js';
import type { MatrixTransport } from './transport.js';

function makeTransport(): MatrixTransport {
  return {
    frameBw: vi.fn().mockResolvedValue(undefined),
    frameGray: vi.fn().mockResolvedValue(undefined),
    command: vi.fn().mockResolvedValue(undefined),
    brightness: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAnimation(frameCount: number): Animation {
  let count = 0;
  let stopped = false;
  return {
    stop() { stopped = true; },
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (stopped || count >= frameCount) return { done: true as const, value: undefined };
          count++;
          return { done: false, value: createFrame() };
        },
      };
    },
  };
}

describe('nextFrameAnchor (M21 suspend/resume)', () => {
  it('advances by one frame when the anchor is on schedule', () => {
    const frameMs = 1000 / 30;
    const anchor = Date.now() + 100;               // anchor in the near future
    expect(nextFrameAnchor(anchor, frameMs)).toBeCloseTo(anchor + frameMs, 0);
  });

  it('resyncs to now after a large clock jump instead of bursting catch-up frames', () => {
    const frameMs = 1000 / 30;
    const stale = Date.now() - 60_000;             // anchor 60s in the past (resume)
    // Bracket the internal Date.now() so the assertion can't race a loaded runner.
    const before = Date.now();
    const next = nextFrameAnchor(stale, frameMs);
    const after = Date.now();
    // Would be ~60s behind if it just added one frame; instead it jumps to ~now,
    // so the loop renders one frame and resumes normal pacing (no burst).
    expect(next).toBeGreaterThanOrEqual(before);
    expect(next).toBeLessThanOrEqual(after);
  });
});

describe('runAnimation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls frameBw for each frame in bw mode', async () => {
    const transport = makeTransport();
    const anim = makeAnimation(3);
    const dispose = runAnimation(anim, {
      transport, devicePath: '/dev/ttyACM0', mode: 'bw', fps: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    dispose();

    expect(transport.frameBw).toHaveBeenCalledTimes(3);
  });

  it('calls frameGray for each frame in gray mode', async () => {
    const transport = makeTransport();
    const anim = makeAnimation(2);
    const dispose = runAnimation(anim, {
      transport, devicePath: '/dev/ttyACM0', mode: 'gray', fps: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    dispose();

    expect(transport.frameGray).toHaveBeenCalledTimes(2);
  });

  it('disposer calls stop()', async () => {
    const transport = makeTransport();
    const anim = makeAnimation(1000);
    const stopSpy = vi.spyOn(anim, 'stop');
    const dispose = runAnimation(anim, {
      transport, devicePath: '/dev/ttyACM0', fps: 100,
    });

    dispose();
    await vi.advanceTimersByTimeAsync(50);

    expect(stopSpy).toHaveBeenCalled();
  });

  it('does not release port on natural completion', async () => {
    const transport = makeTransport();
    const anim = makeAnimation(2);
    void runAnimation(anim, { transport, devicePath: '/dev/ttyACM0', fps: 100 });

    await vi.advanceTimersByTimeAsync(200);

    expect(transport.release).not.toHaveBeenCalled();
  });

  it('continues loop after transport error', async () => {
    const transport = makeTransport();
    (transport.frameBw as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('write error'))
      .mockResolvedValue(undefined);

    const anim = makeAnimation(3);
    const dispose = runAnimation(anim, {
      transport, devicePath: '/dev/ttyACM0', mode: 'bw', fps: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    dispose();

    // Attempted 3 frames despite first failure
    expect(transport.frameBw).toHaveBeenCalledTimes(3);
  });

  it('stops after maxConsecutiveFailures consecutive write failures (L26)', async () => {
    const transport = makeTransport();
    (transport.frameBw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('device gone'));

    const anim = makeAnimation(1000);
    const dispose = runAnimation(anim, {
      transport, devicePath: '/dev/ttyACM0', mode: 'bw', fps: 1000, maxConsecutiveFailures: 3,
    });

    await vi.advanceTimersByTimeAsync(100);

    // Gave up after exactly 3 unbroken failures instead of writing forever.
    expect(transport.frameBw).toHaveBeenCalledTimes(3);
    await dispose();
  });

  it('resets the failure counter after a successful write (L26)', async () => {
    const transport = makeTransport();
    (transport.frameBw as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce(undefined)   // success resets the streak
      .mockRejectedValue(new Error('blip'));

    const anim = makeAnimation(1000);
    const dispose = runAnimation(anim, {
      transport, devicePath: '/dev/ttyACM0', mode: 'bw', fps: 1000, maxConsecutiveFailures: 3,
    });

    await vi.advanceTimersByTimeAsync(100);

    // 2 fails, 1 success (reset), then 3 more fails → 6 attempts before giving up,
    // proving the streak resets rather than counting cumulative failures.
    expect(transport.frameBw).toHaveBeenCalledTimes(6);
    await dispose();
  });
});
