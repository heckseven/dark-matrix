import type { LifeAlgorithm } from '../../../animations/gol.js';

export type { LifeAlgorithm };

export interface BiomePreset {
  name: string;
  algorithm: LifeAlgorithm;
  tickMs: number;
  spawnRate?: number;
  spawnMode?: 'scatter' | 'cluster' | 'edge';
  adaptiveSpawn?: boolean;
  adaptiveThreshold?: number;
  stasisAction?: 'off' | 'inject';
  stasisTicks?: number;
  invertMode?: 'off' | 'threshold';
  invertAt?: number;
  restoreAt?: number;
  gridSnapshot?: string;
}
