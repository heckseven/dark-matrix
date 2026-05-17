import { createFrame, FRAME_ROWS, FRAME_COLS } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

const TOTAL_COLS = FRAME_COLS * 2; // 18 columns across both modules
const ROWS = FRAME_ROWS;           // 34 rows

const BUMP = 10;              // score added per call (4 calls fills a bar)
const DECAY = 0.9995;         // per-frame multiplier (~14min to zero at 10fps)
const PEAK_HOLD_FRAMES = 45;  // 3s at 15fps (idle), 4.5s at 10fps (HUD)
const PEAK_FALL_FRAMES = 15;  // 1px/s at 15fps, 1.5px/s at 10fps

// Left module (cols 0-8): core coding tools
// Right module (cols 9-17): meta/orchestration tools
const TOOL_COLS: Record<string, number> = {
  Bash:            0,
  Read:            1,
  Edit:            2,
  Write:           3,
  Grep:            4,
  Glob:            5,
  Agent:           6,
  WebFetch:        7,
  WebSearch:       8,
  TodoWrite:       9,
  TodoRead:       10,
  NotebookEdit:   11,
  Task:           12,
  ScheduleWakeup: 13,
  Skill:          14,
  ToolSearch:     15,
  RemoteTrigger:  16,
  // col 17 = catch-all
};
const OTHER_COL = TOTAL_COLS - 1;

export type HeatmapState = {
  scores: Float32Array;        // current bar height (0..ROWS) per column
  peaks: Uint8Array;           // peak pixel height per column
  peakHoldTimers: Int16Array;  // frames remaining in hold phase
  peakFallTimers: Int16Array;  // frames until next fall step
};

export function createHeatmapState(): HeatmapState {
  return {
    scores:         new Float32Array(TOTAL_COLS),
    peaks:          new Uint8Array(TOTAL_COLS),
    peakHoldTimers: new Int16Array(TOTAL_COLS),
    peakFallTimers: new Int16Array(TOTAL_COLS),
  };
}

export function bumpTool(state: HeatmapState, toolName: string): void {
  const col = TOOL_COLS[toolName] ?? OTHER_COL;
  state.scores[col] = Math.min(ROWS, (state.scores[col] ?? 0) + BUMP);
  const newHeight = Math.round(state.scores[col] ?? 0);
  if (newHeight > (state.peaks[col] ?? 0)) {
    state.peaks[col] = newHeight;
    state.peakHoldTimers[col] = PEAK_HOLD_FRAMES;
    state.peakFallTimers[col] = PEAK_FALL_FRAMES;
  } else {
    // Refresh hold timer on any bump to the column
    if ((state.peakHoldTimers[col] ?? 0) < PEAK_HOLD_FRAMES) {
      state.peakHoldTimers[col] = PEAK_HOLD_FRAMES;
    }
  }
}

export function tickHeatmap(state: HeatmapState): void {
  for (let c = 0; c < TOTAL_COLS; c++) {
    state.scores[c] = (state.scores[c] ?? 0) * DECAY;
    if ((state.scores[c] ?? 0) < 0.5) state.scores[c] = 0;

    const barHeight = Math.round(state.scores[c] ?? 0);
    const peak = state.peaks[c] ?? 0;

    if (peak === 0) continue;

    if ((state.peakHoldTimers[c] ?? 0) > 0) {
      state.peakHoldTimers[c]!--;
    } else {
      if ((state.peakFallTimers[c] ?? 0) > 0) {
        state.peakFallTimers[c]!--;
      } else {
        state.peakFallTimers[c] = PEAK_FALL_FRAMES;
        state.peaks[c] = Math.max(barHeight, peak - 1);
      }
    }

    // Peak never drops below bar
    if ((state.peaks[c] ?? 0) < barHeight) {
      state.peaks[c] = barHeight;
    }
  }
}

export function renderHeatmap(state: HeatmapState): [Frame, Frame] {
  const left = createFrame();
  const right = createFrame();

  for (let c = 0; c < TOTAL_COLS; c++) {
    const frame = c < FRAME_COLS ? left : right;
    const col = c < FRAME_COLS ? c : c - FRAME_COLS;

    const barHeight = Math.round(state.scores[c] ?? 0);
    const peak = state.peaks[c] ?? 0;

    // Bar fills from bottom (row ROWS-1) upward
    for (let row = ROWS - barHeight; row < ROWS; row++) {
      frame[col * ROWS + row] = 180;
    }

    // Peak pixel floats above the bar, brighter
    if (peak > 0) {
      const peakRow = ROWS - peak;
      if (peakRow >= 0 && peakRow < ROWS) {
        frame[col * ROWS + peakRow] = 255;
      }
    }
  }

  return [left, right];
}
