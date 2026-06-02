import type { HudWidget } from '../../deck/web/types/hud-preset.js';
import type { Config } from '../../lib/config.js';
import type { Frame } from '../../lib/frame.js';
import type { DataRenderer, DataWidgetConfig } from '../../animations/data-renderers.js';
import type { ClaudeRendererApi } from '../../animations/claude-renderers.js';
import type { WidgetDescriptor } from '../../lib/widgets/types.js';

export type { DataRenderer, DataWidgetConfig, ClaudeRendererApi };

// The flat IPC message for the hud-config command
export interface HudConfigMessage {
  cmd: string;
  leftFace?: string;
  leftWidget?: string;
  leftDataStyle?: string;
  leftAudioStyle?: string;
  leftClaudeStyle?: string;
  leftZenStyle?: string;
  leftFile?: string;
  leftBiomeName?: string;
  leftRandomIntervalMs?: number;
  leftTimerStyle?: string;
  leftTimerDurationMs?: number;
  leftTimerRepeat?: boolean;
  leftText?: string;
  leftTextStyle?: string;
  leftTextSize?: string;
  leftTextSpeed?: string;
  leftTextSpan?: boolean;
  leftTextFlicker?: string;
  leftTextTransition?: string;
  leftTextLoopDelayMs?: number;
  rightFace?: string;
  rightWidget?: string;
  rightDataStyle?: string;
  rightAudioStyle?: string;
  rightClaudeStyle?: string;
  rightZenStyle?: string;
  rightFile?: string;
  rightBiomeName?: string;
  rightRandomIntervalMs?: number;
  rightTimerStyle?: string;
  rightTimerDurationMs?: number;
  rightTimerRepeat?: boolean;
  rightText?: string;
  rightTextStyle?: string;
  rightTextSize?: string;
  rightTextSpeed?: string;
  rightTextSpan?: boolean;
  rightTextFlicker?: string;
  rightTextTransition?: string;
  rightTextLoopDelayMs?: number;
}

export interface PersistedTimerEpoch {
  durationMs: number;
  repeat: boolean;
  style: 'elegant' | 'hourglass' | 'twinz';
  epochMs: number;
}

// Minimal render handle returned by createWidgetRenderer
export interface WidgetRenderer {
  render(now: Date, audioCtx: { bands: number[]; fftSize: number; gain: number } | null): Frame;
  stop(): void;
}

// The closure-captured vars that widget descriptors need but can't re-import
export interface DaemonWidgetContext {
  side: 'left' | 'right';
  procDataRendererRef: { renderer: DataRenderer | null };
  zenSide: 'left' | 'right' | undefined;
  currentConfig: Config;
  hudDataConfig: (side: 'left' | 'right') => DataWidgetConfig;
  persistedTimerEpochs: Record<'left' | 'right', PersistedTimerEpoch | null>;
  claudeRenderers: Set<ClaudeRendererApi>;
}

export interface DaemonWidgetDescriptor<T extends HudWidget> extends WidgetDescriptor<T> {
  createRenderer(widget: T, ctx: DaemonWidgetContext): WidgetRenderer;
  extractParams(m: HudConfigMessage, side: 'left' | 'right', config: Config): T | null;
  canSpan?(left: T, right: HudWidget): boolean;
}
