# Resilience Remediation Plan — 26 findings, 6 PRs

**Date:** 2026-06-24
**Source register:** [`docs/resilience-audit.md`](./resilience-audit.md) (per-finding detail, `file:line`, mechanism)
**Process:** the-architect plan → burn-unit critique (verdict **AMEND**) → amendments folded in below.
**Decisions locked:** all 26 findings (phased), testing bar = automated + fault-injection harness + manual user smoke, delivery = one PR per cluster (`worktree-*` branch, `--no-ff` merge), each gated on `/commit` review loop + `pnpm typecheck` + `pnpm test` green.
**Reference pattern (commit 47d2e80):** persistent `socket.on('error')` swallowing `EPIPE`/`ECONNRESET`/`ERR_STREAM_WRITE_AFTER_END` + `socket.writable` gating instead of `!socket.destroyed`. All Critical fixes mirror this.

## Resolved decision — H5 corrupt-config recovery
**DECIDED: Option A — atomic writes everywhere + back up & re-bootstrap on corruption.** All config writes use `writeJsonAtomic` (temp + rename) to prevent corruption. On an already-corrupt/unparseable `config.json` at startup: rename it to `config.json.bak` (preserved for manual recovery), regenerate `DEFAULT_CONFIG` atomically, log loudly, and boot. This resets `uncalibrated → true`, so the welcome/calibration screen reappears — this is the **documented, accepted** power-loss recovery behavior (industry-standard: rename-aside-and-regenerate). Phase 3 success criterion + manual smoke must explicitly verify the welcome screen reappears after recovery.

## Scheduling (waves)
- **Wave A (parallel):** Phase 1 (serial), Phase 2 (deck hardening) — disjoint files.
- **Wave B (after P1 merges; P3 & P4 authored concurrently, merged sequentially onto P1):** Phase 3 (config), Phase 4 (daemon robustness).
- **Wave C (after P1 + P2 merge):** Phase 5 (audio/HUD).
- **Wave D (after P2, and after P5):** Phase 6 (deck UX + bounds).

## Cross-phase file contention
| File | Phases | Rule |
|---|---|---|
| `src/daemon/index.ts` | 1,3,4,5 | **P1 merges first**; 3/4/5 rebase onto it, merge one at a time (edits in distinct regions). |
| `src/lib/transport.ts` | 1 only | P1 owns all edits; P5 only consumes new semantics. |
| `src/deck/server.ts` | 2,5,6 | **P2 merges first**; 5/6 rebase onto it. |
| `src/animations/audio-eq.ts` | 5 | **L25 moved into Phase 5** (single owner). Decided. |

---

## Phase 1 — `fix(serial): harden port lifecycle against disconnect` (C1, H8, H9, H11)
Files: `lib/transport.ts`, `daemon/index.ts` (pollModules only), `lib/transport.test.ts`, `daemon/daemon.test.ts`.

- **C1+H8** persistent `port.on('error', …)` in `openPort` (log unexpected codes, evict). Eviction = `closePort` + delete from `ports`/`opening`/`queues`/`live`, wired into `writePort` rejection paths.
- **H11** drain/cancel `live` state in `release()`/`close()`; guard `runLive` against a removed port.
- **H9** `pollModules`: `await transport.release(dev)` on disconnect edge; route reconnect through the resting path so the new `runAnimation` disposer is tracked.

**AMENDMENTS (burn-unit BLOCK/WARN — folded in):**
- **Eviction race:** make eviction **idempotent** via a per-port `dead` flag checked at the top of each `runLive`/`enqueue` iteration. **Never delete `state` while `state.writing === true`** — let the loop observe `dead`, exit, and clear `state.writing` itself; let the current `op().catch()` settle before teardown. (Else `state.writing` sticks `true` and every future write parks in `state.next` forever.)
- **pollModules flap storm:** add **hysteresis/debounce** — require N consecutive stable polls before acting on an edge. (`fs.access` flapping on a bad USB connection would otherwise release+reopen every 500ms — a new storm the current disposer-discard accidentally avoids.)
- **Test seam:** before coding, **verify a `serialport` module-mock seam exists** (`openPort` constructs `new SerialPort` directly, no DI). If absent, first task is introducing it. Mock must emit `'error'` **asynchronously (next tick)** to exercise the uncaught path.
- **Success criteria (strengthened):** for C1/H11, assert that an out-of-band `port.emit('error', EIO)` **mid-write produces no `uncaughtException`** (spy on process listeners) — counts alone don't prove the crash is fixed. For H8/H9, the replug-cycle harness asserts exactly one loop + one open port per device, and a rapid-flap test asserts ≤1 release+reopen per stable transition.

Manual smoke: yank a module mid-animation (daemon survives, that module dark, other keeps running); replug (wipe plays, resumes); repeat 5× (no CPU/fd creep, no duplicate frames); jiggle a loose connector (no release/reopen storm).

---

## Phase 2 — `fix(deck): process-level fault handlers and per-connection guards` (C2, C3, H4, H12)
Files: `cli/index.ts` (cmdDeck), `deck/server.ts`, `deck/server.test.ts`. **Parallel with Phase 1.**

- **C2 (first)** register `uncaughtException`/`unhandledRejection` in `cmdDeck`, mirroring the daemon.
- **C3** per-`ws` `'error'` listener in `wss.on('connection')`; gate every deferred `ws.send` (`2094-2169`) on `readyState === 1`.
- **H4** `child.on('error', () => {})` on the browser-opener spawn before `unref()`.
- **H12** wrap the top-level `createServer` async body in try/catch → 500.

Tests: mock-WS half-close harness; stubbed `spawn` ENOENT; route-reject fixture (stubbed `fs.mkdir` EROFS).
Manual smoke: abrupt tab close during live preview (log clean, others unaffected); start with no `xdg-open`; read-only library dir → asset save returns 500, deck stays up.

---

## Phase 3 — `fix(config): survive power-loss corruption and reload faults` (H5, H7)
Files: `lib/config.ts`, `daemon/index.ts` (startup load + `onReload` `:1702`), `lib/config.test.ts`, `daemon/daemon.test.ts`. **After Phase 1.** **Blocked on the H5 decision above.**

- **H5** convert `bootstrapConfig`/`writeDefaultConfig` writes to existing `writeJsonAtomic` (`:284`); at startup catch `ConfigError` (≠ `ENOENT`) → back up corrupt file + recover per the chosen H5 option, instead of `exit(1)`.
- **H7** wrap the full SIGHUP `onReload` body in try/catch (log + survive on prior good config).

Tests: truncated/garbage/empty-object config fixtures asserting recovery + atomic write; reload-throws survival.
Manual smoke: truncate `config.json`, restart → boots on backup/default (**verify welcome-screen behavior matches the chosen H5 option**); save config from Deck → reload applies; induced reload fault doesn't kill the daemon.

---

## Phase 4 — `fix(daemon): bound IPC buffer and harden fatal/data paths` (H6, M13, M14, M21)
Files: `daemon/index.ts`, `daemon/daemon.test.ts`. **After Phase 1** (sequence merge with Phase 3).

- **H6** cap the IPC read buffer; destroy the socket past threshold without a recognized frame.
- **M13** `process.once` → `process.on` for fatal handlers, gated by the existing `exiting` flag.
- **M14** wrap `claudeRenderers.onEvent` dispatch + the `'data'` body in try/catch.
- **M21** clamp `nextAt = Math.max(nextAt, Date.now())` (and cap negative waits) so a post-suspend clock jump can't run the loop flat-out.

**AMENDMENT (burn-unit WARN):** the IPC cap must **not truncate a legitimate large HTTP `/hook` body or large JSON frame** (hook bodies have no newline framing; recognized only once fully buffered, `:1211`). Set the cap **well above max legitimate payload** (e.g. 256KB), and only destroy on **genuine garbage** — no `{`/`[`/HTTP-method prefix *and* no parseable partial HTTP header — not a slow-but-valid frame still streaming.

Tests: oversized-garbage socket (destroyed) vs large-valid-frame (accepted); double-fault shutdown; throwing renderer; clock-jump pacing via fake timers.
Manual smoke: suspend >10 min, resume (smooth, no frame burst, no watchdog spam); malformed IPC client connected (no memory growth).

---

## Phase 5 — `fix(audio): make daemon audio/HUD hardware recover and self-bound` (H10, M15, M16, M18, L25)
Files: `daemon/index.ts`, `deck/server.ts` (H10 ownership `:1914-1921`/`:1986`), `animations/audio-eq.ts` (M15 + L25), `daemon/daemon.test.ts`, `deck/server.test.ts`. **After Phase 1 + Phase 2.**

- **H10** per-socket audio/HUD ownership; on owning socket close, cancel any pending `audio-hardware-start` retry and stop that owner's hardware.
- **M15** respawn-with-backoff for hardware audio-EQ mode (share the `streamAudioBands` helper).
- **M16** exponential backoff + cap for the `streamAudioBands` respawn storm.
- **M18** de-duplicate `watchProcStats` — one shared subscription (fan-out) between trigger engine (`:439`) and HUD renderer (`:1152`). (`proc-source.ts:183` already returns a disposer — supports fan-out.)
- **L25** SIGTERM → SIGKILL escalation in `audio-eq.ts:215` (moved here for single-owner).

**AMENDMENTS (burn-unit WARN):**
- **Preserve the two-owner split:** `audioOwnerWs` and `hudOwnerWs` stay **strictly independent**. Closing an **audio-viz** socket must **not** stop HUD hardware audio. Per CLAUDE.md, audio-viz gates on `hudHardwareActive`, not streaming. **Add a test:** closing an audio-viz socket while a HUD audio widget is active leaves the HUD's `pw-record` running.
- **M16 must not strand a recoverable device:** **reset the backoff counter to 0 the moment `gotData` flips true** (`:520`); only escalate on *consecutive* zero-data cycles, so a routine sink switch still recovers in ~2s.

Tests: backoff/spawn-count over fake time (resets on data); single-poll fan-out; ffmpeg-exit-255 respawn; owner-close cleanup (no orphan `pw-record`); HUD-audio-survives-viz-close.
Manual smoke: start HUD audio viz, close tab (`pw-record` + matrix go idle); switch sink / unplug DAC during audio-EQ (recovers in a few seconds); no audio device (no CPU/fd creep over minutes); data-widget HUD (only one proc poller).

---

## Phase 6 — `fix(deck): panel reconnect, decode bounds, and defensive cleanups` (M17, M19, M20, L22, L23, L24, L26)
Files: `deck/web/components/{HudPanel,AudioPanel,CastVisualizerPanel,LifePanel}.tsx`, `deck/web/preview.ts` (L23), `deck/server.ts` (M19, L22), `lib/vm-source.ts` (M20), `lib/dbus-notifications.ts` (L24), `lib/animation.ts` (L26), + `vm-source.test.ts`, `animation.test.ts`, `server.test.ts`. **After Phase 2** (and after Phase 5). *(L25 moved to Phase 5.)*

- **M17** bounded-backoff reconnect in the four panels — **author together with L23** using the same backoff so reconnect does not create the storm the audit notes is currently absent.
- **M19** cap `sharp` GIF `pages` + set `limitInputPixels` before decode.
- **M20** `vm-source.ts:13` → `proc.stdout?.on` with `'error'` attached first.
- **L22** deck `openAudioStream` guard `!destroyed` → `writable` (`:1997`).
- **L23** remove `preview.ts` premature 5-attempt give-up; bounded exponential backoff with max interval.
- **L24** ENOENT short-circuit for `dbus-monitor` respawn.
- **L26** consecutive-failure ceiling in `runAnimation` (`animation.ts:42-56`).

Tests: `vm-source.test.ts` missing-stdio mock; `animation.test.ts` failure-ceiling; `server.test.ts` GIF page cap; panel reconnect via mock-WS harness (assert bounded backoff, no storm against a down daemon).
Manual smoke: open all four panels, restart deck (reconnect within backoff); tab open hours (no memory growth, still live); large multi-page GIF (rejected/clamped); notification with `dbus-monitor` absent (no respawn spam).

---

## burn-unit verdict log (AMEND)
- **[BLOCK→folded] P1 eviction races in-flight write** → idempotent `dead` flag; never delete `state` while `writing`.
- **[BLOCK→folded] P1 pollModules flap storm** → hysteresis/debounce + flap test.
- **[WARN→folded] P4 IPC cap truncates valid hook/large frame** → high cap + genuine-garbage-only destroy.
- **[WARN→folded] P5 ownership must preserve two-owner split** → independent owners + HUD-survives-viz-close test.
- **[WARN→folded] P5 M16 backoff strands recoverable device** → reset on `gotData`.
- **[WARN→OPEN] P3 H5 recovery vs calibration SSoT** → user decision pending (above).
- **[WARN→folded] P1 serialport mock seam asserted not verified** → verify/introduce seam first; async `'error'`.
- **[INFO→folded] C1/H11 success criteria** → assert no `uncaughtException`, not just counts.
- **[INFO] P1→P5 sequencing is real** → keep serialized, do not parallelize.
