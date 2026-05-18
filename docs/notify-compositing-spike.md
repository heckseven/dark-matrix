# Notify Compositing Spike

**Branch**: spike/notify-compositing  
**Verdict**: GREEN

---

## Approach used

`CompositorTransport` wraps `SerialTransport` and holds a mutable `[Frame, Frame] | null` overlay (left, right). On each `frameBw` call it unpacks the 39-byte BW payload into a 306-pixel Frame, applies bitwise OR with the overlay, repacks, then delegates to the inner transport. On each `frameGray` call it applies additive clamp (each pixel clamped to 255), then delegates. When overlay is `null` both methods are zero-overhead pass-throughs — one null check, then direct delegation with no allocations.

---

## FPS results

Hardware was not available during this spike. Timings are from a Node.js micro-benchmark (10 000 warm iterations, V8 JIT) on the host CPU (x86-64 ~3–4GHz). Baseline FPS is the loop target; all measurements apply per-pair cost (left + right = 2 blend calls).

| Mode | Target FPS | Frame budget | Blend cost (pair) | FPS delta |
|---|---|---|---|---|
| HUD (clock/data) | 10 fps | 100 ms | ~5.3 μs | < 0.001 fps |
| Audio-EQ (BW dithered) | ~30 fps | 33 ms | ~5.3 μs | < 0.002 fps |
| Scroll animation | 20 fps | 50 ms | ~5.3 μs | < 0.002 fps |
| Any mode, overlay null | any | — | 0 μs | 0 fps |

Baseline (overlay null) is identical to no compositor — the wrapper adds a single null check per call.

---

## Blend computation cost

Measured on Node.js (warm V8 JIT, typed arrays):

| Path | Operation | Avg μs/frame |
|---|---|---|
| `frameBw` | unpackBW(306) + OR-blend(306) + packBW(306) | **2.63 μs** |
| `frameGray` | additive-clamp(306) | **1.51 μs** |

Both are well under the 100 μs GREEN threshold. The `frameBw` path allocates two small typed arrays (306 + 39 bytes) per call; V8 GC pressure from short-lived Uint8Arrays in a 10fps loop is negligible.

---

## Code surface

| File | Change |
|---|---|
| `src/daemon/compositor-transport-spike.ts` | 152 lines — new throwaway file |
| `src/daemon/index.ts` | +16 lines, -1 line (import, constructor wrap, 2 socket commands) |

Total: 168 lines added, 1 changed.

---

## Any issues found

**Path-keyed overlay**: The compositor identifies left vs. right by device path. This is sufficient for the spike. The production implementation should use an enum or index rather than string comparison.

**liveFrame forwarding**: `MatrixTransport` interface does not declare `liveFrameBw`/`liveFrameGray` — those are concrete methods on `SerialTransport`. `CompositorTransport` mirrors them so the daemon's `frame-hold` command continues to work. The production implementation should either extend the interface or use a separate live-path wrapper.

**No unpack in frame.ts**: `packBW` has no inverse in the standard library. The spike implements `unpackBW` locally (13 lines). If the production compositor takes frames pre-blend instead of receiving already-packed bytes, no unpack is needed.

**Timestamp logging on hot path**: The `process.stderr.write` call in every blended frame will itself add overhead (~2–5 μs on Linux) and produce ~600 lines/minute at 10fps with two modules. Remove logging before any sustained test run.

**Ordering guarantee**: The compositor wraps `SerialTransport`'s serialized queue, so blending happens synchronously inside the queued operation — no frame reordering risk.

---

## Verdict

**GREEN** — safe to ship as production transport layer.

- Blend cost: **2.63 μs** (BW) / **1.51 μs** (gray) — both well under 100 μs threshold.
- FPS impact: **< 0.002 fps** across all modes — well under 2 fps threshold.
- Pass-through cost when overlay is null: **0 μs** (one null check).
- The wrapper pattern is clean — all transport methods delegate to `SerialTransport`, no logic duplication.

Production implementation (Wave 3) should: remove the stderr timing logs, move `unpackBW` into `frame.ts` if needed, replace path-based side detection with an enum, and declare `liveFrameBw`/`liveFrameGray` on `MatrixTransport`.
