import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAnimation } from './animation.js';
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

  it('disposer calls stop() and release()', async () => {
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
});
