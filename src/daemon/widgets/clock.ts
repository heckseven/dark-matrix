import { CLOCK_FACES, createClockRenderer } from '../../animations/clock-renderers.js';
import type { ClockFace } from '../../animations/clock-renderers.js';
import type { HudWidget } from '../../deck/web/types/hud-preset.js';
import { clockBase } from '../../lib/widgets/clock.js';
import type { ClockWidget } from '../../lib/widgets/clock.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer } from './types.js';
import type { Config } from '../../lib/config.js';
import type { HudConfigMessage } from './types.js';

const CLOCK_FACE_SET = new Set(CLOCK_FACES.map(f => f.id) as ClockFace[]);
function isClockFace(v: unknown): v is ClockFace {
  return typeof v === 'string' && CLOCK_FACE_SET.has(v as ClockFace);
}

export const clockDaemonDescriptor: DaemonWidgetDescriptor<ClockWidget> = {
  ...clockBase,

  createRenderer(widget, ctx): WidgetRenderer {
    const { side } = ctx;
    const face = widget.face ?? 'elegant';
    const clockRenderer = createClockRenderer(face);
    return {
      render(now, audioCtx) {
        const base = audioCtx ? { now, ...audioCtx } : { now };
        return clockRenderer({ ...base, side });
      },
      stop() { /* stateless */ },
    };
  },

  extractParams(m, side, _config): ClockWidget | null {
    const face = side === 'left' ? m.leftFace : m.rightFace;
    return { widget: 'clock', ...(isClockFace(face) ? { face } : {}) };
  },
};
