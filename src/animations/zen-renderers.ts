import type { Frame } from '../lib/frame.js';
import { createZenFluidRenderer } from './zen-fluid.js';
import { createZenBreathRenderer } from './zen-breath.js';
import { createZenFloraRenderer } from './zen-flora.js';
import { createZenGrassRenderer } from './zen-grass.js';
import { createZenPlantRenderer } from './zen-plant.js';
import { createZenSpiroRenderer } from './zen-spiro.js';

export type { ZenFluidStyle } from './zen-fluid.js';
export type { ZenBreathStyle } from './zen-breath.js';
export type { ZenFloraStyle } from './zen-flora.js';
export type { ZenGrassStyle } from './zen-grass.js';
export type { ZenPlantStyle } from './zen-plant.js';
export type { ZenSpiroStyle } from './zen-spiro.js';

export type ZenStyle =
  | 'waves' | 'pool' | 'brush'
  | 'breathe' | 'inhale'
  | 'blossom'
  | 'rose' | 'orbit' | 'corona'
  | 'grass'
  | 'pine' | 'seeds';

export const ZEN_STYLES: { id: ZenStyle; label: string }[] = [
  { id: 'waves',   label: 'waves'   },
  { id: 'pool',    label: 'pool'    },
  { id: 'brush',   label: 'brush'   },
  { id: 'breathe', label: 'breathe' },
  { id: 'inhale',  label: 'inhale'  },
  { id: 'blossom', label: 'blossom' },
  { id: 'rose',    label: 'rose'    },
  { id: 'orbit',   label: 'orbit'   },
  { id: 'corona',  label: 'corona'  },
  { id: 'grass',   label: 'grass'   },
  { id: 'pine',    label: 'pine'    },
  { id: 'seeds',   label: 'seeds'   },
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
    case 'blossom':
      return createZenFloraRenderer(style, side);
    case 'rose':
    case 'orbit':
    case 'corona':
      return createZenSpiroRenderer(style, side);
    case 'grass':
      return createZenGrassRenderer(style, side);
    case 'pine':
    case 'seeds':
      return createZenPlantRenderer(style);
    default:
      return createZenFluidRenderer('waves');
  }
}
