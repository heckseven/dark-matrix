// Single-source fan-out: many subscribers share one underlying source.
//
// `start` is invoked lazily on the first subscribe, handed an `emit` callback to
// push values to all current subscribers plus the resolved poll interval, and
// returns a disposer called once the last subscriber leaves. This lets several
// consumers (e.g. the preset trigger engine and the HUD data renderer) share a
// single poll instead of each spinning up its own, without any of them owning
// the source's lifecycle.
//
// Subscribers may request different intervals. The source runs at the *finest*
// (smallest) interval any active subscriber asked for; when that minimum
// changes — a finer subscriber joins, or the finest one leaves — the source is
// restarted at the new interval. A coarse always-on consumer therefore keeps a
// slow baseline, and a fast consumer transparently speeds the shared poll up
// only while it is present.
//
// A subscriber that joins without changing the interval (so the source keeps
// running) is primed immediately with the latest value, so a late HUD
// subscriber renders without waiting a full poll interval.
export function createFanout<T>(
  start: (emit: (v: T) => void, intervalMs: number) => () => void,
  defaultIntervalMs: number,
): {
  subscribe: (cb: (v: T) => void, intervalMs?: number) => () => void;
  latest: () => T | null;
} {
  const subs = new Map<symbol, { cb: (v: T) => void; intervalMs: number }>();
  let stop: (() => void) | null = null;
  let currentInterval = Infinity;
  // Boxed so `null` unambiguously means "nothing emitted yet" even when T is
  // itself nullable.
  let latest: { v: T } | null = null;

  const emit = (v: T) => {
    latest = { v };
    // Snapshot the subscribers: a callback that unsubscribes another subscriber
    // mid-emit must not skip delivery to a not-yet-visited one.
    for (const { cb } of [...subs.values()]) {
      try { cb(v); } catch { /* subscriber errors are non-fatal */ }
    }
  };

  // Restart the source iff the finest requested interval changed.
  const reconcile = () => {
    let target = Infinity;
    for (const { intervalMs } of subs.values()) {
      if (intervalMs < target) target = intervalMs;
    }
    if (target === currentInterval) return;
    stop?.();
    latest = null;
    if (target === Infinity) { stop = null; currentInterval = Infinity; return; }
    try {
      stop = start(emit, target);
      currentInterval = target;
    } catch (e) {
      // Leave the machine stopped and retry-able rather than wedged at a
      // not-actually-running interval.
      stop = null;
      currentInterval = Infinity;
      throw e;
    }
  };

  return {
    subscribe(cb, intervalMs = defaultIntervalMs) {
      const key = Symbol();
      const sourceWasRunning = stop !== null;
      subs.set(key, { cb, intervalMs });
      reconcile();
      // If the source kept running (interval unchanged), prime the late joiner;
      // if it restarted, `latest` was cleared and the next poll feeds everyone.
      if (sourceWasRunning && stop !== null && latest !== null) {
        try { cb(latest.v); } catch { /* non-fatal */ }
      }
      return () => {
        if (!subs.delete(key)) return;
        reconcile();
      };
    },
    latest: () => (latest ? latest.v : null),
  };
}
