import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

// Same shape as ProcStats in proc-source.ts — kept separate for browser compatibility
export type DataStats = {
  cpuPct: number;
  ramPct: number;
  netRxBps: number;
  netTxBps: number;
  cpuCores?: number[];       // per-core % (0–100), optional for backwards compat
  gpuPct?: number | null;    // GPU utilization 0–100, optional
  gpuTempC?: number | null;  // GPU temperature in °C, optional
};

export type DataMetric = 'cpu' | 'ram' | 'net_rx' | 'net_tx';
export type DataStyle  = 'line' | 'fill' | 'scroll' | 'cores' | 'gpufire';

export type DataWidgetConfig = {
  style?:       DataStyle;
  topLeft?:     DataMetric;
  topRight?:    DataMetric;
  bottomLeft?:  DataMetric;
  bottomRight?: DataMetric;
};

export const DATA_STYLES: { id: DataStyle; label: string }[] = [
  { id: 'line',    label: 'line'    },
  { id: 'fill',    label: 'fill'    },
  { id: 'scroll',  label: 'scroll'  },
  { id: 'cores',   label: 'cores'   },
  { id: 'gpufire', label: 'gpufire' },
];

// ── GpuFire constants ─────────────────────────────────────────────────────
// Fire zone: rows 0–4 = temp digits, row 5 = gap, rows 6–33 = fire.
const GF_FIRE_TOP = 6;
const GF_FIRE_H   = 34 - GF_FIRE_TOP; // 28 rows
const GF_STEP_MS  = 50;               // rate-limit CA to 20 fps
const GF_HOT_COLS = new Set([1, 4, 7]); // torch: three hotspot columns

// Digit glyphs: 2 cols × 5 rows, col-major (g[col * 5 + row])
type GfGlyph = readonly [number,number,number,number,number, number,number,number,number,number];
const GF_GLYPHS: ReadonlyArray<GfGlyph> = [
  [1,1,1,1,1, 1,1,1,1,1], // 0
  [1,1,1,1,1, 0,0,0,0,0], // 1
  [1,0,1,1,1, 1,1,0,0,1], // 2
  [1,0,1,0,1, 1,1,1,1,1], // 3
  [1,1,1,0,0, 0,1,1,1,1], // 4
  [1,1,1,0,1, 1,0,1,1,0], // 5
  [1,1,1,1,1, 0,0,1,1,1], // 6
  [1,0,0,0,0, 1,1,1,1,1], // 7
  [1,0,1,1,1, 1,0,1,1,1], // 8
  [1,1,1,0,0, 1,1,1,1,1], // 9
];

function gfPutDigit(f: Frame, digit: number, colStart: number, rows: number): void {
  const g = GF_GLYPHS[Math.max(0, Math.min(9, digit))]!;
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 5; r++) {
      if (g[c * 5 + r]) f[(colStart + c) * rows + r] = 255;
    }
  }
}

// Layout constants
const COLS       = 9;
const ROWS       = 34;
const HIST_LEN   = 17;
// Top sections: row 16 = newest (nearest center), row 0 = oldest
const TOP_BASE   = 16;
// Bottom sections: row 17 = newest, row 33 = oldest
const BOT_BASE   = 17;
// Column groups (section-relative offset 0–3)
const LEFT_BASE  = 0;
const RIGHT_BASE = 5;
// Cores layout
const CORES_FULL_THRESHOLD = 9;   // ≤9 cores → full-height (center-out) bars
const CORES_TOTAL_CAP      = 18;  // group cores into 18 buckets when >18
// Per-frame easing toward the latest targets. At ~30 FPS with ~500 ms data
// updates (~15 frames), 0.2 reaches ~96% of target before the next update —
// smooth glide instead of a once-per-update snap.
const CORES_EASE           = 0.2;

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

  // Ring buffers — line/fill/scroll use full history. cores uses coreValues below.
  const histTL = new Float32Array(HIST_LEN);
  const histTR = new Float32Array(HIST_LEN);
  const histBL = new Float32Array(HIST_LEN);
  const histBR = new Float32Array(HIST_LEN);

  // cores: per-core (or per-bucket) values normalized 0..1.
  // coreValues = displayed (eased) values; coreTargets = latest data.
  let coreValues:  number[] = [];
  let coreTargets: number[] = [];

  // gpufire: DOOM heat buffer + live GPU load/temp
  const gfBuf       = new Float32Array(COLS * GF_FIRE_H);
  let   gfLoad      = 0.0;
  let   gfTempC: number | null = null;
  let   gfLastStepMs = 0;

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
  function cpuGroups(cores: number[], n: number): number[] {
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

  // Full-height bar (center-out): grows both up and down from the central
  // horizontal axis. Used when total core count ≤ CORES_FULL_THRESHOLD.
  function drawFullHeightBar(f: Frame, v: number, col: number): void {
    const filled = Math.round(v * HIST_LEN);
    for (let i = 0; i < filled; i++) {
      const rowTop = TOP_BASE - i;
      const rowBot = BOT_BASE + i;
      if (rowTop >= 0) f[col * ROWS + rowTop] = 255;
      if (rowBot < ROWS) f[col * ROWS + rowBot] = 255;
    }
  }

  // Half-height bar growing upward from the central axis.
  function drawHalfBarTop(f: Frame, v: number, col: number): void {
    const filled = Math.round(v * HIST_LEN);
    for (let i = 0; i < filled; i++) {
      const row = TOP_BASE - i;
      if (row >= 0) f[col * ROWS + row] = 255;
    }
  }

  // Half-height bar growing downward from the central axis.
  function drawHalfBarBot(f: Frame, v: number, col: number): void {
    const filled = Math.round(v * HIST_LEN);
    for (let i = 0; i < filled; i++) {
      const row = BOT_BASE + i;
      if (row < ROWS) f[col * ROWS + row] = 255;
    }
  }

  return {
    update(stats: DataStats) {
      if (style === 'cores') {
        const cores = stats.cpuCores ?? [];
        coreTargets = cores.length > CORES_TOTAL_CAP
          ? cpuGroups(cores, CORES_TOTAL_CAP)
          : cores.map(c => Math.max(0, Math.min(1, c / 100)));
        // Snap on first data or when the core/bucket count changes; otherwise
        // render() eases coreValues toward coreTargets each frame.
        if (coreValues.length !== coreTargets.length) coreValues = [...coreTargets];
      } else if (style === 'gpufire') {
        gfLoad = (stats.gpuPct ?? 0) / 100;
        if (stats.gpuTempC !== undefined) gfTempC = stats.gpuTempC;
      } else {
        // line, fill, and scroll — use configurable metrics with full history
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
        // Ease displayed values toward the latest targets every frame so bars
        // glide rather than snapping once per data update.
        for (let i = 0; i < coreValues.length; i++) {
          const cur = coreValues[i] ?? 0;
          const tgt = coreTargets[i] ?? 0;
          coreValues[i] = cur + (tgt - cur) * CORES_EASE;
        }
        const n = coreValues.length;
        if (n === 0) {
          // No core data — render empty frame.
        } else if (n <= CORES_FULL_THRESHOLD) {
          // Full-height bars centered in the 9-column display.
          const startCol = Math.floor((COLS - n) / 2);
          for (let i = 0; i < n; i++) {
            drawFullHeightBar(f, coreValues[i] ?? 0, startCol + i);
          }
        } else {
          // Split into top half (grows up) and bottom half (grows down).
          // Even split: ceil(N/2) on top, floor(N/2) on bottom.
          const topCount = Math.ceil(n / 2);
          const topStart = Math.floor((COLS - topCount) / 2);
          for (let i = 0; i < topCount; i++) {
            drawHalfBarTop(f, coreValues[i] ?? 0, topStart + i);
          }
          const botCount = n - topCount;
          const botStart = Math.floor((COLS - botCount) / 2);
          for (let i = 0; i < botCount; i++) {
            drawHalfBarBot(f, coreValues[topCount + i] ?? 0, botStart + i);
          }
        }
      } else if (style === 'gpufire') {
        const now = Date.now();
        if (now - gfLastStepMs >= GF_STEP_MS) {
          gfLastStepMs = now;
          // Hotspot seeding: cols 1, 4, 7 run hot; gaps run cool (torch variant)
          for (let col = 0; col < COLS; col++) {
            const scale = GF_HOT_COLS.has(col)
              ? Math.min(1, 1.4 + Math.random() * 0.2)
              : (0.3 + Math.random() * 0.15);
            const heat = Math.min(1, gfLoad * scale);
            gfBuf[col * GF_FIRE_H + (GF_FIRE_H - 1)] = heat;
            gfBuf[col * GF_FIRE_H + (GF_FIRE_H - 2)] = heat * (0.85 + Math.random() * 0.15);
          }
          // DOOM CA: top-down so each row reads unmodified values from below
          for (let fRow = 0; fRow < GF_FIRE_H - 1; fRow++) {
            for (let col = 0; col < COLS; col++) {
              const drift  = Math.floor(Math.random() * 3) - 1;
              const srcCol = Math.max(0, Math.min(COLS - 1, col + drift));
              const heat   = gfBuf[srcCol * GF_FIRE_H + fRow + 1] ?? 0;
              gfBuf[col * GF_FIRE_H + fRow] = Math.max(0, heat - (Math.random() * 0.035 + 0.015));
            }
          }
        }
        // Stochastic blit: P(lit) = heat — creates density gradient from base to tip
        for (let col = 0; col < COLS; col++) {
          for (let fRow = 0; fRow < GF_FIRE_H; fRow++) {
            if ((gfBuf[col * GF_FIRE_H + fRow] ?? 0) > Math.random()) {
              f[col * ROWS + GF_FIRE_TOP + fRow] = 255;
            }
          }
        }
        // Temperature digits at top: hundreds @ cols 0–1, tens @ 3–4, ones @ 6–7
        if (gfTempC !== null) {
          const t = Math.max(0, Math.min(199, Math.round(gfTempC)));
          if (t >= 100) gfPutDigit(f, Math.floor(t / 100), 0, ROWS);
          gfPutDigit(f, Math.floor((t % 100) / 10), 3, ROWS);
          gfPutDigit(f, t % 10, 6, ROWS);
        }
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
