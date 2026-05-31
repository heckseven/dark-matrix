import { createFrame } from '../lib/frame.js';
import type { Frame } from '../lib/frame.js';

export type ZenStyle =
  | 'fluid-1' | 'fluid-2' | 'fluid-3' | 'fluid-4' | 'fluid-5' | 'fluid-6' | 'fluid-7' | 'fluid-8' | 'fluid-9'
  | 'breath-1' | 'breath-2' | 'breath-3'
  | 'flora-1' | 'flora-2' | 'flora-3' | 'flora-4' | 'flora-5' | 'flora-6'
  | 'grass-1' | 'grass-2' | 'grass-3' | 'grass-4' | 'grass-5' | 'grass-6'
  | 'tree-1' | 'tree-2' | 'tree-3' | 'tree-4' | 'tree-5' | 'tree-6';

export const ZEN_STYLES: { id: ZenStyle; label: string }[] = [
  { id: 'fluid-1',  label: 'fluid-1'  },
  { id: 'fluid-2',  label: 'fluid-2'  },
  { id: 'fluid-3',  label: 'fluid-3'  },
  { id: 'fluid-4',  label: 'fluid-4'  },
  { id: 'fluid-5',  label: 'fluid-5'  },
  { id: 'fluid-6',  label: 'fluid-6'  },
  { id: 'fluid-7',  label: 'fluid-7'  },
  { id: 'fluid-8',  label: 'fluid-8'  },
  { id: 'fluid-9',  label: 'fluid-9'  },
  { id: 'breath-1', label: 'breath-1' },
  { id: 'breath-2', label: 'breath-2' },
  { id: 'breath-3', label: 'breath-3' },
  { id: 'flora-1',  label: 'flora-1'  },
  { id: 'flora-2',  label: 'flora-2'  },
  { id: 'flora-3',  label: 'flora-3'  },
  { id: 'flora-4',  label: 'flora-4'  },
  { id: 'flora-5',  label: 'flora-5'  },
  { id: 'flora-6',  label: 'flora-6'  },
  { id: 'grass-1',  label: 'grass-1'  },
  { id: 'grass-2',  label: 'grass-2'  },
  { id: 'grass-3',  label: 'grass-3'  },
  { id: 'grass-4',  label: 'grass-4'  },
  { id: 'grass-5',  label: 'grass-5'  },
  { id: 'grass-6',  label: 'grass-6'  },
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

export function createZenRenderer(_style: ZenStyle): ZenRendererApi {
  return {
    render(): Frame {
      return createFrame();
    },
    stop(): void {
      // stub — no resources to release
    },
  };
}
