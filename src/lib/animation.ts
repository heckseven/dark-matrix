import type { Frame } from './frame.js';
import type { MatrixTransport } from './transport.js';

export interface Animation {
  [Symbol.asyncIterator](): AsyncIterator<Frame>;
  stop(): void;
}

export type AnimationMode = 'bw' | 'gray';

export type RunOptions = {
  transport: MatrixTransport;
  devicePath: string;
  mode?: AnimationMode;
  fps?: number;
};

// Runs an animation, pulling frames from the async iterator and sending to
// transport at the target fps. Frame timing is wall-clock anchored (not
// chained) so late frames don't compound delay.
// Returns a disposer that stops the animation and releases the port.
export function runAnimation(anim: Animation, opts: RunOptions): () => void {
  const { transport, devicePath, mode = 'bw', fps = 30 } = opts;
  const frameMs = 1000 / fps;
  let stopped = false;

  const iter = anim[Symbol.asyncIterator]();

  const loop = async () => {
    let nextAt = Date.now();

    while (!stopped) {
      const result = await iter.next();
      if (result.done || stopped) break;

      const frame = result.value;
      try {
        if (mode === 'bw') {
          const { packBW } = await import('./frame.js');
          await transport.frameBw(packBW(frame), devicePath);
        } else {
          await transport.frameGray(frame, devicePath);
        }
      } catch {
        // transport errors are non-fatal — keep the loop alive
      }

      nextAt += frameMs;
      const wait = nextAt - Date.now();
      if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
    }

    await transport.release(devicePath);
  };

  void loop();

  return () => {
    stopped = true;
    anim.stop();
  };
}
