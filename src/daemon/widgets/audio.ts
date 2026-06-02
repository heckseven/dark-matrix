import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../animations/audio-renderers.js';
import type { AudioStyle } from '../../animations/audio-renderers.js';
import type { HudWidget } from '../../deck/web/types/hud-preset.js';
import { audioBase } from '../../lib/widgets/audio.js';
import type { AudioWidget } from '../../lib/widgets/audio.js';
import { FRAME_COLS, FRAME_ROWS } from '../../lib/frame.js';
import type { Frame } from '../../lib/frame.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer } from './types.js';
import type { Config } from '../../lib/config.js';
import type { HudConfigMessage } from './types.js';

export const audioDaemonDescriptor: DaemonWidgetDescriptor<AudioWidget> = {
  ...audioBase,

  createRenderer(widget, ctx): WidgetRenderer {
    const { side } = ctx;
    const style = (widget.style ?? 'dark-matter') as AudioStyle;
    const audioRenderer = createAudioRenderer(style);
    return {
      render(_now, audioCtx) {
        const ctx = audioCtx ?? { bands: new Array(9).fill(0) as number[], fftSize: 2048, gain: 1.0 };
        const raw = audioRenderer(ctx);
        if (side === 'right') {
          const mirrored = new Uint8Array(raw.length);
          for (let col = 0; col < FRAME_COLS; col++) {
            const src = FRAME_COLS - 1 - col;
            for (let row = 0; row < FRAME_ROWS; row++) {
              mirrored[col * FRAME_ROWS + row] = raw[src * FRAME_ROWS + row] ?? 0;
            }
          }
          return mirrored as Frame;
        }
        return raw;
      },
      stop() { /* stateless */ },
    };
  },

  extractParams(m, side, _config): AudioWidget | null {
    const styleStr = side === 'left' ? m.leftAudioStyle : m.rightAudioStyle;
    const validStyle = AUDIO_STYLES.some(s => s.id === styleStr);
    return { widget: 'audio', ...(validStyle ? { style: styleStr as AudioStyle } : {}) };
  },
};
