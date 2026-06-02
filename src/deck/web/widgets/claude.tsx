import { useState, useEffect } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { CLAUDE_STYLES, createClaudeSnowRenderer, createClaudeSandRenderer, createClaudeTetrisRenderer } from '../../../animations/claude-renderers.js';
import type { ClaudeStyle as ClaudeStyleImport } from '../../../animations/claude-renderers.js';
import { renderTwinzUsagePercent } from '../../../animations/timer-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { BrowserWidgetDescriptor, GridContext } from './types.js';
import { bayerToB64, bwToB64 } from './utils.js';
import { claudeBase } from '../../../lib/widgets/claude.js';
import type { ClaudeWidget } from '../../../lib/widgets/claude.js';

// ── module-level renderer instances ──────────────────────────────────────────

const _previewClaudeSnow = createClaudeSnowRenderer();
const _previewClaudeSand = (() => {
  const r = createClaudeSandRenderer();
  for (let i = 0; i < 60; i++) {
    if (i % 4 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
    r.render();
  }
  return r;
})();
const _previewClaudeTetris = (() => {
  const r = createClaudeTetrisRenderer();
  for (let i = 0; i < 180; i++) {
    if (i % 3 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
    r.render();
  }
  return r;
})();

// Quota preview — sample percentage in the twinz font.
const _quotaPreviewFrame: Uint8Array = (() => {
  const frame = renderTwinzUsagePercent(42);
  const out = new Uint8Array(9 * 34);
  for (let i = 0; i < out.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return out;
})();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _previewClaudeSnow.stop();
    _previewClaudeSand.stop();
    _previewClaudeTetris.stop();
  });
}

// ── static thumbnails (computed once at module load) ──────────────────────────

const _claudeSnowThumb: string = (() => {
  const r = createClaudeSnowRenderer();
  for (let i = 0; i < 30; i++) {
    if (i % 4 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
    r.render();
  }
  const out = bayerToB64(r.render());
  r.stop();
  return out;
})();

const _claudeSandThumb: string = (() => {
  const r = createClaudeSandRenderer();
  for (let i = 0; i < 40; i++) {
    if (i % 3 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
    r.render();
  }
  const out = bayerToB64(r.render());
  r.stop();
  return out;
})();

const _claudeTetrisThumb: string = (() => {
  const r = createClaudeTetrisRenderer();
  for (let i = 0; i < 180; i++) {
    if (i % 3 === 0) r.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
    r.render();
  }
  const out = bayerToB64(r.render());
  r.stop();
  return out;
})();

const _quotaThumb: string = (() => {
  return bwToB64(renderTwinzUsagePercent(42));
})();

// ── Grid component ────────────────────────────────────────────────────────────

function ClaudeGrid({ currentWidget, onPick }: GridContext) {
  const [snowPixels, setSnowPixels] = useState(() => bayerToB64(_previewClaudeSnow.render()));
  const [sandPixels, setSandPixels] = useState(() => bayerToB64(_previewClaudeSand.render()));
  const [tetrisPixels, setTetrisPixels] = useState(() => bayerToB64(_previewClaudeTetris.render()));

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let tick = 0;
    const iid = setInterval(() => {
      tick++;
      // Fire synthetic events occasionally to show activity bursts
      if (tick % 8 === 0) {
        const tools = ['Read', 'Bash', 'Edit', 'Grep', 'Write'];
        _previewClaudeSnow.onEvent({ type: 'tool_use', tool: tools[tick % tools.length]!, sessionId: 'preview' });
      }
      if (tick % 40 === 0) {
        _previewClaudeSnow.onEvent({ type: 'agent_spawn', sessionId: 'preview' });
      }
      setSnowPixels(bayerToB64(_previewClaudeSnow.render()));

      if (tick % 6 === 0) {
        _previewClaudeSand.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
        _previewClaudeTetris.onEvent({ type: 'tool_use', tool: 'Read', sessionId: 'preview' });
      }
      setSandPixels(bayerToB64(_previewClaudeSand.render()));
      setTetrisPixels(bayerToB64(_previewClaudeTetris.render()));
    }, 100);
    return () => clearInterval(iid);
  }, []);

  const claudeStyle = currentWidget?.widget === 'claude' ? (currentWidget.style ?? 'snow') : null;

  return (
    <div role="group" aria-label="Agent panels" className="flex flex-wrap gap-6">
      {CLAUDE_STYLES.map(({ id, label }) => {
        const preview = id === 'quota'  ? _quotaThumb
          : id === 'sand'   ? sandPixels
          : id === 'tetris' ? tetrisPixels
          : snowPixels;
        return (
          <MatrixItem
            key={id}
            name={label}
            aria-label={label}
            width={9}
            pixels={preview}
            isSelected={claudeStyle === id}
            onSelect={() => onPick({ widget: 'claude', style: id as ClaudeStyleImport })}
          />
        );
      })}
    </div>
  );
}

// ── Bayer dither to Uint8Array ────────────────────────────────────────────────

const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] as const;

// ── Descriptor ────────────────────────────────────────────────────────────────

export const claudeDescriptor: BrowserWidgetDescriptor<ClaudeWidget> = {
  ...claudeBase,

  GridComponent: ClaudeGrid,

  renderThumbnail(widget, _side) {
    const style = widget.style ?? 'snow';
    return style === 'sand'   ? _claudeSandThumb
         : style === 'tetris' ? _claudeTetrisThumb
         : style === 'quota'  ? _quotaThumb
         :                      _claudeSnowThumb;
  },

  renderPreview(widget, _side, _now) {
    const style = widget.style ?? 'snow';
    if (style === 'quota') return _quotaPreviewFrame;
    const raw = style === 'sand'   ? _previewClaudeSand.render()
              : style === 'tetris' ? _previewClaudeTetris.render()
              :                      _previewClaudeSnow.render();
    // Bayer dither
    const out = new Uint8Array(9 * 34);
    for (let col = 0; col < 9; col++) {
      for (let row = 0; row < 34; row++) {
        const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
        out[col * 34 + row] = (raw[col * 34 + row] ?? 0) > threshold ? 255 : 0;
      }
    }
    return out;
  },

  serializeConfig(widget, side) {
    return {
      [`${side}Widget`]: 'claude',
      ...(widget.style !== undefined ? { [`${side}ClaudeStyle`]: widget.style } : {}),
    };
  },
};
