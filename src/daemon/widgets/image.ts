import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { safeBuiltinPath } from '../../lib/builtins.js';
import { parseProject, base64ToFrame } from '../../deck/format.js';
import type { DmxProject } from '../../deck/format.js';
import { FRAME_COLS, FRAME_ROWS } from '../../lib/frame.js';
import type { Frame } from '../../lib/frame.js';
import { imageBase } from '../../lib/widgets/image.js';
import type { ImageWidget } from '../../lib/widgets/image.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer } from './types.js';
import type { Config } from '../../lib/config.js';
import type { HudConfigMessage } from './types.js';

const BUILTINS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deck/builtins');

export const imageDaemonDescriptor: DaemonWidgetDescriptor<ImageWidget> = {
  ...imageBase,

  createRenderer(widget, ctx): WidgetRenderer {
    const { side } = ctx;
    const libraryDir = path.join(os.homedir(), '.config', 'dark-matrix', 'library');
    const resolved = path.resolve(libraryDir, widget.file);
    if (!resolved.startsWith(libraryDir + path.sep)) {
      throw new Error(`invalid asset path: ${widget.file}`);
    }
    let project: DmxProject;
    try {
      // Prefer the user library; fall back to a bundled built-in of the
      // same name only when the user file is genuinely absent (built-ins
      // are never copied in). Any other read error propagates to the catch
      // below so it is logged rather than silently masked by the fallback.
      let raw: string;
      try {
        raw = readFileSync(resolved, 'utf-8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        const builtin = safeBuiltinPath(widget.file, BUILTINS_DIR);
        if (!builtin) throw e;
        raw = readFileSync(builtin, 'utf-8');
      }
      project = parseProject(raw);
    } catch (err) {
      console.error(`[image renderer] failed to load ${widget.file}:`, err);
      const empty = new Uint8Array(FRAME_COLS * FRAME_ROWS) as unknown as Frame;
      return { render: () => empty, stop() {} };
    }
    const width = project.width;
    const bytesPerFrame = width * FRAME_ROWS;
    const frames: Uint8Array[] = project.frames.map(f => base64ToFrame(f.pixels, bytesPerFrame));
    const speed = widget.speed ?? 1;
    const delays = project.frames.map(f => Math.round(f.delayMs / speed));
    const loop = widget.loop ?? project.loop;

    let frameIdx = 0;
    let elapsed = 0;
    let lastTick: number | null = null;

    return {
      render(now, _audioCtx) {
        const nowMs = now.getTime();
        if (lastTick !== null) elapsed += nowMs - lastTick;
        lastTick = nowMs;

        while (elapsed >= (delays[frameIdx] ?? 100)) {
          elapsed -= delays[frameIdx] ?? 100;
          if (frameIdx < frames.length - 1) {
            frameIdx++;
          } else if (loop) {
            frameIdx = 0;
          }
          // if !loop, stay on last frame
        }

        const raw = frames[frameIdx]!;

        if (width === 18) {
          const half = new Uint8Array(FRAME_COLS * FRAME_ROWS);
          const colOffset = side === 'left' ? 0 : FRAME_COLS;
          for (let col = 0; col < FRAME_COLS; col++) {
            for (let row = 0; row < FRAME_ROWS; row++) {
              half[col * FRAME_ROWS + row] = raw[(col + colOffset) * FRAME_ROWS + row] ?? 0;
            }
          }
          return half as unknown as Frame;
        }

        return raw as unknown as Frame;
      },
      stop() { /* nothing to clean up */ },
    };
  },

  extractParams(m, side, _config): ImageWidget | null {
    const file = side === 'left' ? m.leftFile : m.rightFile;
    if (typeof file !== 'string') return null;
    return { widget: 'image', file };
  },
};
