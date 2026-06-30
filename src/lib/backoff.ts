// Exponential backoff for respawning an audio capture that keeps dying.
//
// The counter is the number of *consecutive* spawns that produced no data. It
// must be reset to 0 the moment a spawn yields data, so a routine sink switch
// (which produces data within ~2s) always recovers at the base delay and only a
// permanently-absent device escalates. `failures === 0` (just got data) and
// `failures === 1` (the first dry cycle) both return the base delay; escalation
// begins on the second consecutive dry cycle and is capped.
export const AUDIO_RESPAWN_BASE_MS = 2000;
export const AUDIO_RESPAWN_MAX_MS = 30_000;

export function nextAudioBackoff(
  consecutiveFailures: number,
  baseMs = AUDIO_RESPAWN_BASE_MS,
  maxMs = AUDIO_RESPAWN_MAX_MS,
): number {
  const exp = Math.max(0, consecutiveFailures - 1);
  const ms = baseMs * 2 ** exp;
  return Math.min(ms, maxMs);
}
