import { describe, it, expect } from 'vitest';
import { hotplugEdge, type HotplugPending } from './hotplug.js';

// Simulate a stream of availability readings through the debouncer, mirroring
// how pollModules carries `committed`/`pending` across polls. Returns the edges
// that fired, in order.
function run(readings: boolean[], stablePolls: number, startCommitted = true) {
  let committed = startCommitted;
  let pending: HotplugPending | undefined;
  const edges: string[] = [];
  for (const available of readings) {
    const res = hotplugEdge(available, committed, pending, stablePolls);
    pending = res.pending;
    if (res.edge) { edges.push(res.edge); committed = available; }
  }
  return edges;
}

describe('hotplugEdge', () => {
  it('emits no edge while the reading matches committed state', () => {
    expect(run([true, true, true], 3)).toEqual([]);
  });

  it('confirms a disconnect only after N consecutive stable readings', () => {
    // committed=true; need 3 consecutive `false` to confirm a disconnect.
    expect(run([false, false], 3)).toEqual([]);          // only 2 — not yet
    expect(run([false, false, false], 3)).toEqual(['disconnected']);
  });

  it('does NOT storm on a flapping symlink (the burn-unit BLOCK)', () => {
    // Connector jitter: present/absent alternating never reaches a stable run,
    // so no edge — and therefore no release/reopen storm — ever fires.
    const flap = [false, true, false, true, false, true, false, true];
    expect(run(flap, 3)).toEqual([]);
  });

  it('a brief dropout that recovers before the threshold emits nothing', () => {
    // 2 missed polls then back — under the 3-poll threshold, no disconnect.
    expect(run([false, false, true, true], 3)).toEqual([]);
  });

  it('emits exactly one edge per stable transition, not one per poll', () => {
    // Disconnect (3×false), stay gone, then reconnect (3×true), stay present.
    const seq = [false, false, false, false, false, true, true, true, true];
    expect(run(seq, 3)).toEqual(['disconnected', 'connected']);
  });

  it('resets the pending counter when the reading flips back mid-debounce', () => {
    // false,false (count 2) then true (matches committed → clears) then a fresh
    // false run must start counting from 1 again.
    expect(run([false, false, true, false, false], 3)).toEqual([]);
    expect(run([false, false, true, false, false, false], 3)).toEqual(['disconnected']);
  });

  it('honors stablePolls=1 as act-immediately', () => {
    expect(run([false], 1)).toEqual(['disconnected']);
    expect(run([false, true], 1, true)).toEqual(['disconnected', 'connected']);
  });
});
