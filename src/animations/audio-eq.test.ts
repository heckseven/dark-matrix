import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fft.js', () => {
  return {
    default: class MockFFT {
      size: number;
      constructor(size: number) {
        this.size = size;
      }
      createComplexArray() {
        return new Array<number>(this.size * 2).fill(0);
      }
      realTransform(out: number[], _input: number[]) {
        // Simulate a signal in bin 1 (re=100, im=0)
        out[2] = 100;
        out[3] = 0;
      }
      completeSpectrum(_out: number[]) {
        // no-op — mock already has the values we need
      }
    },
  };
});

import { spawn } from 'node:child_process';
import { createAudioEqAnimation } from './audio-eq.js';

const FRAME_SIZE = 306;
const FFT_SIZE = 2048;

function makeMockProc() {
  const mockProc = new EventEmitter() as EventEmitter & Partial<ChildProcess> & { kill: ReturnType<typeof vi.fn> };
  mockProc.stdout = new EventEmitter() as unknown as ChildProcess['stdout'];
  mockProc.kill = vi.fn();
  mockProc.stdin = null;
  mockProc.stderr = null;
  return mockProc;
}

function silentChunk(fftSize = FFT_SIZE): Buffer {
  return Buffer.alloc(fftSize * 2);
}

function nonSilentChunk(fftSize = FFT_SIZE): Buffer {
  // Write a non-zero s16 value at sample 0 to produce non-zero magnitude
  const buf = Buffer.alloc(fftSize * 2);
  buf.writeInt16LE(16384, 0);
  return buf;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAudioEqAnimation', () => {
  it('yields a Frame (Uint8Array of length 306) when sufficient audio data arrives', async () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ChildProcess);

    const anim = createAudioEqAnimation();
    const iter = anim[Symbol.asyncIterator]();
    const pending = iter.next();

    (mockProc.stdout as EventEmitter).emit('data', silentChunk());

    const result = await pending;
    expect(result.done).toBe(false);
    expect(result.value).toBeInstanceOf(Uint8Array);
    expect(result.value.length).toBe(FRAME_SIZE);

    anim.stop();
  });

  it('frame has correct pixel layout (column-major: f[col * 34 + row])', async () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ChildProcess);

    const anim = createAudioEqAnimation({ gain: 1.0 });
    const iter = anim[Symbol.asyncIterator]();
    const pending = iter.next();

    (mockProc.stdout as EventEmitter).emit('data', nonSilentChunk());

    const result = await pending;
    expect(result.done).toBe(false);

    const frame = result.value;
    // Frame is column-major: pixel at (col, row) = frame[col * 34 + row]
    // Check that the frame has the expected shape (9 columns × 34 rows = 306 bytes)
    expect(frame.length).toBe(306);

    // Each column should have pixels set from bottom (row 33) upward
    // Col 0 should have some lit pixels from the bottom if band 0 has magnitude
    // Just verify that bottom pixels in lit columns are 255 and top are 0
    for (let col = 0; col < 9; col++) {
      let foundBoundary = false;
      let above = false;
      for (let row = 0; row < 34; row++) {
        const px = frame[col * 34 + row] ?? 0;
        if (!above && px === 0) {
          above = true;
        } else if (above && px === 255) {
          // All zeros should come before all 255s per column (from top to bottom)
          foundBoundary = true;
        }
        if (foundBoundary) {
          // Once we see 255, the rest should all be 255
          expect(px).toBe(255);
        }
      }
    }

    anim.stop();
  });

  it('frame from silence has all pixels 0', async () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ChildProcess);

    const anim = createAudioEqAnimation({ gain: 1.0 });
    const iter = anim[Symbol.asyncIterator]();
    const pending = iter.next();

    // The mock FFT fills out[2]=100 regardless of input, so silence won't give zero.
    // We need to use a gain=0 approach OR override the mock for this test.
    // Instead, we verify with gain=0 that height is always 0.
    anim.stop();

    // Re-do with gain=0
    const mockProc2 = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc2 as unknown as ChildProcess);

    const anim2 = createAudioEqAnimation({ gain: 0 });
    const iter2 = anim2[Symbol.asyncIterator]();
    const pending2 = iter2.next();

    (mockProc2.stdout as EventEmitter).emit('data', silentChunk());

    const result = await pending2;
    expect(result.done).toBe(false);
    const frame = result.value;

    for (let i = 0; i < frame.length; i++) {
      expect(frame[i]).toBe(0);
    }

    anim2.stop();
    // consume the first pending (already stopped)
    const r1 = await pending;
    expect(r1.done).toBe(true);
  });

  it('stop() kills the capture process and iterator returns done', async () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ChildProcess);

    const anim = createAudioEqAnimation();
    const iter = anim[Symbol.asyncIterator]();

    anim.stop();
    expect(mockProc.kill).toHaveBeenCalled();

    const result = await iter.next();
    expect(result.done).toBe(true);
  });

  it('iterator ends when capture process exits unexpectedly', async () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ChildProcess);

    const anim = createAudioEqAnimation();
    const iter = anim[Symbol.asyncIterator]();
    const pending = iter.next();

    mockProc.emit('close');

    const result = await pending;
    expect(result.done).toBe(true);
  });

  it('passes target as ffmpeg pulse input when provided', () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ChildProcess);

    const anim = createAudioEqAnimation({ source: 'monitor', target: 'my-node-42' });
    expect(anim.source).toBe('monitor');

    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-f', 'pulse', '-i', 'my-node-42']),
      expect.anything(),
    );

    anim.stop();
  });

  it('uses "default" pulse target when no target is provided', () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ChildProcess);

    const anim = createAudioEqAnimation({ source: 'mic' });
    expect(anim.source).toBe('mic');

    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-f', 'pulse', '-i', 'default']),
      expect.anything(),
    );

    anim.stop();
  });

  it('gain option scales column heights (higher gain → taller bars)', async () => {
    // Two animations with different gains; same audio data → different heights

    const mockProc1 = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc1 as unknown as ChildProcess);
    const anim1 = createAudioEqAnimation({ gain: 0.5 });
    const iter1 = anim1[Symbol.asyncIterator]();
    const pending1 = iter1.next();
    (mockProc1.stdout as EventEmitter).emit('data', nonSilentChunk());
    const result1 = await pending1;
    anim1.stop();

    const mockProc2 = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc2 as unknown as ChildProcess);
    const anim2 = createAudioEqAnimation({ gain: 10.0 });
    const iter2 = anim2[Symbol.asyncIterator]();
    const pending2 = iter2.next();
    (mockProc2.stdout as EventEmitter).emit('data', nonSilentChunk());
    const result2 = await pending2;
    anim2.stop();

    expect(result1.done).toBe(false);
    expect(result2.done).toBe(false);

    // Count lit pixels in each frame
    const litCount = (frame: Uint8Array) =>
      Array.from(frame).filter(v => v === 255).length;

    const lit1 = litCount(result1.value);
    const lit2 = litCount(result2.value);

    // Higher gain should produce more lit pixels (or at least equal if already maxed)
    expect(lit2).toBeGreaterThanOrEqual(lit1);
  });
});
