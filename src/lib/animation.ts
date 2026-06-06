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
// Returns a disposer that stops the animation. The disposer resolves once the
// loop has fully exited — so once it settles, no further frame can be enqueued
// (callers needing to write a final frame can await it). It is also usable as a
// plain `() => void` when the awaitable isn't needed.
export function runAnimation(anim: Animation, opts: RunOptions, onNaturalComplete?: () => void): () => Promise<void> {
  const { transport, devicePath, mode = 'bw', fps = 30 } = opts;
  const frameMs = 1000 / fps;
  let stopped = false;

  const iter = anim[Symbol.asyncIterator]();

  const loop = async () => {
    let nextAt = Date.now();
    let natural = false;

    while (!stopped) {
      const result = await iter.next();
      if (stopped) break;
      if (result.done) { natural = true; break; }

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

    // Ports are never released between animations — only transport.close() at
    // shutdown releases them. Releasing here causes DTR de-assertion, which
    // resets the module display and triggers a pollModules reconnect cycle.
    if (natural) {
      try { onNaturalComplete?.(); } catch (e) {
        process.stderr.write(`dark-matrix: runAnimation onNaturalComplete error: ${String(e)}\n`);
      }
    }
  };

  // `done` always resolves (never rejects) once the loop has settled, so
  // ignoring the disposer's return value can't surface an unhandled rejection.
  let settle: () => void;
  const done = new Promise<void>(r => { settle = r; });
  void loop().catch(() => {}).finally(() => settle());

  return () => {
    stopped = true;
    anim.stop();
    return done;
  };
}
