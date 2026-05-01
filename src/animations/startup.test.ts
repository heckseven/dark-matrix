import { describe, it, expect } from 'vitest';
import { createStartupAnimation } from './startup.js';

async function collectFrames(anim: ReturnType<typeof createStartupAnimation>, max = 100) {
  const frames = [];
  for await (const f of anim) {
    frames.push(f);
    if (frames.length >= max) break;
  }
  return frames;
}

describe('startup wipe', () => {
  it('yields exactly 34 frames', async () => {
    const frames = await collectFrames(createStartupAnimation({ style: 'wipe' }));
    expect(frames).toHaveLength(34);
  });

  it('frame 5: cols 0-4 all 255, cols 5-8 all 0', async () => {
    const frames = await collectFrames(createStartupAnimation({ style: 'wipe' }));
    const f = frames[5]!;
    for (let col = 0; col < 5; col++) {
      for (let row = 0; row < 34; row++) {
        expect(f[col * 34 + row]).toBe(255);
      }
    }
    for (let col = 5; col < 9; col++) {
      for (let row = 0; row < 34; row++) {
        expect(f[col * 34 + row]).toBe(0);
      }
    }
  });

  it('default style is wipe', async () => {
    const anim = createStartupAnimation();
    expect(anim.style).toBe('wipe');
    const frames = await collectFrames(anim);
    expect(frames).toHaveLength(34);
  });
});

describe('startup rain', () => {
  it('yields exactly 34 frames', async () => {
    const frames = await collectFrames(createStartupAnimation({ style: 'rain' }));
    expect(frames).toHaveLength(34);
  });

  it('frame 10: rows 0-9 all 255, rows 10-33 all 0 for every column', async () => {
    const frames = await collectFrames(createStartupAnimation({ style: 'rain' }));
    const f = frames[10]!;
    for (let col = 0; col < 9; col++) {
      for (let row = 0; row < 10; row++) {
        expect(f[col * 34 + row]).toBe(255);
      }
      for (let row = 10; row < 34; row++) {
        expect(f[col * 34 + row]).toBe(0);
      }
    }
  });
});

describe('startup pulse', () => {
  it('yields exactly 30 frames', async () => {
    const frames = await collectFrames(createStartupAnimation({ style: 'pulse' }));
    expect(frames).toHaveLength(30);
  });

  it('frame 0: all pixels are 0 (sin(0) = 0)', async () => {
    const frames = await collectFrames(createStartupAnimation({ style: 'pulse' }));
    const f = frames[0]!;
    for (let i = 0; i < 306; i++) {
      expect(f[i]).toBe(0);
    }
  });

  it('frame 15: all pixels are 255 (sin(π/2) = 1)', async () => {
    const frames = await collectFrames(createStartupAnimation({ style: 'pulse' }));
    const f = frames[15]!;
    for (let i = 0; i < 306; i++) {
      expect(f[i]).toBe(255);
    }
  });
});

describe('stop()', () => {
  it('causes iterator to return done before sequence completes', async () => {
    const anim = createStartupAnimation({ style: 'wipe' });
    const iter = anim[Symbol.asyncIterator]();
    await iter.next(); // frame 0
    await iter.next(); // frame 1
    anim.stop();
    const result = await iter.next();
    expect(result.done).toBe(true);
  });

  it('iterator is exhausted after full sequence', async () => {
    const anim = createStartupAnimation({ style: 'wipe' });
    const iter = anim[Symbol.asyncIterator]();
    for (let i = 0; i < 34; i++) await iter.next();
    const result = await iter.next();
    expect(result.done).toBe(true);
  });
});
