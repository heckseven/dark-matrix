import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type ClaudeStyle = 'snow' | 'quota' | 'sand' | 'tetris';

export const CLAUDE_STYLES: { id: ClaudeStyle; label: string }[] = [
  { id: 'snow',    label: 'snow'    },
  { id: 'quota',   label: 'quota'   },
  { id: 'sand',    label: 'sand'    },
  { id: 'tetris',  label: 'tetris'  },
];

export type ClaudeHookEvent = {
  type: 'tool_use' | 'agent_spawn' | 'idle' | 'input_needed';
  tool?: string;
  sessionId: string;
  rawByteLen?: number;
};

export type ClaudeRendererApi = {
  onEvent(event: ClaudeHookEvent): void;
  render(): Frame;
  stop(): void;
};

const COLS = 9;
const ROWS = 34;

export function createClaudeSnowRenderer(): ClaudeRendererApi {
  // Matrix-style rain: each drop is a bright head with a tail that fades to
  // black. The fade is grayscale, which the daemon's Bayer ditherBW renders as
  // a tapering-density trail — pure black & white on hardware, classic "matrix"
  // look. At rest only the occasional stream falls; a Claude hook injects an
  // offset burst of streams scattered across the display.
  const AMBIENT = 0.008;      // idle stream spawn chance per column per frame
  const TRAIL_MIN = 6;        // shortest streak (long tails read as matrix rain)
  const TRAIL_MAX = 14;       // longest streak
  const FADE = 0.78;          // per-row tail brightness falloff
  const MAX_PER_COL = 6;      // cap so bursts can't oversaturate a column
  type Drop = { pos: number; speed: number; trail: number };
  const drops: Drop[][] = Array.from({ length: COLS }, () => []);
  let flurry = 0;             // decays each frame; raised by hook events

  function makeDrop(pos: number): Drop {
    return {
      pos,
      speed: 0.25 + Math.random() * 0.5 + flurry * 0.6,
      trail: TRAIL_MIN + Math.floor(Math.random() * (TRAIL_MAX - TRAIL_MIN + 1)),
    };
  }

  // Inject `count` streaks at staggered vertical offsets so the flurry appears
  // spread across the whole display at once rather than marching from the top.
  function burst(count: number): void {
    for (let i = 0; i < count; i++) {
      const col = Math.floor(Math.random() * COLS);
      if ((drops[col]?.length ?? 0) >= MAX_PER_COL) continue;
      drops[col]!.push(makeDrop(Math.random() * ROWS));
    }
  }

  return {
    onEvent(e) {
      if (e.type === 'agent_spawn') {
        flurry = 1.0;
        burst(18);
      } else if (e.type === 'tool_use') {
        flurry = Math.min(1, flurry + 0.6);
        burst(10);
      } else if (e.type === 'input_needed') {
        flurry = Math.min(1, flurry + 0.4);
        burst(8);
      }
      // idle: no burst; flurry decays back to ambient
    },

    render(): Frame {
      const frame = createFrame();
      flurry *= 0.90;

      for (let col = 0; col < COLS; col++) {
        const spawnRate = AMBIENT + flurry * 0.25;
        if ((drops[col]?.length ?? 0) < MAX_PER_COL && Math.random() < spawnRate) {
          drops[col]!.push(makeDrop(0));
        }

        drops[col] = (drops[col] ?? []).filter(drop => {
          drop.pos += drop.speed;
          const head = Math.round(drop.pos);
          for (let t = 0; t < drop.trail; t++) {
            const r = head - t;
            if (r >= 0 && r < ROWS) {
              // Bright head, tail fades to black — dithered to a tapering trail.
              const v = Math.round(255 * Math.pow(FADE, t));
              const idx = col * ROWS + r;
              frame[idx] = Math.max(frame[idx] ?? 0, v);
            }
          }
          return drop.pos < ROWS + drop.trail;
        });
      }

      return frame;
    },

    stop() { /* stateless */ },
  };
}

// ── Sand renderer ─────────────────────────────────────────────────────────

const _SAND_GRAIN_COOLDOWN = 2;

export function createClaudeSandRenderer(): ClaudeRendererApi {
  const settled = new Uint8Array(COLS * ROWS);
  let active: Array<[number, number]> = [];
  let draining = false;
  let pendingGrains = 0;
  let grainCooldown = 0;

  return {
    onEvent(e) {
      if (e.type === 'tool_use' || e.type === 'agent_spawn') {
        const n = e.type === 'agent_spawn' ? 3 : (Math.floor(Math.random() * 3) + 1);
        pendingGrains = Math.min(30, pendingGrains + n);
      }
    },

    render(): Frame {
      const frame = createFrame();

      if (draining) {
        const next: Array<[number, number]> = [];
        for (const [col, row] of active) {
          if (row >= 0 && row < ROWS) frame[col * ROWS + row] = 255;
          const nr = row + 1;
          if (nr < ROWS) next.push([col, nr]);
        }
        active = next;
        if (active.length === 0) draining = false;
        return frame;
      }

      if (grainCooldown > 0) {
        grainCooldown--;
      } else if (pendingGrains > 0) {
        active.push([Math.floor(COLS / 2), -1]);
        pendingGrains--;
        grainCooldown = _SAND_GRAIN_COOLDOWN;
      }

      const blocked = (c: number, r: number): boolean => {
        if (c < 0 || c >= COLS) return true;
        if (r >= ROWS) return true;
        if (r < 0) return false;
        return settled[c * ROWS + r] === 1;
      };

      const next: Array<[number, number]> = [];
      for (const [col, row] of active) {
        const nr = row + 1;
        if (!blocked(col, nr)) {
          next.push([col, nr]);
        } else {
          const tryLeft = Math.random() < 0.5;
          const d1 = tryLeft ? -1 : 1;
          const d2 = tryLeft ? 1 : -1;
          if (!blocked(col + d1, nr)) {
            next.push([col + d1, nr]);
          } else if (!blocked(col + d2, nr)) {
            next.push([col + d2, nr]);
          } else if (row < 0) {
            next.push([col, row]); // above screen, wait for space
          } else if (row < ROWS) {
            settled[col * ROWS + row] = 1;
          }
        }
      }
      active = next;

      // Drain when pile reaches the top row
      for (let c = 0; c < COLS; c++) {
        if (settled[c * ROWS] === 1) {
          const falling: Array<[number, number]> = [];
          for (let fc = 0; fc < COLS; fc++) {
            for (let fr = 0; fr < ROWS; fr++) {
              if (settled[fc * ROWS + fr]) falling.push([fc, fr]);
            }
          }
          settled.fill(0);
          active = falling;
          draining = true;
          break;
        }
      }

      for (let i = 0; i < COLS * ROWS; i++) {
        if (settled[i]) frame[i] = 255;
      }
      for (const [col, row] of active) {
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
          frame[col * ROWS + row] = 255;
        }
      }

      return frame;
    },

    stop() { /* stateless */ },
  };
}

// ── Tetris renderer ───────────────────────────────────────────────────────

const _TETRIS_BASE: Array<Array<[number, number]>> = [
  [[0,0],[1,0],[2,0],[3,0]],  // I
  [[0,0],[1,0],[0,1],[1,1]],  // O
  [[1,0],[0,1],[1,1],[2,1]],  // T
  [[1,0],[2,0],[0,1],[1,1]],  // S
  [[0,0],[1,0],[1,1],[2,1]],  // Z
  [[0,0],[0,1],[0,2],[1,2]],  // L
  [[1,0],[1,1],[0,2],[1,2]],  // J
];

function _tetrisRotateCW(cc: Array<[number, number]>): Array<[number, number]> {
  const maxR = cc.reduce((m, [, r]) => Math.max(m, r), 0);
  const rotated: Array<[number, number]> = cc.map(([c, r]) => [maxR - r, c]);
  const minC = rotated.reduce((m, [c]) => Math.min(m, c), Infinity);
  const minR = rotated.reduce((m, [, r]) => Math.min(m, r), Infinity);
  return rotated.map(([c, r]): [number, number] => [c - minC, r - minR]);
}

const _TETRIS_ROTATIONS: Array<Array<Array<[number, number]>>> = _TETRIS_BASE.map(base => {
  const rots: Array<Array<[number, number]>> = [base];
  for (let i = 0; i < 3; i++) rots.push(_tetrisRotateCW(rots[rots.length - 1]!));
  return rots;
});

const _TETRIS_DISSOLVE_LEN = 50;
const _TETRIS_CLEAR_FLASH = 12;
const _TETRIS_PIECE_CAP = 77; // max queued spawns
const _TETRIS_KEY_INTERVAL = 3;
const _TETRIS_GRAVITY_INTERVAL = 7;
type _TetrisGameState = 'playing' | 'lineclear' | 'dissolving' | 'idle';

// 1-bit display: settled blocks are stippled (checkerboard) so the solid
// falling piece stays distinguishable from the pile without using brightness.
function _tetrisStipple(i: number): boolean {
  const col = Math.floor(i / ROWS);
  const row = i % ROWS;
  return (col + row) % 2 === 0;
}

export function createClaudeTetrisRenderer(): ClaudeRendererApi {

  const board = new Uint8Array(COLS * ROWS);
  let pType = 0, pRot = 0, pCol = 0, pRow = 0;
  let targetCol = 0;
  let targetRot = 0;
  let startMoveRow = 0;
  let lastMoveTick = 0;
  let lastGravityTick = 0;
  let tick = 0;
  let pendingPieces = 0;
  let gs: _TetrisGameState = 'playing';
  let clearRows: number[] = [];
  let clearRowSet = new Set<number>();
  let clearTimer = 0;
  let dissolveFrame = 0;
  let dissolveBoard: Uint8Array | null = null;
  let dissolveTimes: Float32Array | null = null;

  function getCells(): Array<[number, number]> {
    return _TETRIS_ROTATIONS[pType % 7]![pRot % 4]!;
  }

  function pieceWidth(cc: Array<[number, number]>): number {
    return cc.reduce((m, [c]) => Math.max(m, c), 0) + 1;
  }

  function canPlace(cc: Array<[number, number]>, dc: number, dr: number): boolean {
    for (const [c, r] of cc) {
      const fc = c + dc, fr = r + dr;
      if (fc < 0 || fc >= COLS || fr >= ROWS) return false;
      if (fr >= 0 && board[fc * ROWS + fr]) return false;
    }
    return true;
  }

  function colHeight(col: number): number {
    for (let r = 0; r < ROWS; r++) {
      if (board[col * ROWS + r]) return ROWS - r;
    }
    return 0;
  }

  function spawnNext(): boolean {
    pType = Math.floor(Math.random() * 7);
    targetRot = Math.floor(Math.random() * 4);
    pRot = 0;
    const cc = getCells(); // rotation 0 — actual spawn shape
    const finalCells = _TETRIS_ROTATIONS[pType % 7]![targetRot]!; // target rotation shape used for column planning
    const wFinal = pieceWidth(finalCells);
    const w0 = pieceWidth(cc);

    if (Math.random() < 0.3) {
      // Mistake: random column
      targetCol = Math.floor(Math.random() * Math.max(1, COLS - wFinal + 1));
    } else {
      // Fill lowest area using the final rotation's footprint so the column goal makes sense on landing
      let minH = Infinity, minC = 0;
      for (let c = 0; c <= COLS - wFinal; c++) {
        let h = 0;
        for (let dc = 0; dc < wFinal; dc++) h = Math.max(h, colHeight(c + dc));
        if (h < minH) { minH = h; minC = c; }
      }
      targetCol = minC;
    }

    pCol = Math.floor((COLS - w0) / 2);
    pRow = -(cc.reduce((m, [, r]) => Math.max(m, r), 0)) - 1;
    startMoveRow = Math.floor(Math.pow(Math.random(), 2) * ROWS * 0.4);
    lastMoveTick = tick;
    lastGravityTick = tick;
    // Check first gravity step, not spawn position — spawn is always above-board so always passes
    return canPlace(cc, pCol, pRow + 1);
  }

  function lockPiece(): void {
    for (const [c, r] of getCells()) {
      const fc = c + pCol, fr = r + pRow;
      if (fr >= 0 && fr < ROWS && fc >= 0 && fc < COLS) board[fc * ROWS + fr] = 1;
    }
  }

  function findComplete(): number[] {
    const lines: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      let full = true;
      for (let c = 0; c < COLS; c++) {
        if (!board[c * ROWS + r]) { full = false; break; }
      }
      if (full) lines.push(r);
    }
    return lines;
  }

  function clearLines(rows: number[]): void {
    const sorted = rows.slice().sort((a, b) => b - a);
    for (let i = 0; i < sorted.length; i++) {
      // Each prior clear shifted this row down by 1; compensate with +i
      const r = sorted[i]! + i;
      for (let sr = r; sr > 0; sr--) {
        for (let sc = 0; sc < COLS; sc++) {
          board[sc * ROWS + sr] = board[sc * ROWS + (sr - 1)] ?? 0;
        }
      }
      for (let sc = 0; sc < COLS; sc++) board[sc * ROWS] = 0;
    }
  }

  function startDissolve(): void {
    gs = 'dissolving';
    dissolveFrame = 0;
    dissolveBoard = new Uint8Array(board);
    dissolveTimes = new Float32Array(COLS * ROWS);
    for (let i = 0; i < COLS * ROWS; i++) dissolveTimes[i] = Math.random() * _TETRIS_DISSOLVE_LEN;
  }

  function advanceOrIdle(): void {
    if (pendingPieces > 0) {
      pendingPieces--;
      gs = 'playing';
      if (!spawnNext()) startDissolve();
    } else {
      gs = 'idle';
    }
  }

  if (!spawnNext()) board.fill(0);

  return {
    onEvent(e) {
      if (gs === 'dissolving') return;
      if (e.type !== 'tool_use' && e.type !== 'agent_spawn') return;
      const n = e.type === 'agent_spawn' ? 3 : 1;
      if (gs === 'idle') {
        gs = 'playing';
        if (!spawnNext()) { startDissolve(); return; }
        pendingPieces = Math.min(_TETRIS_PIECE_CAP, pendingPieces + (n - 1));
      } else {
        pendingPieces = Math.min(_TETRIS_PIECE_CAP, pendingPieces + n);
      }
    },

    render(): Frame {
      const frame = createFrame();
      tick++;

      if (gs === 'dissolving') {
        dissolveFrame++;
        if (dissolveFrame > _TETRIS_DISSOLVE_LEN) {
          board.fill(0);
          dissolveBoard = null;
          dissolveTimes = null;
          dissolveFrame = 0;
          advanceOrIdle();
        } else if (dissolveBoard && dissolveTimes) {
          // Cells wink out by timing (not fade); survivors keep the settled stipple.
          for (let i = 0; i < COLS * ROWS; i++) {
            if (dissolveBoard[i] && (dissolveTimes[i] ?? 0) > dissolveFrame && _tetrisStipple(i)) {
              frame[i] = 255;
            }
          }
        }
        return frame;
      }

      if (gs === 'lineclear') {
        clearTimer++;
        const flash = clearTimer % 4 < 2;
        for (let col = 0; col < COLS; col++) {
          for (let row = 0; row < ROWS; row++) {
            const i = col * ROWS + row;
            if (clearRowSet.has(row)) {
              if (flash) frame[i] = 255;
            } else if (board[i] && _tetrisStipple(i)) {
              frame[i] = 255;
            }
          }
        }
        if (clearTimer >= _TETRIS_CLEAR_FLASH) {
          clearLines(clearRows);
          clearRows = [];
          clearTimer = 0;
          advanceOrIdle();
        }
        return frame;
      }

      // Idle — no active piece; render settled board and wait for events
      if (gs === 'idle') {
        for (let i = 0; i < COLS * ROWS; i++) if (board[i] && _tetrisStipple(i)) frame[i] = 255;
        return frame;
      }

      // Gravity — one row drop every _TETRIS_GRAVITY_INTERVAL ticks
      if (tick - lastGravityTick >= _TETRIS_GRAVITY_INTERVAL) {
        lastGravityTick = tick;
        const cc = getCells();
        if (canPlace(cc, pCol, pRow + 1)) {
          pRow++;
        } else {
          lockPiece();
          const complete = findComplete();
          if (complete.length > 0) {
            clearRows = complete;
            clearRowSet = new Set(complete);
            clearTimer = 0;
            gs = 'lineclear';
          } else {
            advanceOrIdle();
          }
          // Render board at lock position only — no falling piece this frame
          for (let i = 0; i < COLS * ROWS; i++) if (board[i] && _tetrisStipple(i)) frame[i] = 255;
          return frame;
        }
      }

      // Human-like keypress simulation: one rotation step and/or one column step per interval
      if (pRow >= startMoveRow && tick - lastMoveTick >= _TETRIS_KEY_INTERVAL) {
        if (pRot !== targetRot) {
          const nextRot = (pRot + 1) % 4;
          const rc = _TETRIS_ROTATIONS[pType % 7]![nextRot]!;
          if (canPlace(rc, pCol, pRow)) {
            pRot = nextRot;
          } else if (canPlace(rc, pCol - 1, pRow)) {
            pCol--;
            pRot = nextRot;
          } else if (canPlace(rc, pCol + 1, pRow)) {
            pCol++;
            pRot = nextRot;
          }
        }
        const cc = getCells();
        const w = pieceWidth(cc);
        const limit = Math.max(0, Math.min(COLS - w, targetCol));
        if (pCol < limit && canPlace(cc, pCol + 1, pRow)) pCol++;
        else if (pCol > limit && canPlace(cc, pCol - 1, pRow)) pCol--;
        lastMoveTick = tick;
      }

      // Render board — settled blocks stippled so the falling piece stays distinct
      for (let i = 0; i < COLS * ROWS; i++) {
        if (board[i] && _tetrisStipple(i)) frame[i] = 255;
      }

      // Render falling piece
      for (const [c, r] of getCells()) {
        const fc = c + pCol, fr = r + pRow;
        if (fc >= 0 && fc < COLS && fr >= 0 && fr < ROWS) frame[fc * ROWS + fr] = 255;
      }

      return frame;
    },

    stop() { /* stateless */ },
  };
}
