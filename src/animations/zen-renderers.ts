import type { Frame } from '../lib/frame.js';
import { createZenFluidRenderer } from './zen-fluid.js';
import { createZenBreathRenderer } from './zen-breath.js';
import { createZenFloraRenderer } from './zen-flora.js';
import { createZenGrassRenderer } from './zen-grass.js';
import { createZenTreeRenderer } from './zen-tree.js';
import { createZenPlantRenderer } from './zen-plant.js';
import { createZenSpiroRenderer } from './zen-spiro.js';

export type { ZenFluidStyle } from './zen-fluid.js';
export type { ZenBreathStyle } from './zen-breath.js';
export type { ZenFloraStyle } from './zen-flora.js';
export type { ZenGrassStyle } from './zen-grass.js';
export type { ZenTreeStyle } from './zen-tree.js';
export type { ZenPlantStyle } from './zen-plant.js';
export type { ZenSpiroStyle } from './zen-spiro.js';

export type ZenStyle =
  | 'waves' | 'pool' | 'brush'
  | 'breathe' | 'inhale'
  | 'flora-1' | 'flora-5'
  | 'spiro-1' | 'spiro-2' | 'spiro-3'
  | 'grass'
  | 'pine' | 'plant-3'
  | 'tree-6';

export const ZEN_STYLES: { id: ZenStyle; label: string }[] = [
  { id: 'waves',   label: 'waves'   },
  { id: 'pool',    label: 'pool'    },
  { id: 'brush',   label: 'brush'   },
  { id: 'breathe', label: 'breathe' },
  { id: 'inhale',  label: 'inhale'  },
  { id: 'flora-1', label: 'flora-1' },
  { id: 'flora-5', label: 'flora-5' },
  { id: 'spiro-1', label: 'spiro-1' },
  { id: 'spiro-2', label: 'spiro-2' },
  { id: 'spiro-3', label: 'spiro-3' },
  { id: 'grass',   label: 'grass'   },
  { id: 'pine',    label: 'pine'    },
  { id: 'plant-3', label: 'plant-3' },
  { id: 'tree-6',  label: 'tree-6'  },
];

export const ZEN_STYLE_VALUES = ZEN_STYLES.map(s => s.id) as [string, ...string[]];

export type ZenRendererApi = {
  render(): Frame;
  stop(): void;
};

export function createZenRenderer(style: ZenStyle, side?: 'left' | 'right'): ZenRendererApi {
  switch (style) {
    case 'waves':
    case 'pool':
    case 'brush':
      return createZenFluidRenderer(style, side);
    case 'breathe':
    case 'inhale':
      return createZenBreathRenderer(style, side);
    case 'flora-1':
    case 'flora-5':
      return createZenFloraRenderer(style, side);
    case 'spiro-1':
    case 'spiro-2':
    case 'spiro-3':
      return createZenSpiroRenderer(style, side);
    case 'grass':
      return createZenGrassRenderer(style, side);
    case 'pine':
    case 'plant-3':
      return createZenPlantRenderer(style);
    case 'tree-6':
      return createZenTreeRenderer(style);
    default:
      return createZenFluidRenderer('waves');
  }
}
