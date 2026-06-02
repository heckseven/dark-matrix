import {
  createTextRenderer,
  TEXT_STYLES,
  TEXT_SIZES,
  TEXT_SPEEDS,
  TEXT_FLICKERS,
  TEXT_TRANSITIONS,
} from '../../animations/text-renderers.js';
import { textBase } from '../../lib/widgets/text.js';
import type { TextWidget, TextStyle, TextSize, TextSpeed, TextFlicker, TextTransition } from '../../lib/widgets/text.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer, HudConfigMessage } from './types.js';
import type { Config } from '../../lib/config.js';

const asTextStyle = (v?: string): TextStyle | undefined =>
  v && (TEXT_STYLES as readonly string[]).includes(v) ? v as TextStyle : undefined;
const asTextSize = (v?: string): TextSize | undefined =>
  v && (TEXT_SIZES as readonly string[]).includes(v) ? v as TextSize : undefined;
const asTextSpeed = (v?: string): TextSpeed | undefined =>
  v && (TEXT_SPEEDS as readonly string[]).includes(v) ? v as TextSpeed : undefined;
const asTextFlicker = (v?: string): TextFlicker | undefined =>
  v && (TEXT_FLICKERS as readonly string[]).includes(v) ? v as TextFlicker : undefined;
const asTextTransition = (v?: string): TextTransition | undefined =>
  v && (TEXT_TRANSITIONS as readonly string[]).includes(v) ? v as TextTransition : undefined;

export const textDaemonDescriptor: DaemonWidgetDescriptor<TextWidget> = {
  ...textBase,

  createRenderer(widget: TextWidget, ctx: DaemonWidgetContext): WidgetRenderer {
    const side = ctx.side;
    const textRenderer = createTextRenderer(widget, side);
    return {
      render(now, _audioCtx) { return textRenderer.render(now); },
      stop() { textRenderer.stop(); },
    };
  },

  extractParams(m: HudConfigMessage, side: 'left' | 'right', _config: Config): TextWidget | null {
    const rawWidget = side === 'left' ? m.leftWidget : m.rightWidget;
    if (rawWidget !== 'text') return null;
    const text = side === 'left' ? m.leftText : m.rightText;
    if (typeof text !== 'string') return null;
    const rawStyle      = side === 'left' ? m.leftTextStyle      : m.rightTextStyle;
    const rawSize       = side === 'left' ? m.leftTextSize       : m.rightTextSize;
    const rawSpeed      = side === 'left' ? m.leftTextSpeed      : m.rightTextSpeed;
    const rawSpan       = side === 'left' ? m.leftTextSpan       : m.rightTextSpan;
    const rawFlicker    = side === 'left' ? m.leftTextFlicker    : m.rightTextFlicker;
    const rawTransition = side === 'left' ? m.leftTextTransition : m.rightTextTransition;
    const rawLoopDelay  = side === 'left' ? m.leftTextLoopDelayMs : m.rightTextLoopDelayMs;
    const style      = asTextStyle(rawStyle);
    const size       = asTextSize(rawSize);
    const speed      = asTextSpeed(rawSpeed);
    const flicker    = asTextFlicker(rawFlicker);
    const transition = asTextTransition(rawTransition);
    const span       = rawSpan === true ? true : undefined;
    const loopDelayMs =
      typeof rawLoopDelay === 'number' && Number.isFinite(rawLoopDelay) && rawLoopDelay > 0
        ? Math.min(60000, Math.floor(rawLoopDelay))
        : undefined;
    return {
      widget: 'text',
      text: text.slice(0, 128),
      ...(style      !== undefined ? { style }      : {}),
      ...(size       !== undefined ? { size }        : {}),
      ...(speed      !== undefined ? { speed }       : {}),
      ...(span       !== undefined ? { span }        : {}),
      ...(flicker    !== undefined ? { flicker }     : {}),
      ...(transition !== undefined ? { transition }  : {}),
      ...(loopDelayMs !== undefined ? { loopDelayMs } : {}),
    };
  },
};
