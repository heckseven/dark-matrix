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
export type DataStyle  = 'line' | 'fill' | 'scroll' | 'cores';

export type DataWidgetConfig = {
  style?:       DataStyle;
  topLeft?:     DataMetric;
  topRight?:    DataMetric;
  bottomLeft?:  DataMetric;
  bottomRight?: DataMetric;
};

export const DATA_STYLES: { id: DataStyle; label: string }[] = [
  { id: 'line',   label: 'line'   },
  { id: 'fill',   label: 'fill'   },
  { id: 'scroll', label: 'scroll' },
  { id: 'cores',  label: 'cores'  },
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

  // Ring buffers — line/fill/scroll use full history; cores uses slot [0] only
  const histTL = new Float32Array(HIST_LEN);
  const histTR = new Float32Array(HIST_LEN);
  const histBL = new Float32Array(HIST_LEN);
  const histBR = new Float32Array(HIST_LEN);

  // cores: 5th group value and group count (4 or 5 depending on core count)
  let coreCenterVal  = 0;
  let coreGroupCount: 4 | 5 = 4;

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

  // Group cpuCores into n evenly-sized buckets, return avg per bucket (0–1)
  function cpuGroups(cores: number[], n: 4 | 5): number[] {
    if (cores.length === 0) return Array(n).fill(0) as number[];
    const gs = Math.ceil(cores.length / n);
    return Array.from({ length: n }, (_, gi) => {
      let s = 0, cnt = 0;
      for (let i = gi * gs; i < Math.min((gi + 1) * gs, cores.length); i++) {
        s += cores[i] ?? 0; cnt++;
      }
      return cnt > 0 ? s / cnt / 100 : 0;
    });
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

  // Fill: area chart — solid fill from center outward, proportional to value
  function drawFilled(f: Frame, buf: Float32Array, colBase: number, top: boolean, reflect: boolean): void {
    for (let i = 0; i < HIST_LEN; i++) {
      const row = top ? TOP_BASE - i : BOT_BASE + i;
      if (row < 0 || row >= ROWS) continue;
      const cols = Math.round((buf[i] ?? 0) * 4);
      for (let c = 0; c < cols; c++) {
        const col = reflect ? colBase + 3 - c : colBase + c;
        f[col * ROWS + row] = 255;
      }
    }
  }

  // Scroll: 4 time steps per quadrant — each column = one time step, newest nearest center
  function drawScrollBars(f: Frame, buf: Float32Array, colBase: number, top: boolean, reflect: boolean): void {
    for (let t = 0; t < 4; t++) {
      const col = colBase + (reflect ? 3 - t : t);
      const v = buf[t] ?? 0;
      const filled = Math.round(v * HIST_LEN);
      for (let i = 0; i < filled; i++) {
        const row = top ? TOP_BASE - i : BOT_BASE + i;
        if (row >= 0 && row < ROWS) f[col * ROWS + row] = 255;
      }
    }
  }

  // Cores: full-height bar (top + bottom) for a single column
  function drawCoreBar(f: Frame, v: number, col: number): void {
    const filled = Math.round(v * HIST_LEN);
    for (let i = 0; i < filled; i++) {
      const rowTop = TOP_BASE - i;
      const rowBot = BOT_BASE + i;
      if (rowTop >= 0) f[col * ROWS + rowTop] = 255;
      if (rowBot < ROWS) f[col * ROWS + rowBot] = 255;
    }
  }

  return {
    update(stats: DataStats) {
      if (style === 'cores') {
        const n: 4 | 5 = (stats.cpuCores?.length ?? 0) > 16 ? 5 : 4;
        coreGroupCount = n;
        const groups = cpuGroups(stats.cpuCores ?? [], n);
        histTL[0] = groups[0] ?? 0;
        histTR[0] = groups[1] ?? 0;
        histBL[0] = groups[2] ?? 0;
        histBR[0] = groups[3] ?? 0;
        coreCenterVal = groups[4] ?? 0;
      } else if (style === 'scroll') {
        const groups = cpuGroups(stats.cpuCores ?? [], 4);
        shiftPush(histTL, groups[0] ?? 0);
        shiftPush(histTR, groups[1] ?? 0);
        shiftPush(histBL, groups[2] ?? 0);
        shiftPush(histBR, groups[3] ?? 0);
      } else {
        // line and fill — use configurable metrics with full history
        updateCeilings(stats);
        shiftPush(histTL, metricValue(stats, topLeftM));
        shiftPush(histTR, metricValue(stats, topRightM));
        shiftPush(histBL, metricValue(stats, botLeftM));
        shiftPush(histBR, metricValue(stats, botRightM));
      }
    },
    render(): Frame {
      const f = createFrame();
      if (style === 'fill') {
        drawFilled(f, histTL, LEFT_BASE,  true,  true);
        drawFilled(f, histTR, RIGHT_BASE, true,  false);
        drawFilled(f, histBL, LEFT_BASE,  false, true);
        drawFilled(f, histBR, RIGHT_BASE, false, false);
      } else if (style === 'scroll') {
        drawScrollBars(f, histTL, LEFT_BASE,  true,  true);
        drawScrollBars(f, histTR, RIGHT_BASE, true,  false);
        drawScrollBars(f, histBL, LEFT_BASE,  false, true);
        drawScrollBars(f, histBR, RIGHT_BASE, false, false);
      } else if (style === 'cores') {
        const g0 = histTL[0] ?? 0;
        const g1 = histTR[0] ?? 0;
        const g2 = histBL[0] ?? 0;
        const g3 = histBR[0] ?? 0;
        // Left half: groups 0–3, innermost at col 3
        drawCoreBar(f, g0, LEFT_BASE + 0);
        drawCoreBar(f, g1, LEFT_BASE + 1);
        drawCoreBar(f, g2, LEFT_BASE + 2);
        drawCoreBar(f, g3, LEFT_BASE + 3);
        // Right half: mirrored
        drawCoreBar(f, g3, RIGHT_BASE + 0);
        drawCoreBar(f, g2, RIGHT_BASE + 1);
        drawCoreBar(f, g1, RIGHT_BASE + 2);
        drawCoreBar(f, g0, RIGHT_BASE + 3);
        // Center column: 5th group, only when >16 cores
        if (coreGroupCount === 5) drawCoreBar(f, coreCenterVal, 4);
      } else {
        // line
        drawLine(f, histTL, LEFT_BASE,  true,  true);
        drawLine(f, histTR, RIGHT_BASE, true,  false);
        drawLine(f, histBL, LEFT_BASE,  false, true);
        drawLine(f, histBR, RIGHT_BASE, false, false);
      }
      return f;
    },
  };
}
