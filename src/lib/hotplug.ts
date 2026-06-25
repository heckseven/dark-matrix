// Hot-plug edge debouncing.
//
// A by-path serial symlink can flap (briefly appear/disappear) during a bad USB
// connection. Acting on every raw availability change would release and re-open
// the port repeatedly — a storm that also DTR-resets the module display. This
// pure helper commits an edge only after `stablePolls` consecutive readings
// agree and differ from the last committed state.

export type HotplugEdge = 'connected' | 'disconnected';

export interface HotplugPending {
  available: boolean;
  count: number;
}

export interface HotplugResult {
  /** A confirmed, debounced edge — or null if the reading is not (yet) stable. */
  edge: HotplugEdge | null;
  /** The pending-counter state to carry into the next poll (undefined = clear). */
  pending: HotplugPending | undefined;
}

/**
 * Decide whether one availability reading confirms a hot-plug edge.
 *
 * @param available   the device's availability this poll
 * @param committed   the last committed (acted-on) availability
 * @param pending     the carried pending-counter state, if any
 * @param stablePolls consecutive agreeing readings required to confirm an edge
 */
export function hotplugEdge(
  available: boolean,
  committed: boolean,
  pending: HotplugPending | undefined,
  stablePolls: number,
): HotplugResult {
  // Reading matches the committed state — cancel any pending counter, no edge.
  // (A brief return to the committed value mid-debounce resets the timer.)
  if (available === committed) return { edge: null, pending: undefined };

  // Differs from committed: advance (or start) the pending counter.
  const next: HotplugPending = pending && pending.available === available
    ? { available, count: pending.count + 1 }
    : { available, count: 1 };

  if (next.count < stablePolls) return { edge: null, pending: next };

  return { edge: available ? 'connected' : 'disconnected', pending: undefined };
}
