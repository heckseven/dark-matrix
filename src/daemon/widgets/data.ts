import { dataBase } from '../../lib/widgets/data.js';
import type { DataStyle, DataWidget } from '../../lib/widgets/data.js';
import { createDataRenderer } from '../../animations/data-renderers.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer } from './types.js';
import type { HudConfigMessage } from './types.js';
import type { Config } from '../../lib/config.js';

const DATA_STYLES = new Set<DataStyle>(['line', 'fill', 'scroll', 'cores', 'heatcore', 'gpuburn']);

export const dataDescriptor: DaemonWidgetDescriptor<DataWidget> = {
  ...dataBase,

  createRenderer(widget: DataWidget, ctx: DaemonWidgetContext): WidgetRenderer {
    const dataRenderer = createDataRenderer(ctx.hudDataConfig(ctx.side));
    ctx.procDataRendererRef.renderer = dataRenderer;
    return {
      render(_now, _audioCtx) { return dataRenderer.render(); },
      stop() { /* no cleanup needed */ },
    };
  },

  extractParams(m: HudConfigMessage, side: 'left' | 'right', _config: Config): DataWidget | null {
    const styleStr = side === 'left' ? m.leftDataStyle : m.rightDataStyle;
    const style = DATA_STYLES.has(styleStr as DataStyle) ? (styleStr as DataStyle) : undefined;
    return { widget: 'data', ...(style !== undefined ? { style } : {}) };
  },
};
