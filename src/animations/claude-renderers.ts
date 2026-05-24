import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type ClaudeStyle = 'matrix' | 'usage' | 'context';

export const CLAUDE_STYLES: { id: ClaudeStyle; label: string }[] = [
  { id: 'matrix',  label: 'matrix'  },
  { id: 'usage',   label: 'usage'   },
  { id: 'context', label: 'context' },
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
