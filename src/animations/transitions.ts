import { FRAME_COLS, FRAME_ROWS, FRAME_SIZE, createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type TransitionType = 'wipe' | 'scan' | 'slide' | 'dissolve' | 'flash';
export type TransitionFrame = { frame: Frame; delayMs: number };

export function transitionDuration(frames: TransitionFrame[]): number {
  return frames.reduce((s, f) => s + f.delayMs, 0);
}

// Wipe: columns reveal left→right (entry) / blank left→right (exit)
function wipe(content: Frame, entering: boolean): TransitionFrame[] {
  const out: TransitionFrame[] = [];
  for (let col = 0; col < FRAME_COLS; col++) {
    const f = createFrame();
    for (let c = 0; c < FRAME_COLS; c++) {
      if (entering ? c <= col : c > col) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          f[c * FRAME_ROWS + row] = content[c * FRAME_ROWS + row] ?? 0;
        }
      }
    }
    out.push({ frame: f, delayMs: 50 });
  }
  return out;
}

// Scan: rows reveal top→bottom (entry) / blank top→bottom (exit), 2 rows at a time
function scan(content: Frame, entering: boolean): TransitionFrame[] {
  const STEP = 2;
  const thresholds: number[] = [];
  for (let t = STEP - 1; t < FRAME_ROWS - 1; t += STEP) thresholds.push(t);
  thresholds.push(FRAME_ROWS - 1);

  return thresholds.map(t => {
    const f = createFrame();
    for (let row = 0; row < FRAME_ROWS; row++) {
      if (entering ? row <= t : row > t) {
        for (let col = 0; col < FRAME_COLS; col++) {
          f[col * FRAME_ROWS + row] = content[col * FRAME_ROWS + row] ?? 0;
        }
      }
    }
    return { frame: f, delayMs: 20 };
  });
}

// Slide: content slides in from right (entry) / out to right (exit)
function slide(content: Frame, entering: boolean): TransitionFrame[] {
  const out: TransitionFrame[] = [];
  for (let step = 1; step <= FRAME_COLS; step++) {
    const shift = entering ? FRAME_COLS - step : step;
    const f = createFrame();
    for (let col = 0; col < FRAME_COLS; col++) {
      const src = col + shift;
      if (src < FRAME_COLS) {
        for (let row = 0; row < FRAME_ROWS; row++) {
          f[col * FRAME_ROWS + row] = content[src * FRAME_ROWS + row] ?? 0;
        }
      }
    }
    out.push({ frame: f, delayMs: 30 });
  }
  return out;
}

// Dissolve: lit pixels appear (entry) / disappear (exit) in shuffled batches
function dissolve(content: Frame, entering: boolean): TransitionFrame[] {
  const lit: number[] = [];
  for (let i = 0; i < FRAME_SIZE; i++) {
    if ((content[i] ?? 0) > 0) lit.push(i);
  }

  let seed = 0xdeadbeef;
  for (let i = lit.length - 1; i > 0; i--) {
    seed = ((seed * 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [lit[i], lit[j]] = [lit[j]!, lit[i]!];
  }

  const STEPS = 8;
  return Array.from({ length: STEPS }, (_, step) => {
    const count = Math.ceil(lit.length * (step + 1) / STEPS);
    const f = createFrame();
    if (entering) {
      for (let i = 0; i < count; i++) f[lit[i]!] = 255;
    } else {
      for (let i = count; i < lit.length; i++) f[lit[i]!] = 255;
    }
    return { frame: f, delayMs: 50 };
  });
}

// Flash: rapid strobe before (entry) / after (exit) content
function flash(content: Frame, entering: boolean): TransitionFrame[] {
  const BLACK = createFrame();
  if (entering) {
    return [
      { frame: content, delayMs: 60 },
      { frame: BLACK,   delayMs: 60 },
      { frame: content, delayMs: 60 },
      { frame: BLACK,   delayMs: 60 },
    ];
  }
  return [
    { frame: BLACK,   delayMs: 60 },
    { frame: content, delayMs: 60 },
    { frame: BLACK,   delayMs: 60 },
    { frame: content, delayMs: 60 },
    { frame: BLACK,   delayMs: 60 },
  ];
}

export function getTransitionFrames(content: Frame, type: TransitionType, entering: boolean): TransitionFrame[] {
  switch (type) {
    case 'wipe':    return wipe(content, entering);
    case 'scan':    return scan(content, entering);
    case 'slide':   return slide(content, entering);
    case 'dissolve': return dissolve(content, entering);
    case 'flash':   return flash(content, entering);
  }
}
