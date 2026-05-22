import type { LifeAlgorithm } from '../../../animations/gol.js';

export type { LifeAlgorithm };

export interface BiomePreset {
  name: string;
  algorithm: LifeAlgorithm;
  tickMs: number;
  gridSnapshot?: string;
}
