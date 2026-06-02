import {
  createHourglassTimerRenderer,
  createTwinzTimerRenderer,
  createElegantTimerRenderer,
} from '../../animations/timer-renderers.js';
import type { HudWidget } from '../../deck/web/types/hud-preset.js';
import { timerBase } from '../../lib/widgets/timer.js';
import type { TimerWidget, TimerStyle } from '../../lib/widgets/timer.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer, HudConfigMessage } from './types.js';
import type { Config } from '../../lib/config.js';

const TIMER_STYLES = new Set<TimerStyle>(['elegant', 'hourglass', 'twinz']);
void TIMER_STYLES; // referenced for completeness; validation uses inline ternary to match daemon pattern

export const timerDaemonDescriptor: DaemonWidgetDescriptor<TimerWidget> = {
  ...timerBase,

  createRenderer(widget: TimerWidget, ctx: DaemonWidgetContext): WidgetRenderer {
    const timerStyle  = widget.style ?? 'elegant';
    const durationMs  = widget.durationMs ?? 25 * 60_000;
    const repeat      = widget.repeat ?? false;
    const side        = ctx.side;
    const savedEpoch  = ctx.persistedTimerEpochs[side];
    let   epochMs: number;
    if (savedEpoch && savedEpoch.durationMs === durationMs && savedEpoch.repeat === repeat && savedEpoch.style === timerStyle) {
      epochMs = savedEpoch.epochMs;
    } else {
      epochMs = Date.now();
      ctx.persistedTimerEpochs[side] = { durationMs, repeat, style: timerStyle, epochMs };
    }
    const hgRenderer  = timerStyle === 'hourglass' ? createHourglassTimerRenderer() : null;
    const tzRenderer  = timerStyle === 'twinz'     ? createTwinzTimerRenderer()     : null;
    const elRenderer  = hgRenderer || tzRenderer   ? null                           : createElegantTimerRenderer();
    return {
      render(now, _audioCtx) {
        const elapsed     = now.getTime() - epochMs;
        const remainingMs = repeat
          ? Math.max(0, durationMs - (elapsed % durationMs))
          : Math.max(0, durationMs - elapsed);
        if (hgRenderer) return hgRenderer.render(remainingMs, durationMs);
        if (tzRenderer) return tzRenderer.render(remainingMs);
        return elRenderer!.render(remainingMs);
      },
      stop() { hgRenderer?.stop(); tzRenderer?.stop(); elRenderer?.stop(); },
    };
  },

  extractParams(m: HudConfigMessage, side: 'left' | 'right', _config: Config): TimerWidget | null {
    const rawWidget = side === 'left' ? m.leftWidget : m.rightWidget;
    if (rawWidget !== 'timer') return null;
    const rawStyle      = side === 'left' ? m.leftTimerStyle      : m.rightTimerStyle;
    const rawDurationMs = side === 'left' ? m.leftTimerDurationMs : m.rightTimerDurationMs;
    const rawRepeat     = side === 'left' ? m.leftTimerRepeat     : m.rightTimerRepeat;
    const style: TimerStyle = rawStyle === 'hourglass' ? 'hourglass' : rawStyle === 'twinz' ? 'twinz' : 'elegant';
    const durationMs = typeof rawDurationMs === 'number' && Number.isFinite(rawDurationMs) && rawDurationMs > 0 ? rawDurationMs : undefined;
    const repeat     = typeof rawRepeat === 'boolean' ? rawRepeat : undefined;
    return {
      widget: 'timer',
      style,
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(repeat     !== undefined ? { repeat }     : {}),
    };
  },
};
