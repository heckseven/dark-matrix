import { describe, it, expect } from 'vitest';
import { nextAudioBackoff, AUDIO_RESPAWN_BASE_MS, AUDIO_RESPAWN_MAX_MS } from './backoff.js';

describe('nextAudioBackoff (M16)', () => {
  it('just got data (0) and the first dry cycle (1) both return the base delay', () => {
    // A routine sink switch produces data, so the next respawn is at base — a
    // single dry cycle must not yet escalate.
    expect(nextAudioBackoff(0)).toBe(AUDIO_RESPAWN_BASE_MS);
    expect(nextAudioBackoff(1)).toBe(AUDIO_RESPAWN_BASE_MS);
  });

  it('doubles on each consecutive dry cycle', () => {
    expect(nextAudioBackoff(2)).toBe(AUDIO_RESPAWN_BASE_MS * 2);
    expect(nextAudioBackoff(3)).toBe(AUDIO_RESPAWN_BASE_MS * 4);
    expect(nextAudioBackoff(4)).toBe(AUDIO_RESPAWN_BASE_MS * 8);
  });

  it('never exceeds the cap, no matter how many failures', () => {
    expect(nextAudioBackoff(100)).toBe(AUDIO_RESPAWN_MAX_MS);
    expect(nextAudioBackoff(1000)).toBe(AUDIO_RESPAWN_MAX_MS);
  });

  it('is monotonically non-decreasing in the failure count', () => {
    let prev = 0;
    for (let n = 0; n <= 50; n++) {
      const d = nextAudioBackoff(n);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('honors custom base/max overrides', () => {
    expect(nextAudioBackoff(3, 100, 1000)).toBe(400);
    expect(nextAudioBackoff(10, 100, 1000)).toBe(1000); // capped
  });
});
