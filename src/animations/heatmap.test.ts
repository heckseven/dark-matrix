import { describe, it, expect } from 'vitest';
import {
  createHeatmapState,
  bumpTool,
  tickHeatmap,
  renderHeatmap,
} from './heatmap.js';

describe('bumpTool', () => {
  it('increases score for a known tool', () => {
    const s = createHeatmapState();
    bumpTool(s, 'Bash');
    expect(s.scores[0]).toBeGreaterThan(0);
  });

  it('routes unknown tools to the last column', () => {
    const s = createHeatmapState();
    bumpTool(s, 'UnknownTool');
    expect(s.scores[17]).toBeGreaterThan(0);
  });

  it('caps score at ROWS (34)', () => {
    const s = createHeatmapState();
    for (let i = 0; i < 20; i++) bumpTool(s, 'Bash');
    expect(s.scores[0]).toBeLessThanOrEqual(34);
  });

  it('sets peak when bar rises', () => {
    const s = createHeatmapState();
    bumpTool(s, 'Read');
    expect(s.peaks[1]).toBeGreaterThan(0);
  });

  it('refreshes peak hold timer on repeated bumps', () => {
    const s = createHeatmapState();
    bumpTool(s, 'Edit');
    s.peakHoldTimers[2] = 1;
    bumpTool(s, 'Edit');
    expect(s.peakHoldTimers[2]).toBeGreaterThan(1);
  });
});

describe('tickHeatmap', () => {
  it('decays scores toward zero', () => {
    const s = createHeatmapState();
    bumpTool(s, 'Bash');
    const before = s.scores[0]!;
    tickHeatmap(s);
    expect(s.scores[0]).toBeLessThan(before);
  });

  it('zeroes out scores below 0.5', () => {
    const s = createHeatmapState();
    s.scores[0] = 0.4;
    tickHeatmap(s);
    expect(s.scores[0]).toBe(0);
  });

  it('holds peak during hold phase', () => {
    const s = createHeatmapState();
    bumpTool(s, 'Bash');
    const peakBefore = s.peaks[0];
    tickHeatmap(s);
    expect(s.peaks[0]).toBe(peakBefore);
  });

  it('peak falls after hold phase expires', () => {
    const s = createHeatmapState();
    bumpTool(s, 'Bash');
    const originalPeak = s.peaks[0]!;
    // Exhaust hold timer and all fall timers
    s.peakHoldTimers[0] = 0;
    s.peakFallTimers[0] = 0;
    s.scores[0] = 0; // bar is gone so peak can fall freely
    tickHeatmap(s);
    expect(s.peaks[0]).toBeLessThan(originalPeak);
  });

  it('peak never drops below bar height', () => {
    const s = createHeatmapState();
    bumpTool(s, 'Bash');
    s.peakHoldTimers[0] = 0;
    s.peakFallTimers[0] = 0;
    for (let i = 0; i < 100; i++) tickHeatmap(s);
    const barHeight = Math.round(s.scores[0] ?? 0);
    expect(s.peaks[0]).toBeGreaterThanOrEqual(barHeight);
  });
});

describe('renderHeatmap', () => {
  it('returns two frames of correct size', () => {
    const s = createHeatmapState();
    const [left, right] = renderHeatmap(s);
    expect(left.length).toBe(9 * 34);
    expect(right.length).toBe(9 * 34);
  });

  it('blank state produces all-zero frames', () => {
    const s = createHeatmapState();
    const [left, right] = renderHeatmap(s);
    expect(left.every(v => v === 0)).toBe(true);
    expect(right.every(v => v === 0)).toBe(true);
  });

  it('bar fills bottom rows for an active column', () => {
    const s = createHeatmapState();
    // Force score to exactly 5 for Bash (col 0, left module)
    s.scores[0] = 5;
    s.peaks[0] = 5;
    const [left] = renderHeatmap(s);
    // Rows 29-33 (bottom 5 rows of col 0) should be lit
    for (let row = 29; row < 34; row++) {
      expect(left[0 * 34 + row]).toBeGreaterThan(0);
    }
    // Row 28 should be dark (above bar, peak is at row 29 = 34-5)
    // Peak pixel is at row 29, bar starts at row 29 too — overlaps, so row 28 dark
    expect(left[0 * 34 + 28]).toBe(0);
  });

  it('peak pixel sits above bar when bar has decayed', () => {
    const s = createHeatmapState();
    s.scores[0] = 2;  // bar height 2: rows 32-33 lit
    s.peaks[0] = 5;   // peak at row 29
    const [left] = renderHeatmap(s);
    expect(left[0 * 34 + 29]).toBe(255); // peak pixel bright
    expect(left[0 * 34 + 30]).toBe(0);   // gap between peak and bar
    expect(left[0 * 34 + 32]).toBeGreaterThan(0); // bar
  });

  it('right module uses correct columns for right-module tools', () => {
    const s = createHeatmapState();
    // TodoWrite = col 9, which is col 0 on right module
    s.scores[9] = 5;
    s.peaks[9] = 5;
    const [left, right] = renderHeatmap(s);
    expect(left.every(v => v === 0)).toBe(true); // left untouched
    expect(right[0 * 34 + 33]).toBeGreaterThan(0); // bottom of col 0 on right
  });
});
