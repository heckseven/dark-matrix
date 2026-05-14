import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

// Same shape as ProcStats in proc-source.ts — kept separate for browser compatibility
export type DataStats = {
  cpuPct: number;
  ramPct: number;
  netRxBps: number;
  netTxBps: number;
};

export type DataMetric = 'cpu' | 'ram' | 'net_rx' | 'net_tx';
export type DataStyle  = 'line' | 'center-fill';

export type DataWidgetConfig = {
  style?:       DataStyle;
  topLeft?:     DataMetric;
  topRight?:    DataMetric;
  bottomLeft?:  DataMetric;
  bottomRight?: DataMetric;
};

export const DATA_STYLES: { id: DataStyle; label: string }[] = [
  { id: 'line',        label: 'line'   },
  { id: 'center-fill', label: 'fill'   },
];

// Layout constants
const ROWS       = 34;
const HIST_LEN   = 17;
// Top sections: row 16 = newest (nearest center), row 0 = oldest
const TOP_BASE   = 16;
// Bottom sections: row 17 = newest, row 33 = oldest
const BOT_BASE   = 17;
// Column groups (section-relative offset 0–3)
const LEFT_BASE  = 0;
const RIGHT_BASE = 5;

// Column offsets for center-fill expanding outward from center pair (1,2)
const FILL_COLS:          readonly number[] = [1, 2, 0, 3]; // right quadrants
const FILL_COLS_REFLECTED: readonly number[] = [2, 1, 3, 0]; // left quadrants (horizontal mirror)

export type DataRenderer = {
  update(stats: DataStats): void;
  render(): Frame;
};

export function createDataRenderer(cfg: DataWidgetConfig = {}): DataRenderer {
  const style:       DataStyle  = cfg.style       ?? 'line';
  const topLeftM:    DataMetric = cfg.topLeft     ?? 'cpu';
  const topRightM:   DataMetric = cfg.topRight    ?? 'ram';
  const botLeftM:    DataMetric = cfg.bottomLeft  ?? 'net_rx';
  const botRightM:   DataMetric = cfg.bottomRight ?? 'net_tx';

  // Ring buffers: hist[0] = newest, hist[HIST_LEN-1] = oldest
  const histTL = new Float32Array(HIST_LEN);
  const histTR = new Float32Array(HIST_LEN);
  const histBL = new Float32Array(HIST_LEN);
  const histBR = new Float32Array(HIST_LEN);

  // Adaptive ceiling for network rates (bytes/sec), prevents pinning at max
  let netRxCeil = 1 * 1024 * 1024;   // start at 1 MB/s
  let netTxCeil = 1 * 1024 * 1024;

  function metricValue(stats: DataStats, m: DataMetric): number {
    switch (m) {
      case 'cpu':    return stats.cpuPct / 100;
      case 'ram':    return stats.ramPct / 100;
      case 'net_rx': {
        if (stats.netRxBps > netRxCeil) netRxCeil = stats.netRxBps * 1.1;
        else netRxCeil = Math.max(1024 * 1024, netRxCeil * 0.998);
        return Math.min(1, stats.netRxBps / netRxCeil);
      }
      case 'net_tx': {
        if (stats.netTxBps > netTxCeil) netTxCeil = stats.netTxBps * 1.1;
        else netTxCeil = Math.max(1024 * 1024, netTxCeil * 0.998);
        return Math.min(1, stats.netTxBps / netTxCeil);
      }
    }
  }

  function shiftPush(buf: Float32Array, v: number): void {
    // Shift right (newest to oldest), insert at 0
    for (let i = HIST_LEN - 1; i > 0; i--) buf[i] = buf[i - 1]!;
    buf[0] = v;
  }

  function drawQuadrant(
    f: Frame,
    buf: Float32Array,
    colBase: number,
    top: boolean,
    reflect: boolean,
  ): void {
    const fillOrder = reflect ? FILL_COLS_REFLECTED : FILL_COLS;
    for (let i = 0; i < HIST_LEN; i++) {
      const row = top ? TOP_BASE - i : BOT_BASE + i;
      if (row < 0 || row >= ROWS) continue;
      const v = buf[i] ?? 0;

      if (style === 'line') {
        const offset = reflect ? 3 - Math.round(v * 3) : Math.round(v * 3);
        f[(colBase + offset) * ROWS + row] = 255;
      } else {
        const count = Math.round(v * 4);
        for (let k = 0; k < count; k++) {
          f[(colBase + (fillOrder[k] ?? 0)) * ROWS + row] = 255;
        }
      }
    }
  }

  return {
    update(stats: DataStats) {
      shiftPush(histTL, metricValue(stats, topLeftM));
      shiftPush(histTR, metricValue(stats, topRightM));
      shiftPush(histBL, metricValue(stats, botLeftM));
      shiftPush(histBR, metricValue(stats, botRightM));
    },
    render(): Frame {
      const f = createFrame();
      drawQuadrant(f, histTL, LEFT_BASE,  true,  true);
      drawQuadrant(f, histTR, RIGHT_BASE, true,  false);
      drawQuadrant(f, histBL, LEFT_BASE,  false, true);
      drawQuadrant(f, histBR, RIGHT_BASE, false, false);
      return f;
    },
  };
}
