import { createZenRenderer, ZEN_STYLE_VALUES } from '../../animations/zen-renderers.js';
import type { ZenStyle } from '../../animations/zen-renderers.js';
import type { HudWidget } from '../../deck/web/types/hud-preset.js';
import { zenBase } from '../../lib/widgets/zen.js';
import type { ZenWidget } from '../../lib/widgets/zen.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer } from './types.js';

export const zenDaemonDescriptor: DaemonWidgetDescriptor<ZenWidget> = {
  ...zenBase,

  createRenderer(widget, ctx): WidgetRenderer {
    const { zenSide } = ctx;
    const style = (widget.style as ZenStyle | undefined) ?? 'waves';
    const r = createZenRenderer(style, zenSide);
    return {
      render(_now, _audioCtx) { return r.render(); },
      stop() { r.stop(); },
    };
  },

  extractParams(m, side, _config): ZenWidget | null {
    const styleStr = side === 'left' ? m.leftZenStyle : m.rightZenStyle;
    const validStyle = ZEN_STYLE_VALUES.includes(styleStr as ZenStyle);
    return { widget: 'zen', ...(validStyle ? { style: styleStr as ZenStyle } : {}) };
  },

  canSpan(left: ZenWidget, right: HudWidget): boolean {
    return right.widget === 'zen' && (left.style ?? 'waves') === (right.style ?? 'waves');
  },
};
