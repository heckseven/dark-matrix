import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type ClaudeStyle = 'matrix' | 'usage' | 'context' | 'sand' | 'tetris';

export const CLAUDE_STYLES: { id: ClaudeStyle; label: string }[] = [
  { id: 'matrix',  label: 'matrix'  },
  { id: 'usage',   label: 'usage'   },
  { id: 'context', label: 'context' },
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
const TRAIL = 9;

function toolToCol(tool: string): number {
  let h = 5381;
  for (let i = 0; i < tool.length; i++) h = ((h << 5) + h) ^ tool.charCodeAt(i);
  return ((h >>> 0) % COLS);
}

export function createClaudeMatrixRenderer(): ClaudeRendererApi {
  const AMBIENT = 0.04;
  type Drop = { pos: number; speed: number };
  const colEnergy = new Float32Array(COLS);
  const drops: Drop[][] = Array.from({ length: COLS }, () => []);
  let burstEffect = 0;

  return {
    onEvent(e) {
      if (e.type === 'agent_spawn') {
        for (let c = 0; c < COLS; c++) colEnergy[c] = 0.8 + Math.random() * 0.2;
        burstEffect = 1.0;
      } else if (e.type === 'tool_use' && e.tool) {
        const primary = toolToCol(e.tool);
        colEnergy[primary] = Math.min(1.0, (colEnergy[primary] ?? 0) + 0.65);
        if (primary > 0)       colEnergy[primary - 1] = Math.min(1.0, (colEnergy[primary - 1] ?? 0) + 0.25);
        if (primary < COLS - 1) colEnergy[primary + 1] = Math.min(1.0, (colEnergy[primary + 1] ?? 0) + 0.25);
      } else if (e.type === 'input_needed') {
        for (let c = 0; c < COLS; c++) colEnergy[c] = Math.min(1.0, (colEnergy[c] ?? 0) + 0.3);
      }
      // idle: no energy bump, natural decay handles it
    },

    render(): Frame {
      const frame = createFrame();
      burstEffect *= 0.88;

      for (let col = 0; col < COLS; col++) {
        colEnergy[col] = (colEnergy[col] ?? 0) * 0.92;
        const energy = colEnergy[col] ?? 0;
        const spawnRate = AMBIENT + energy * 0.55;

        if ((drops[col]?.length ?? 0) < 5 && Math.random() < spawnRate) {
          drops[col]!.push({
            pos: 0,
            speed: 0.3 + energy * 1.6 + Math.random() * 0.3,
          });
        }

        drops[col] = (drops[col] ?? []).filter(drop => {
          drop.pos += drop.speed;
          const head = Math.round(drop.pos);
          for (let t = 0; t < TRAIL; t++) {
            const r = head - t;
            if (r >= 0 && r < ROWS) {
              const v = Math.round(255 * Math.pow(0.65, t));
              const idx = col * ROWS + r;
              frame[idx] = Math.max(frame[idx] ?? 0, v);
            }
          }
          return drop.pos < ROWS + TRAIL;
        });
      }

      // Agent burst: random scatter overlay
      if (burstEffect > 0.1) {
        for (let i = 0; i < Math.round(burstEffect * 12); i++) {
          const c = Math.floor(Math.random() * COLS);
          const r = Math.floor(Math.random() * ROWS);
          frame[c * ROWS + r] = Math.max(frame[c * ROWS + r] ?? 0, Math.round(burstEffect * 200));
        }
      }

      return frame;
    },

    stop() { /* stateless */ },
  };
}

export function createClaudeContextRenderer(): ClaudeRendererApi {
  const TOOL_BUDGET = 80;
  const BYTE_BUDGET = 150_000;

  let currentSession: string | null = null;
  let toolCount = 0;
  let approxBytes = 0;
  let pulsePhase = 0;

  return {
    onEvent(e) {
      if (e.sessionId !== currentSession) {
        currentSession = e.sessionId;
        toolCount = 0;
        approxBytes = 0;
      }
      if (e.type === 'tool_use') {
        toolCount++;
        if (e.rawByteLen) approxBytes += e.rawByteLen;
      } else if (e.type === 'agent_spawn') {
        toolCount += 3;
        if (e.rawByteLen) approxBytes += e.rawByteLen;
      }
    },

    render(): Frame {
      const frame = createFrame();
      pulsePhase += 0.06;

      if (toolCount === 0) {
        const rows = Math.round((0.15 + 0.08 * Math.sin(pulsePhase)) * ROWS * 0.3);
        for (let r = ROWS - 1; r >= ROWS - rows; r--) {
          frame[4 * ROWS + r] = 120;
        }
        return frame;
      }

      const fill = Math.min(1, Math.max(toolCount / TOOL_BUDGET, approxBytes / BYTE_BUDGET));
      const filledRows = Math.round(fill * ROWS);
      const WARNING = 0.75;
      const DANGER  = 0.9;

      for (let col = 0; col < COLS; col++) {
        for (let r = Math.max(0, ROWS - filledRows); r < ROWS; r++) {
          let brightness: number;
          if (fill > DANGER) {
            brightness = Math.random() < 0.45 ? 255 : 170;
          } else if (fill > WARNING) {
            brightness = Math.round(170 + 85 * Math.abs(Math.sin(pulsePhase)));
          } else {
            brightness = 210;
          }
          frame[col * ROWS + r] = brightness;
        }
      }

      // Warning threshold line
      if (fill > WARNING) {
        const warnRow = Math.round(ROWS - WARNING * ROWS);
        for (let col = 0; col < COLS; col++) {
          if (warnRow >= 0 && warnRow < ROWS) frame[col * ROWS + warnRow] = 255;
        }
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
          if (row >= 0 && row < ROWS) frame[col * ROWS + row] = 200;
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
        if (settled[i]) frame[i] = 200;
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
const _TETRIS_DROP_CAP = 10;
type _TetrisGameState = 'playing' | 'lineclear' | 'dissolving';

export function createClaudeTetrisRenderer(): ClaudeRendererApi {

  const board = new Uint8Array(COLS * ROWS);
  let pType = 0, pRot = 0, pCol = 0, pRow = 0;
  let targetCol = 0;
  let tick = 0;
  let pendingDrops = 0;
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
    pRot = Math.floor(Math.random() * 4);
    const cc = getCells();
    const w = pieceWidth(cc);

    if (Math.random() < 0.3) {
      // Mistake: random column
      targetCol = Math.floor(Math.random() * Math.max(1, COLS - w + 1));
    } else {
      // Try to fill the lowest area to level the board (creates complete lines over time)
      let minH = Infinity, minC = 0;
      for (let c = 0; c <= COLS - w; c++) {
        let h = 0;
        for (let dc = 0; dc < w; dc++) h = Math.max(h, colHeight(c + dc));
        if (h < minH) { minH = h; minC = c; }
      }
      targetCol = minC;
    }

    pCol = Math.floor((COLS - w) / 2);
    pRow = -(cc.reduce((m, [, r]) => Math.max(m, r), 0)) - 1;
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

  if (!spawnNext()) board.fill(0);

  return {
    onEvent(e) {
      if (gs === 'playing' && (e.type === 'tool_use' || e.type === 'agent_spawn')) {
        pendingDrops = Math.min(_TETRIS_DROP_CAP, pendingDrops + (e.type === 'agent_spawn' ? 3 : 1));
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
          gs = 'playing';
          if (!spawnNext()) board.fill(0);
          tick = 0;
        } else if (dissolveBoard && dissolveTimes) {
          const fade = 1 - dissolveFrame / _TETRIS_DISSOLVE_LEN;
          for (let i = 0; i < COLS * ROWS; i++) {
            if (dissolveBoard[i] && (dissolveTimes[i] ?? 0) > dissolveFrame) {
              frame[i] = Math.round(180 * fade + 30);
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
            if (clearRowSet.has(row)) {
              if (flash) frame[col * ROWS + row] = 255;
            } else if (board[col * ROWS + row]) {
              frame[col * ROWS + row] = 180;
            }
          }
        }
        if (clearTimer >= _TETRIS_CLEAR_FLASH) {
          clearLines(clearRows);
          clearRows = [];
          clearTimer = 0;
          gs = 'playing';
          if (!spawnNext()) startDissolve();
        }
        return frame;
      }

      // Gravity — one drop per queued event
      if (pendingDrops > 0) {
        pendingDrops--;
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
          } else if (!spawnNext()) {
            startDissolve();
          }
          // Render board at lock position only — no falling piece this frame
          for (let i = 0; i < COLS * ROWS; i++) if (board[i]) frame[i] = 180;
          return frame;
        }
      }

      // AI horizontal movement — runs every 2 ticks, decoupled from gravity
      if (tick % 2 === 0) {
        const cc = getCells();
        const w = pieceWidth(cc);
        const limit = Math.max(0, Math.min(COLS - w, targetCol));
        if (pCol < limit && canPlace(cc, pCol + 1, pRow)) pCol++;
        else if (pCol > limit && canPlace(cc, pCol - 1, pRow)) pCol--;
      }

      // Render board
      for (let i = 0; i < COLS * ROWS; i++) {
        if (board[i]) frame[i] = 180;
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
