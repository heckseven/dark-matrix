import { createFrame } from '../src/lib/frame.js';
import type { Frame } from '../src/lib/frame.js';
import type { Animation } from '../src/lib/animation.js';

export type StartupStyle = 'wipe' | 'rain' | 'pulse';

export type StartupOptions = {
  style?: StartupStyle;
  fps?: number;
};

export interface StartupAnimation extends Animation {
  readonly style: StartupStyle;
}

export function createStartupAnimation(opts?: StartupOptions): StartupAnimation {
  const style = opts?.style ?? 'wipe';
  let stopped = false;

  function buildWipeFrame(n: number): Frame {
    const f = createFrame();
    for (let col = 0; col < 9; col++) {
      const v = col < n ? 255 : 0;
      for (let row = 0; row < 34; row++) {
        f[col * 34 + row] = v;
      }
    }
    return f;
  }

  function buildRainFrame(n: number): Frame {
    const f = createFrame();
    for (let col = 0; col < 9; col++) {
      for (let row = 0; row < 34; row++) {
        f[col * 34 + row] = row < n ? 255 : 0;
      }
    }
    return f;
  }

  function buildPulseFrame(n: number): Frame {
    const v = Math.max(0, Math.min(255, Math.round(Math.sin((n / 30) * Math.PI) * 255)));
    const f = createFrame();
    f.fill(v);
    return f;
  }

  async function* generate(): AsyncGenerator<Frame> {
    const count = style === 'pulse' ? 30 : 34;
    for (let i = 0; i < count; i++) {
      if (stopped) return;
      if (style === 'wipe') yield buildWipeFrame(i);
      else if (style === 'rain') yield buildRainFrame(i);
      else yield buildPulseFrame(i);
    }
  }

  const iter = generate();

  return {
    style,
    [Symbol.asyncIterator]() {
      return iter;
    },
    stop() {
      stopped = true;
    },
  };
}
