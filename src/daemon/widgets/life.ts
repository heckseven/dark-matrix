import { createBiomeStep, createBiomeGrid, gridToFrame } from '../../animations/gol.js';
import { createFrame } from '../../lib/frame.js';
import type { Frame } from '../../lib/frame.js';
import { getTransitionFrames } from '../../animations/transitions.js';
import type { TransitionFrame } from '../../animations/transitions.js';
import { lifeBase } from '../../lib/widgets/life.js';
import type { LifeWidget } from '../../lib/widgets/life.js';
import type { DaemonWidgetDescriptor, DaemonWidgetContext, WidgetRenderer } from './types.js';
import type { Config } from '../../lib/config.js';
import type { HudConfigMessage } from './types.js';

const MAX_RANDOM_INTERVAL_MS = 3_600_000; // 1 h

export const lifeDaemonDescriptor: DaemonWidgetDescriptor<LifeWidget> = {
  ...lifeBase,

  createRenderer(widget, ctx): WidgetRenderer {
    const biomes = ctx.currentConfig.biome_presets ?? [];
    if (biomes.length === 0) {
      const empty = createFrame();
      return { render: () => empty, stop() {} };
    }

    const isRandom = widget.biomeName === 'random';
    const randomIntervalMs = widget.randomIntervalMs ?? 30000;

    function pickBiome(exclude?: typeof biomes[0]): typeof biomes[0] {
      if (biomes.length === 1 || !exclude) return biomes[Math.floor(Math.random() * biomes.length)]!;
      const pool = biomes.filter(b => b !== exclude);
      return pool[Math.floor(Math.random() * pool.length)] ?? biomes[0]!;
    }

    const foundBiome = isRandom ? undefined : biomes.find(b => b.name === widget.biomeName);
    if (!isRandom && !foundBiome) console.warn(`[life] unknown biomeName "${widget.biomeName}", falling back to "${biomes[0]!.name}"`);
    let activeBiome = isRandom ? pickBiome() : (foundBiome ?? biomes[0]!);
    let stepFn = createBiomeStep(activeBiome.algorithm);
    let grid = createBiomeGrid(activeBiome.gridSnapshot);

    let lastRenderMs: number | null = null;
    let tickAccum   = 0;
    let rerunAccum  = 0;
    let genCount    = 0;
    let stasisCount  = 0;
    let prevGridStr  = '';
    let prevGridStr2 = '';
    let randomAccum  = 0;

    type TransState = 'running' | 'dissolve-out' | 'dissolve-in';
    let transState: TransState = 'running';
    let transFrames: TransitionFrame[] = [];
    let transIdx    = 0;
    let transElapsed = 0;
    let pendingBiome: typeof activeBiome | null = null;

    function switchToBiome(next: typeof activeBiome) {
      activeBiome  = next;
      stepFn = createBiomeStep(next.algorithm);
      grid = createBiomeGrid(next.gridSnapshot);
      genCount     = 0;
      rerunAccum   = 0;
      stasisCount  = 0;
      prevGridStr  = '';
      prevGridStr2 = '';
      randomAccum  = 0;
    }

    return {
      render(now, _audioCtx) {
        const nowMs = now.getTime();
        const dt = lastRenderMs !== null ? nowMs - lastRenderMs : 0;
        lastRenderMs = nowMs;

        if (transState !== 'running') {
          transElapsed += dt;
          while (transFrames[transIdx] !== undefined && transElapsed >= (transFrames[transIdx]!.delayMs)) {
            transElapsed -= transFrames[transIdx]!.delayMs;
            transIdx++;
          }
          if (transIdx >= transFrames.length) {
            if (transState === 'dissolve-out' && pendingBiome !== null) {
              switchToBiome(pendingBiome);
              pendingBiome = null;
              const inFrame = gridToFrame(grid);
              transFrames  = getTransitionFrames(inFrame, 'dissolve', true);
              transIdx     = 0;
              transElapsed = 0;
              transState   = 'dissolve-in';
            } else {
              transState = 'running';
            }
          }
          const frameIdx = Math.min(transIdx, transFrames.length - 1);
          return transFrames[frameIdx]?.frame ?? gridToFrame(grid);
        }

        // Advance simulation at tickMs cadence
        tickAccum  += dt;
        rerunAccum += dt;
        if (isRandom) randomAccum += dt;

        const tickMs = activeBiome.tickMs;
        while (tickAccum >= tickMs) {
          tickAccum -= tickMs;
          grid = stepFn(grid);
          genCount++;

          // Stasis detection — period-1 (still-life) and period-2 (oscillator)
          const gs = grid.join(',');
          if (gs === prevGridStr || gs === prevGridStr2) {
            stasisCount++;
            const stasisAction = activeBiome.stasisAction ?? 'off';
            const stasisTicks  = activeBiome.stasisTicks  ?? 5;
            if (stasisAction !== 'off' && stasisCount >= stasisTicks) {
              if (stasisAction === 'inject') {
                const rate = Math.max(9, (activeBiome.spawnRate ?? 3) * 3);
                for (let k = 0; k < rate; k++) grid[Math.floor(Math.random() * grid.length)] = 1;
              } else {
                grid = createBiomeGrid(activeBiome.gridSnapshot);
                prevGridStr  = '';
                prevGridStr2 = '';
              }
              stasisCount = 0;
            }
          } else {
            stasisCount = 0;
          }
          prevGridStr2 = prevGridStr;
          prevGridStr  = gs;
        }

        // Rerun checks
        const rerunMode = activeBiome.rerunMode ?? 'off';
        if (rerunMode === 'time' && rerunAccum >= (activeBiome.rerunAfterMs ?? 60000)) {
          grid = createBiomeGrid(activeBiome.gridSnapshot);
          genCount = 0; rerunAccum = 0; stasisCount = 0;
          prevGridStr = ''; prevGridStr2 = '';
          if (isRandom) randomAccum = 0;
        } else if (rerunMode === 'generations' && genCount >= (activeBiome.rerunAfterGenerations ?? 500)) {
          grid = createBiomeGrid(activeBiome.gridSnapshot);
          genCount = 0; rerunAccum = 0; stasisCount = 0;
          prevGridStr = ''; prevGridStr2 = '';
          if (isRandom) randomAccum = 0;
        }

        // Random cycling
        if (isRandom && randomAccum >= randomIntervalMs) {
          pendingBiome = pickBiome(activeBiome);
          const outFrame = gridToFrame(grid);
          transFrames  = getTransitionFrames(outFrame, 'dissolve', false);
          transIdx     = 0;
          transElapsed = 0;
          transState   = 'dissolve-out';
          randomAccum  = 0;
        }

        return gridToFrame(grid);
      },
      stop() { /* stateless */ },
    };
  },

  extractParams(m, side, config): LifeWidget | null {
    const biomeName = side === 'left' ? m.leftBiomeName : m.rightBiomeName;
    if (typeof biomeName !== 'string' || biomeName.length === 0) return null;
    const biomes = config.biome_presets ?? [];
    // Validate biomeName against known biomes (or 'random')
    if (biomeName !== 'random' && !biomes.find(b => b.name === biomeName)) return null;
    const rawInterval = side === 'left' ? m.leftRandomIntervalMs : m.rightRandomIntervalMs;
    const randomIntervalMs = typeof rawInterval === 'number' && Number.isFinite(rawInterval) && rawInterval > 0 ? Math.min(rawInterval, MAX_RANDOM_INTERVAL_MS) : undefined;
    return { widget: 'life', biomeName, ...(randomIntervalMs !== undefined ? { randomIntervalMs } : {}) };
  },
};
