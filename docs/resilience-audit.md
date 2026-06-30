# Resilience Audit — crash & leak risk register

**Date:** 2026-06-24
**Scope:** daemon (`src/daemon`, `src/lib`, `src/animations`) and deck server + web app (`src/deck`).
**Method:** five parallel read-only audits, each with a dedicated crash surface (unhandled `'error'` events; external-binary failures; serial/hardware disconnect; deck/browser lifecycle; long-uptime leaks + config/reload robustness).
**Trigger for the audit:** the fixed daemon crash `ERR_STREAM_WRITE_AFTER_END` (commit `47d2e80`) — an `audio-bands` write to a half-closed IPC socket guarded only by `socket.destroyed`, whose unhandled `'error'` became an `uncaughtException`.

## Dominant theme

Most findings are **one failure family**: an EventEmitter/stream emits `'error'` (or a write lands after close) with no durable listener → Node rethrows as `uncaughtException` → the process dies. That is exactly the bug already fixed on the IPC socket. The same class is **unpatched in three other places**, and the **deck process has none of the daemon's hardening**. Two separate clusters: long-uptime resource leaks, and a power-cycle startup brick.

## Status legend

`OPEN` not started · `WIP` in progress · `FIXED` merged · `WONTFIX` deliberately deferred

---

## 🔴 Critical — process-down in normal use

| # | Status | Title | Location | Trigger → Mechanism | Fix direction |
|---|--------|-------|----------|---------------------|---------------|
| C1 | FIXED | SerialPort has no `'error'` listener | `lib/transport.ts:95-100` + store sites (`:163`, `:215-217`) | Module yanked mid-frame / power-cycle surfaces async EIO on the fd; zero listeners → `uncaughtException` kills daemon. Sibling of the shipped fix. `try/catch` around writes does **not** catch out-of-band stream errors. | Attach persistent `port.on('error', …)` in `openPort` that logs + evicts the port. |
| C2 | FIXED | Deck server has no `uncaughtException`/`unhandledRejection` handler | `cli/index.ts:709-726`, `deck/server.ts:737` | Any unhandled deck-side fault terminates the whole process (HTTP+WS+Twitch+proc-stats). Multiplier for H4, H12, C3. | Register process-level handlers in `cmdDeck` mirroring the daemon. |
| C3 | FIXED | WS connection lacks `ws.on('error')` + ungated deferred `ws.send()` | `deck/server.ts:1902`; sends `2094-2169` | Tab closes mid-`await`; send-after-close emits unhandled `'error'` → with C2, deck down. Most likely deck crash on early disconnect. | Add `ws.on('error', …)` per connection; gate every deferred send on `ws.readyState === 1`. |

---

## 🟠 High — process-down under plausible conditions, permanent wedge, or OOM/brick

| # | Status | Title | Location | Trigger → Mechanism | Fix direction |
|---|--------|-------|----------|---------------------|---------------|
| H4 | FIXED | Browser-opener `spawn` has no `'error'` listener | `cli/index.ts:720` | Headless/minimal host missing `xdg-open` → ENOENT `'error'` unhandled → deck crashes at startup (with C2). | `child.on('error', () => {})` before `unref()`. |
| H5 | FIXED | Power-loss config corruption bricks startup | `lib/config.ts:342-359`; non-atomic writes `:364`, `:405` | Truncated `config.json` (interrupted write) throws `ConfigError` (not `ENOENT`) → `process.exit(1)`; won't restart until manual repair. Non-atomic bootstrap can create the corrupt file. | On `ConfigError` at startup back up + re-bootstrap / fall back to `DEFAULT_CONFIG`; make bootstrap writes use `writeJsonAtomic`. |
| H6 | FIXED | Unbounded IPC read buffer | `daemon/index.ts:1207-1234` | `buf += chunk` only drains on recognized HTTP/JSON frames; non-framed/newline-less input grows `buf` for the connection's life → eventual OOM. | Cap `buf`; destroy the socket past a small threshold without a recognized frame. |
| H7 | FIXED | SIGHUP `onReload` body is unguarded | `daemon/index.ts:1702-1720` | Config *loader* fails safe, but reload work (brightness/EC/HUD restart) runs outside try/catch; a throw is uncaught. Routine trigger: deck writes config → reload. | Wrap entire `onReload` body in try/catch, log-and-survive. |
| H8 | FIXED | Dead serial port never evicted from `ports` Map | `lib/transport.ts:210-226` (evict only `:255`) | After any write failure the broken port stays cached; module never recovers even after replug — transient unplug becomes a permanent wedge. | On write rejection / `'error'`, `closePort` + `ports.delete()` so next `getPort` re-opens. |
| H9 | FIXED | `pollModules` reconnect leaks animation loops + never releases stale port | `daemon/index.ts:164-176` | Available→unavailable edge does no `release`; reconnect reuses the dead port and discards the new `runAnimation` disposer → orphaned loops accumulate over replug cycles. | On disconnect edge `await transport.release(dev)`; drive reconnect through the normal resting-state path. |
| H10 | FIXED | Orphaned daemon audio/HUD hardware on abrupt disconnect | `deck/server.ts:1914-1921` vs `1986/1991` | Last-writer-wins `audioOwnerWs`/`hudOwnerWs` + retry landing `audio-hardware-start` *after* socket close → live `pw-record` + serial animation runs forever with no browser. | Track ownership per-socket; cancel pending retry + stop hardware unconditionally on owning socket close. |
| H11 | FIXED | Write-after-release race in serial live path | `lib/transport.ts:175-192` vs `250-262` | `release()`/`close()` drain only the enqueue queue, not the live-write machinery → live write hits a just-closed port (escalates to Critical with C1). | Drain/cancel `live` state in `release()`/`close()`; guard `runLive` write against a removed port. |
| H12 | FIXED | Unguarded async route reject kills the deck | `deck/server.ts` top-level `createServer` cb; e.g. `fs.mkdir` `:1585-1587` | Unwritable/full library dir on a routine asset request → unhandledRejection → with C2, deck down for all clients. | Wrap the whole `createServer` async body in try/catch emitting 500. |

---

## 🟡 Medium — degraded behavior, UX freeze, or slow leak

| # | Status | Title | Location | Trigger → Mechanism | Fix direction |
|---|--------|-------|----------|---------------------|---------------|
| M13 | FIXED | Daemon fatal handlers use `process.once` | `daemon/index.ts:1812-1813` | A second fault during cleanup has no listener → abrupt abort before cleanup finishes. | Use `process.on(...)` + the existing `exiting` flag to dedupe. |
| M14 | FIXED | `claudeRenderers` `onEvent` unguarded in socket `'data'` handler | `daemon/index.ts:1215-1222` | A throwing renderer crashes the daemon; the socket `'error'` listener does not catch throws from a `'data'` handler. | Wrap the `onEvent` dispatch (and the `'data'` body) in try/catch. |
| M15 | FIXED | Hardware audio-EQ mode has no respawn | `daemon/index.ts:340-368` | pipewire restart / sink switch / unplug → ffmpeg exits 255 → matrix freezes until manual re-trigger (the `streamAudioBands` path recovers; this one doesn't). | Wrap loop in the same respawn-with-backoff `streamAudioBands` uses, or share it. |
| M16 | FIXED | `streamAudioBands` subprocess storm | `daemon/index.ts:492-538` | Audio device permanently gone → respawn every ~2s, no backoff/cap → fd/CPU churn over long uptime. | Exponential backoff with cap after N consecutive no-data cycles. |
| M17 | FIXED | Panels never reconnect (HUD/Audio/Cast/Life) | `HudPanel.tsx:135`, `AudioPanel.tsx:96`, `CastVisualizerPanel.tsx:109`, `LifePanel.tsx:95` | After server/daemon restart a long-open tab goes silently dead with no recovery signal. (Corollary: also why there is no reconnect storm.) | Bounded-backoff reconnect in each panel's WS effect, mirroring `preview.ts`. |
| M18 | FIXED | Duplicate `watchProcStats` interval | `daemon/index.ts:439-444` vs `1152` | Data-widget HUD doubles `/proc`+battery+GPU reads every 500ms indefinitely. | Share one `watchProcStats` subscription (fan-out) between trigger engine and HUD renderer. |
| M19 | FIXED | `sharp` GIF decode unbounded in frame count | `deck/server.ts:325-356`, `498-551` | Crafted many-page GIF within body cap → memory/CPU pressure / OOM vector on the single deck process. | Cap `pages`; set `sharp` `limitInputPixels`/`pages` before decode. |
| M20 | FIXED | `vm-source.ts` unguarded `proc.stdout.on` | `lib/vm-source.ts:13` | Only spawn site missing the `?.` guard (cf. `mic-source.ts:11`); currently contained by an outer try/catch, so latent. | Use `proc.stdout?.on(...)`; attach `'error'` before touching stdio. |
| M21 | FIXED | Suspend/resume frame-burst | `daemon/index.ts:250`, `:283` (and watchdogs) | Long suspend makes `Date.now()` jump → `nextAt` pacing runs flat-out catching up; watchdogs fire immediately on resume. | Clamp catch-up: `nextAt = Math.max(nextAt, Date.now())` / cap negative wait. |

---

## 🟢 Low — edge cases / defense-in-depth

| # | Status | Title | Location | Note |
|---|--------|-------|----------|------|
| L22 | FIXED | Deck `openAudioStream` guards `!destroyed` not `writable` | `deck/server.ts:1997` | Same anti-pattern as the original bug; currently covered by `sock.on('error')` at `:1850`. |
| L23 | FIXED | `preview.ts` gives up after 5 reconnect attempts | `deck/web/preview.ts:12-37` | Premature give-up (counter only resets on success), not a storm. |
| L24 | FIXED | `dbus-monitor` respawns every 5s forever if binary missing | `lib/dbus-notifications.ts:97-105` | ENOENT short-circuit would stop eternal retries. |
| L25 | FIXED | `streamAudioBands` kills ffmpeg with SIGTERM only | `animations/audio-eq.ts:215` | No SIGKILL escalation → slow process leak if ffmpeg wedges on a stuck pulse connection. |
| L26 | FIXED | `runAnimation` has no failure ceiling | `lib/animation.ts:42-56` | A permanently-failing animation issues doomed writes forever (not a crash). |
| L27 | FIXED | `BinaryTransport` open→write→close swallows post-open port `'error'` | `lib/transport.ts` `openPort` | Pre-existing; if a `serialport` binding emits `'error'` instead of failing the drain callback, `frameBw`/`frameGray` could hang (not crash). Surfaced during Phase 1 review. |
| L28 | FIXED | Hot-plug maps leak entries for devices removed from config at runtime | `daemon/index.ts` pollModules (`reconnectGreeting`/`devicePending`/`deviceAvailable`) | Bounded by module count (2); a removed device's greeting disposer is never called, so its animation loop runs to natural completion. Surfaced during Phase 1 review. |
| L29 | FIXED | Deck `console.error` calls leak fs paths / yt-dlp stderr to the journal | `deck/server.ts:959,975,1037` | Pre-existing; now more visible since the H12 wrapper keeps the process alive instead of crashing. Operator stderr only, not HTTP clients. Surfaced during Phase 2 review. |

---

## Changelog

- **2026-06-24 — Phase 1 (serial lifecycle) landed.** C1, H8, H9, H11 → FIXED. Commit `f1bb234`, merged to `main` as `0298ed7`. Reviewed by murderbot/watson/10x-js (release() spin-wait deadline, `clearPortMaps`, `LiveState`, `DISCONNECT_CODES` tightened, test de-flake all folded in). New low findings L27, L28 recorded above. Tests: `src/lib/hotplug.test.ts`, `src/lib/transport.test.ts` (EventEmitter mock). **Hardware smoke: PASSED** (unplug/replug/flap, all four checks).
- **2026-06-24 — Phase 2 (deck hardening) landed.** C2, C3, H4, H12 → FIXED. Commit `a098785`, merged to `main` as `38350b3`. Reviewed by murderbot/watson/10x-js (security clean — no client-facing info leak; double-registration guard, `safeSend` consolidation, `res.destroy()` on half-written body, broadcaster comment all folded in). New low finding L29 recorded. **Deliberate decision:** the deck `uncaughtException` handler logs-and-survives (does not exit) — the deck has no supervisor to restart it, and staying up for other clients beats clean-exit; a future fatal-error escalation (exit on repeated faults) is possible but not warranted for a localhost server. Tests: `src/deck/server.test.ts` (WS disconnect + route-reject→500 against the real server), `src/cli/deck-launch.test.ts`.
- **2026-06-24 — Wave B landed (Phases 3 + 4).** Phase 3 (config power-cycle) H5, H7 → FIXED, commit `22ad041`, merged `073d0a1`; new low finding L29… (config). Phase 4 (daemon robustness) H6, M13, M14, M21 → FIXED, commit `f1b050b`, merged `38350b3`'s successor. Reviewed by murderbot/watson/10x-js. Phase 3 hardening: unique-per-writer temp in `writeJsonAtomic` (no concurrent clobber), `0o700` config dir, non-clobbering timestamped `.bak`. Phase 4 hardening: `server.maxConnections=32` (aggregate-OOM bound), M14 catch replies `{ok:false}` so callers don't hang, post-destroy re-entry guard, `nextFrameAnchor` extracted to `animation.ts`. Untested-by-mock paths (H7 reload-throw, M14 command-throw) covered by defense-in-depth + manual smoke. **Wave B done — all 3 Critical FIXED; High 8/9 FIXED (only H10 remains, scheduled in Wave C). Remaining: H10 + all Medium/Low (Waves C, D).**
- **2026-06-29 — Wave C landed (Phase 5, audio/HUD resilience).** H10, M15, M16, M18, L25 → FIXED. Commit `6efd18a`, merged to `main` as `bdf5219`. Reviewed by murderbot/watson/10x-js. H10: deck bumps `retryGen` on audio-owner socket close / `audio-viz-stop`, cancelling an in-flight `audio-hardware-start` retry so it can't land post-close and orphan a `pw-record` + serial animation; the `audioOwnerWs`/`hudOwnerWs` two-owner split stays strictly independent (CLAUDE.md audio-viz gate). M15/M16: `runAudioEqOnModules` and `streamAudioBands` respawn with exponential backoff (new pure `lib/backoff.ts`, base 2s, cap 30s) that resets the instant data arrives and escalates only on *consecutive* dead spawns — a routine sink switch recovers at base. M18: new generic `lib/fanout.ts` shares one `watchProcStats` poll across the trigger engine and HUD data widget, running at the finest active interval (2s baseline, 500ms only while a data widget is shown). L25: SIGTERM→SIGKILL escalation when stopping the ffmpeg capture. Review fixes folded in: idempotent `stop()` (no orphaned SIGKILL timer on double-stop), unref'd backoff sleep timers, fanout snapshots subscribers before emit + rolls back on `start()` throw + boxed `latest` sentinel. Also corrected a stale register cell: **H5 was marked OPEN but landed FIXED in Wave B** (commit `22ad041`). Tests: `lib/backoff.test.ts`, `lib/fanout.test.ts`, `animations/audio-eq.test.ts` (SIGKILL escalation), `deck/server.test.ts` (H10 retry-cancel via a fake daemon socket — verified to fail without the fix). Daemon-internal respawn wiring (M15/M16 actually re-spawning) is covered by the pure backoff unit + manual smoke, not a full ffmpeg integration test. **Wave C done — all 3 Critical + all 9 High FIXED; Medium 6/9, Low 1/8. Remaining (10, all Wave D / Phase 6): M17, M19, M20, L22, L23, L24, L26, L27, L28, L29.**
- **2026-06-29 — Wave D landed (Phase 6, deck UX + decode bounds + defensive cleanups).** M17, M19, M20, L22, L23, L24, L26, L27, L28, L29 → FIXED. Commit `260ec88`, merged to `main` as `4e3f3fb`. Reviewed by murderbot/watson/10x-js (security clean). M17/L23: new `deck/web/reconnect.ts` — a self-healing WebSocket with bounded exponential backoff (`reconnectDelay`, base 500ms → cap 10s, never gives up) plus `createReconnectingSocket`; `preview.ts` (which previously gave up after 5 tries) and all four panels (Hud/Audio/Cast/Life) retrofitted onto it. M19: animated-GIF decode bounded — `convertGifToDmx` passes `pages` (≤240) and `limitInputPixels` (100M) to sharp so a crafted many-frame/huge-canvas GIF can't OOM the deck before the cap applies; the inline server.ts GIF path now reuses the hardened converter (dedup, pixel-identical output). M20: `vm-source` optional-chains stdio + attaches `'error'` first. L22: audio-stream write guarded on `writable`, not `!destroyed`. L24: `dbus-monitor` stops respawning on ENOENT. L26: `runAnimation` consecutive-failure ceiling (default 600). L27: `writePort` races the write/drain callbacks against a one-shot port `'error'` so an out-of-band error can't hang it. L28: `pollModules` prunes hot-plug state + releases the port for devices removed from config at runtime. L29: youtube-stream logs `err.message` (no path/stack to the journal); the SSRF host-check log is deliberately retained. Review fixes folded in: `dispose()` removes the message listener before close (no stale-message work on unmounted panels), the save-debounce timer is cancelled on a reconnect-gap unmount (Hud/Life), and `onMessage` is typed `(e: Event) => void` to drop the lossy cast. Tests: `deck/web/reconnect.test.ts` (helper backoff/dispose), plus `lib/{animation,transport,vm-source,dbus-notifications}.test.ts` cases for L26/L27/M20/L24. M19/L28 (and the 4-panel wiring) covered by typecheck + review + manual smoke. **Wave D done — register CLOSED: all 29 findings FIXED, 0 OPEN.**
- **2026-06-29 — Final closure review (whole merged campaign `e34e0a6..main`).** A 3-agent pass (murderbot/watson/10x-js) over the combined diff, targeting what per-phase reviews structurally couldn't see: cross-phase interactions and the fold-in fixes that were tested but not independently re-reviewed. **Cross-phase interactions all verified clean** (transport eviction × hotplug debounce × device-prune; audio respawn-backoff × SIGKILL escalation × H10 `retryGen` cancel; fanout; atomic-write naming; backup TOCTOU; SSRF anchor). **All fold-in fixes verified correct.** Two real issues found and fixed (commit `4774a37`, merged `a582594`): **[MEDIUM]** `runAudioEqOnModules`'s `void loop()` lacked a `.catch()` — the Wave C respawn loop multiplied failure points, so a renderer/import throw could become an `unhandledRejection` and shut the daemon down; now caught+logged like `streamAudioBands`. **[LOW]** the PNG/source image decode (`server.ts`, `image-convert.ts:convertImage`) lacked the `limitInputPixels` bound M19 added only to the GIF path; the shared `IMAGE_INPUT_PIXEL_LIMIT` (100M) is now applied at every untrusted decode. One **cosmetic** indent in the M14 data-handler wrap (`daemon/index.ts`) left as-is — re-indenting the whole handler would be pure-whitespace churn. **Campaign fully closed.**

---

## Verified safe (checked, not flagged)

- Every `spawn` found has a `proc.on('error', …)` handler.
- Bounded/correct: `notificationHistory` (cap 7/source, content sliced 512), `hudAudioListeners` (unsub on close), `Dispatcher` queue (60s GC + filter), `PersistentDaemonClient.queue` (latest-wins), `ytStreamErrors`/`pendingOAuthStates` (self-evicting/capped), `writeJsonAtomic` (atomic), SIGHUP config *loader* (keeps prior config on parse failure), `firedBatteryThresholds`/`deviceAvailable`/`ifaceState`/`vmState` (fixed small domains).

## Suggested resolution order

1. **Serial lifecycle cluster** — C1 + H8 + H9 + H11 (same root as the shipped fix; highest hardware-crash exposure; fixing C1 is the natural home for H8 and downgrades H11).
2. **Deck hardening trio** — C2 + C3 + H4 + H12 (C2 first; it gates the blast radius of the others).
3. **Power-cycle pair** — H5 + H7.
4. **Remaining daemon robustness** — H6, M13, M14, M21.
5. **Audio/HUD resilience** — H10, M15, M16, M18. ✅ done (Wave C, `bdf5219`)
6. **Deck UX recovery + bounds** — M17, M19, M20, L22, L23, L24, L26 (+ review-surfaced L27, L28, L29). ✅ done (Wave D, `4e3f3fb`)

---

**All 6 phases complete — register CLOSED: 29/29 FIXED, 0 OPEN (2026-06-29).**
