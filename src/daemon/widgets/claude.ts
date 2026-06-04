import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import fs from 'node:fs/promises';
import { createFrame } from '../../lib/frame.js';
import { renderTwinzTimer, renderTwinzUsagePercent, renderTwinzUsageUnknown } from '../../animations/timer-renderers.js';
import { claudeBase } from '../../lib/widgets/claude.js';
import type { ClaudeStyle, ClaudeWidget } from '../../lib/widgets/claude.js';
import {
  createClaudeSnowRenderer,
  createClaudeSandRenderer,
  createClaudeLevel7Renderer,
} from '../../animations/claude-renderers.js';
import type { ClaudeRendererApi } from '../../animations/claude-renderers.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer } from './types.js';

// Polls the Anthropic API once a minute for 5h-window rate-limit utilisation
// and reset time. Shared by the usage and quota Claude widgets.
type UsagePoll = { util: number | null; resetAt: number | null };
function createUsagePoller(): { get(): UsagePoll; stop(): void } {
  const POLL_MS = 60_000;
  const CREDS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');
  let util: number | null = null;
  let resetAt: number | null = null;
  let fetchTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function schedulePoll(delayMs: number): void {
    if (stopped) return;
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => { void fetchUsage(); }, delayMs);
  }

  async function fetchUsage(): Promise<void> {
    if (stopped) return;
    try {
      const raw = await fs.readFile(CREDS_PATH, 'utf-8');
      const creds = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; expiresAt?: number } };
      const oauth = creds.claudeAiOauth ?? {};
      const token = oauth.accessToken;
      const expiresAt = oauth.expiresAt;
      // expiresAt is stored in milliseconds (matches Date.now() units)
      if (typeof token !== 'string' || (expiresAt !== undefined && expiresAt < Date.now())) { schedulePoll(POLL_MS); return; }

      const payload = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'x' }],
      });

      const result = await new Promise<{ util: number; resetAt: number | null } | null>((resolve) => {
        const req = https.request({
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'oauth-2025-04-20',
            'Content-Length': Buffer.byteLength(payload),
          },
        }, (res) => {
          res.resume();
          const u = res.headers['anthropic-ratelimit-unified-5h-utilization'];
          const r = res.headers['anthropic-ratelimit-unified-5h-reset'];
          const utilVal = typeof u === 'string' ? parseFloat(u) : null;
          const resetVal = typeof r === 'string' ? parseInt(r, 10) : null;
          resolve(utilVal !== null && !isNaN(utilVal) ? { util: utilVal, resetAt: resetVal } : null);
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => { req.destroy(); resolve(null); });
        req.write(payload);
        req.end();
      });

      if (result !== null) { util = result.util; resetAt = result.resetAt; }
    } catch { /* ignore — retain last known value */ }
    if (!stopped) schedulePoll(POLL_MS);
  }

  schedulePoll(0);

  return {
    get: () => ({ util, resetAt }),
    stop() {
      stopped = true;
      if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
    },
  };
}

// Twinz-font quota widget: shows utilisation as a two-digit percentage above a
// percent glyph. When utilisation exceeds 99% it switches to a twinz countdown
// of the time remaining until the 5h window resets, reverting to the
// percentage once usage resets.
export function createClaudeQuotaRenderer(): ClaudeRendererApi {
  const poller = createUsagePoller();
  let pulsePhase = 0;

  return {
    onEvent(_e) { /* polled, not event-driven */ },

    render(): ReturnType<typeof createFrame> {
      const { util, resetAt } = poller.get();

      if (util === null) {
        // Unknown: pulse the percent glyph alone until the first poll lands.
        pulsePhase += 0.08;
        return Math.sin(pulsePhase) > 0 ? renderTwinzUsageUnknown() : createFrame();
      }

      // Over 99%: countdown to reset in the twinz timer style.
      if (util > 0.99 && resetAt !== null) {
        // resetAt is a Unix timestamp in seconds; keep millisecond precision
        // so the twinz centiseconds pair actually ticks.
        const remainingMs = Math.max(0, resetAt * 1000 - Date.now());
        return renderTwinzTimer(remainingMs);
      }

      // Otherwise show the integer percentage (0–99).
      return renderTwinzUsagePercent(util * 100);
    },

    stop() { poller.stop(); },
  };
}

export const claudeDaemonDescriptor: DaemonWidgetDescriptor<ClaudeWidget> = {
  ...claudeBase,

  createRenderer(widget, ctx): WidgetRenderer {
    const { claudeRenderers } = ctx;
    const claudeStyle: ClaudeStyle = widget.style ?? 'snow';
    const claudeRenderer: ClaudeRendererApi = claudeStyle === 'quota'
      ? createClaudeQuotaRenderer()
      : claudeStyle === 'sand'
        ? createClaudeSandRenderer()
        : claudeStyle === 'level7'
          ? createClaudeLevel7Renderer()
          : createClaudeSnowRenderer();
    claudeRenderers.add(claudeRenderer);
    return {
      render(_now, _audioCtx) { return claudeRenderer.render(); },
      stop() { claudeRenderer.stop(); claudeRenderers.delete(claudeRenderer); },
    };
  },

  extractParams(m, side, _config): ClaudeWidget | null {
    const CLAUDE_STYLES = new Set<ClaudeStyle>(['snow', 'quota', 'sand', 'level7']);
    const styleStr = side === 'left' ? m.leftClaudeStyle : m.rightClaudeStyle;
    const validStyle = CLAUDE_STYLES.has(styleStr as ClaudeStyle);
    return { widget: 'claude', ...(validStyle ? { style: styleStr as ClaudeStyle } : {}) };
  },
};
