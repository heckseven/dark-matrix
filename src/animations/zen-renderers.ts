import type { Frame } from '../lib/frame.js';
import { createZenFluidRenderer } from './zen-fluid.js';
import { createZenBreathRenderer } from './zen-breath.js';
import { createZenFloraRenderer } from './zen-flora.js';
import { createZenGrassRenderer } from './zen-grass.js';
import { createZenTreeRenderer } from './zen-tree.js';
import { createZenFaceRenderer } from './zen-face.js';
import { createZenPlantRenderer } from './zen-plant.js';

export type { ZenFluidStyle } from './zen-fluid.js';
export type { ZenBreathStyle } from './zen-breath.js';
export type { ZenFloraStyle } from './zen-flora.js';
export type { ZenGrassStyle } from './zen-grass.js';
export type { ZenTreeStyle } from './zen-tree.js';
export type { ZenFaceStyle } from './zen-face.js';
export type { ZenPlantStyle } from './zen-plant.js';

export type ZenStyle =
  | 'fluid-1' | 'fluid-5' | 'fluid-9'
  | 'breath-1' | 'breath-2'
  | 'flora-1' | 'flora-5'
  | 'face-3'
  | 'grass-4'
  | 'plant-2' | 'plant-3'
  | 'tree-6';

export const ZEN_STYLES: { id: ZenStyle; label: string }[] = [
  { id: 'fluid-1',  label: 'fluid-1'  },
  { id: 'fluid-5',  label: 'fluid-5'  },
  { id: 'fluid-9',  label: 'fluid-9'  },
  { id: 'breath-1', label: 'breath-1' },
  { id: 'breath-2', label: 'breath-2' },
  { id: 'flora-1',  label: 'flora-1'  },
  { id: 'flora-5',  label: 'flora-5'  },
  { id: 'face-3',   label: 'face-3'   },
  { id: 'grass-4',  label: 'grass-4'  },
  { id: 'plant-2',  label: 'plant-2'  },
  { id: 'plant-3',  label: 'plant-3'  },
  { id: 'tree-6',   label: 'tree-6'   },
];

export const ZEN_STYLE_VALUES = ZEN_STYLES.map(s => s.id) as [string, ...string[]];

export type ZenRendererApi = {
  render(): Frame;
  stop(): void;
};

export function createZenRenderer(style: ZenStyle, side?: 'left' | 'right'): ZenRendererApi {
  switch (style) {
    case 'fluid-1':
    case 'fluid-5':
    case 'fluid-9':
      return createZenFluidRenderer(style, side);
    case 'breath-1':
    case 'breath-2':
      return createZenBreathRenderer(style, side);
    case 'flora-1':
    case 'flora-5':
      return createZenFloraRenderer(style, side);
    case 'face-3':
      return createZenFaceRenderer(style, side);
    case 'grass-4':
      return createZenGrassRenderer(style, side);
    case 'plant-2':
    case 'plant-3':
      return createZenPlantRenderer(style);
    case 'tree-6':
      return createZenTreeRenderer(style);
    default:
      return createZenFluidRenderer('fluid-1');
  }
}
