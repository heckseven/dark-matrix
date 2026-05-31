import type { Frame } from '../lib/frame.js';
import { createZenFluidRenderer } from './zen-fluid.js';
import { createZenBreathRenderer } from './zen-breath.js';
import { createZenFloraRenderer } from './zen-flora.js';
import { createZenGrassRenderer } from './zen-grass.js';
import { createZenTreeRenderer } from './zen-tree.js';

export type { ZenFluidStyle } from './zen-fluid.js';
export type { ZenBreathStyle } from './zen-breath.js';
export type { ZenFloraStyle } from './zen-flora.js';
export type { ZenGrassStyle } from './zen-grass.js';
export type { ZenTreeStyle } from './zen-tree.js';

export type ZenStyle =
  | 'fluid-1' | 'fluid-5' | 'fluid-9'
  | 'breath-1' | 'breath-2'
  | 'flora-1' | 'flora-2' | 'flora-5'
  | 'grass-4'
  | 'tree-1' | 'tree-2' | 'tree-3' | 'tree-4' | 'tree-5' | 'tree-6';

export const ZEN_STYLES: { id: ZenStyle; label: string }[] = [
  { id: 'fluid-1',  label: 'fluid-1'  },
  { id: 'fluid-5',  label: 'fluid-5'  },
  { id: 'fluid-9',  label: 'fluid-9'  },
  { id: 'breath-1', label: 'breath-1' },
  { id: 'breath-2', label: 'breath-2' },
  { id: 'flora-1',  label: 'flora-1'  },
  { id: 'flora-2',  label: 'flora-2'  },
  { id: 'flora-5',  label: 'flora-5'  },
  { id: 'grass-4',  label: 'grass-4'  },
  { id: 'tree-1',   label: 'tree-1'   },
  { id: 'tree-2',   label: 'tree-2'   },
  { id: 'tree-3',   label: 'tree-3'   },
  { id: 'tree-4',   label: 'tree-4'   },
  { id: 'tree-5',   label: 'tree-5'   },
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
    case 'flora-2':
    case 'flora-5':
      return createZenFloraRenderer(style, side);
    case 'grass-4':
      return createZenGrassRenderer(style, side);
    case 'tree-1':
    case 'tree-2':
    case 'tree-3':
    case 'tree-4':
    case 'tree-5':
    case 'tree-6':
      return createZenTreeRenderer(style); // trees remain independent
    default:
      return createZenFluidRenderer('fluid-1');
  }
}
