import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

// Same shape as ProcStats in proc-source.ts — kept separate for browser compatibility
export type DataStats = {
  cpuPct: number;
  ramPct: number;
  netRxBps: number;
  netTxBps: number;
  cpuCores?: number[];  // per-core % (0–100), optional for backwards compat
};

export type DataMetric = 'cpu' | 'ram' | 'net_rx' | 'net_tx';
export type DataStyle  = 'line' | 'bars';

export type DataWidgetConfig = {
  style?:       DataStyle;
  topLeft?:     DataMetric;
  topRight?:    DataMetric;
  bottomLeft?:  DataMetric;
  bottomRight?: DataMetric;
};

export const DATA_STYLES: { id: DataStyle; label: string }[] = [
  { id: 'line', label: 'line'  },
  { id: 'bars', label: 'cores' },
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

export type DataRenderer = {
  update(stats: DataStats): void;
  render(): Frame;
};

export function createDataRenderer(cfg: DataWidgetConfig = {}): DataRenderer {
  const style:    DataStyle  = cfg.style      ?? 'line';
  const topLeftM: DataMetric = cfg.topLeft    ?? 'cpu';
  const topRightM:DataMetric = cfg.topRight   ?? 'ram';
  const botLeftM: DataMetric = cfg.bottomLeft ?? 'net_rx';
  const botRightM:DataMetric = cfg.bottomRight ?? 'net_tx';

  // Ring buffers for line; slot [0] only used for bars
  const histTL = new Float32Array(HIST_LEN);
  const histTR = new Float32Array(HIST_LEN);
  const histBL = new Float32Array(HIST_LEN);
  const histBR = new Float32Array(HIST_LEN);

  let netRxCeil = 1 * 1024 * 1024;
  let netTxCeil = 1 * 1024 * 1024;

  function updateCeilings(stats: DataStats): void {
    if (stats.netRxBps > netRxCeil) netRxCeil = stats.netRxBps * 1.1;
    else netRxCeil = Math.max(1024 * 1024, netRxCeil * 0.998);
    if (stats.netTxBps > netTxCeil) netTxCeil = stats.netTxBps * 1.1;
    else netTxCeil = Math.max(1024 * 1024, netTxCeil * 0.998);
  }

  function metricValue(stats: DataStats, m: DataMetric): number {
    switch (m) {
      case 'cpu':    return stats.cpuPct / 100;
      case 'ram':    return stats.ramPct / 100;
      case 'net_rx': return Math.min(1, stats.netRxBps / netRxCeil);
      case 'net_tx': return Math.min(1, stats.netTxBps / netTxCeil);
    }
  }

  function shiftPush(buf: Float32Array, v: number): void {
    for (let i = HIST_LEN - 1; i > 0; i--) buf[i] = buf[i - 1] ?? 0;
    buf[0] = v;
  }

  // Group cpuCores into 4 evenly-sized buckets, return avg per bucket (0–1)
  function cpuGroups(cores: number[]): [number, number, number, number] {
    const n = cores.length;
    if (n === 0) return [0, 0, 0, 0];
    const gs = Math.ceil(n / 4);
    const avg = (start: number): number => {
      let s = 0, cnt = 0;
      for (let i = start; i < Math.min(start + gs, n); i++) { s += cores[i] ?? 0; cnt++; }
      return cnt > 0 ? s / cnt / 100 : 0;
    };
    return [avg(0), avg(gs), avg(gs * 2), avg(gs * 3)];
  }

  // Line: single-pixel trace per history row
  function drawLine(f: Frame, buf: Float32Array, colBase: number, top: boolean, reflect: boolean): void {
    for (let i = 0; i < HIST_LEN; i++) {
      const row = top ? TOP_BASE - i : BOT_BASE + i;
      if (row < 0 || row >= ROWS) continue;
      const v = buf[i] ?? 0;
      const offset = reflect ? 3 - Math.round(v * 3) : Math.round(v * 3);
      f[(colBase + offset) * ROWS + row] = 255;
    }
  }

  // Bars: solid fill from center outward, all 4 cols, height = value * HIST_LEN
  function drawBar(f: Frame, value: number, colBase: number, top: boolean): void {
    const filled = Math.round(value * HIST_LEN);
    for (let i = 0; i < filled; i++) {
      const row = top ? TOP_BASE - i : BOT_BASE + i;
      if (row < 0 || row >= ROWS) continue;
      for (let c = 0; c < 4; c++) f[(colBase + c) * ROWS + row] = 255;
    }
  }

  return {
    update(stats: DataStats) {
      if (style === 'bars') {
        const [g0, g1, g2, g3] = cpuGroups(stats.cpuCores ?? []);
        histTL[0] = g0;
        histTR[0] = g1;
        histBL[0] = g2;
        histBR[0] = g3;
      } else {
        updateCeilings(stats);
        shiftPush(histTL, metricValue(stats, topLeftM));
        shiftPush(histTR, metricValue(stats, topRightM));
        shiftPush(histBL, metricValue(stats, botLeftM));
        shiftPush(histBR, metricValue(stats, botRightM));
      }
    },
    render(): Frame {
      const f = createFrame();
      if (style === 'bars') {
        drawBar(f, histTL[0] ?? 0, LEFT_BASE,  true);
        drawBar(f, histTR[0] ?? 0, RIGHT_BASE, true);
        drawBar(f, histBL[0] ?? 0, LEFT_BASE,  false);
        drawBar(f, histBR[0] ?? 0, RIGHT_BASE, false);
      } else {
        drawLine(f, histTL, LEFT_BASE,  true,  true);
        drawLine(f, histTR, RIGHT_BASE, true,  false);
        drawLine(f, histBL, LEFT_BASE,  false, true);
        drawLine(f, histBR, RIGHT_BASE, false, false);
      }
      return f;
    },
  };
}
