import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFanout } from './fanout.js';

type StartCall = { intervalMs: number; emit: (v: number) => void; stop: ReturnType<typeof vi.fn> };

function makeSource() {
  const starts: StartCall[] = [];
  const start = (emit: (v: number) => void, intervalMs: number) => {
    const stop = vi.fn();
    starts.push({ intervalMs, emit, stop });
    return stop;
  };
  return { start, starts };
}

describe('createFanout (M18 shared poll)', () => {
  let src: ReturnType<typeof makeSource>;
  let hub: ReturnType<typeof createFanout<number>>;

  beforeEach(() => {
    src = makeSource();
    hub = createFanout<number>(src.start, 1000);
  });

  it('starts the source lazily, only once for multiple subscribers', () => {
    expect(src.starts.length).toBe(0);
    hub.subscribe(vi.fn());
    hub.subscribe(vi.fn());
    expect(src.starts.length).toBe(1);
  });

  it('fans one emit out to every subscriber', () => {
    const a = vi.fn(), b = vi.fn();
    hub.subscribe(a);
    hub.subscribe(b);
    src.starts[0]!.emit(5);
    expect(a).toHaveBeenCalledWith(5);
    expect(b).toHaveBeenCalledWith(5);
  });

  it('uses the default interval when none is requested', () => {
    hub.subscribe(vi.fn());
    expect(src.starts[0]!.intervalMs).toBe(1000);
  });

  it('primes a late subscriber with the latest value (no restart)', () => {
    hub.subscribe(vi.fn());
    src.starts[0]!.emit(7);
    const c = vi.fn();
    hub.subscribe(c);
    expect(c).toHaveBeenCalledWith(7);
    expect(src.starts.length).toBe(1); // same interval → source kept running
  });

  it('stops the source when the last subscriber leaves', () => {
    const un = hub.subscribe(vi.fn());
    expect(src.starts[0]!.stop).not.toHaveBeenCalled();
    un();
    expect(src.starts[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it('restarts at the finest interval when a finer subscriber joins', () => {
    hub.subscribe(vi.fn(), 2000);
    expect(src.starts[0]!.intervalMs).toBe(2000);
    hub.subscribe(vi.fn(), 500);
    expect(src.starts.length).toBe(2);
    expect(src.starts[0]!.stop).toHaveBeenCalled();
    expect(src.starts[1]!.intervalMs).toBe(500);
  });

  it('relaxes back to the coarser interval when the finest subscriber leaves', () => {
    hub.subscribe(vi.fn(), 2000);
    const unFine = hub.subscribe(vi.fn(), 500);
    expect(src.starts[1]!.intervalMs).toBe(500);
    unFine();
    expect(src.starts[1]!.stop).toHaveBeenCalled();
    expect(src.starts[2]!.intervalMs).toBe(2000);
  });

  it('does not restart when a coarser subscriber joins an already-finer source', () => {
    hub.subscribe(vi.fn(), 500);
    hub.subscribe(vi.fn(), 2000);
    expect(src.starts.length).toBe(1);
    expect(src.starts[0]!.intervalMs).toBe(500);
  });

  it('keeps fanning out when one subscriber throws', () => {
    hub.subscribe(() => { throw new Error('boom'); });
    const b = vi.fn();
    hub.subscribe(b);
    expect(() => src.starts[0]!.emit(3)).not.toThrow();
    expect(b).toHaveBeenCalledWith(3);
  });

  it('exposes the latest value and clears it across a restart', () => {
    hub.subscribe(vi.fn(), 2000);
    src.starts[0]!.emit(9);
    expect(hub.latest()).toBe(9);
    hub.subscribe(vi.fn(), 500); // finer → restart
    expect(hub.latest()).toBe(null);
  });

  it('an unsubscribe is idempotent', () => {
    const un = hub.subscribe(vi.fn());
    un();
    un();
    expect(src.starts[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it('delivers to every subscriber even if one unsubscribes another mid-emit', () => {
    const delivered: string[] = [];
    let unB: () => void = () => {};
    hub.subscribe(() => { delivered.push('a'); unB(); });
    unB = hub.subscribe(() => { delivered.push('b'); });
    hub.subscribe(() => { delivered.push('c'); });
    src.starts[0]!.emit(1);
    // 'a' unsubscribes 'b' during the fan-out; the snapshot still delivers to b and c.
    expect(delivered).toEqual(['a', 'b', 'c']);
  });

  it('stays retry-able if the source throws on start', () => {
    let attempts = 0;
    const stop = vi.fn();
    const start = vi.fn((_emit: (v: number) => void, _ms: number) => {
      attempts++;
      if (attempts === 1) throw new Error('boom');
      return stop;
    });
    const h = createFanout<number>(start, 1000);
    expect(() => h.subscribe(vi.fn())).toThrow('boom');
    // The machine is not wedged — a subsequent subscribe retries start().
    expect(() => h.subscribe(vi.fn())).not.toThrow();
    expect(start).toHaveBeenCalledTimes(2);
  });
});
