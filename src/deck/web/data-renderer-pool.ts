import { DATA_STYLES, createDataRenderer } from '../../animations/data-renderers.js';
import type { DataStyle, DataRenderer, DataStats } from '../../animations/data-renderers.js';

const _pool: Partial<Record<DataStyle, DataRenderer>> = {};

if (import.meta.hot) {
  import.meta.hot.dispose(() => { for (const k in _pool) delete _pool[k as DataStyle]; });
}

export function getDataRenderer(style: DataStyle): DataRenderer {
  if (!_pool[style]) _pool[style] = createDataRenderer({ style });
  return _pool[style]!;
}

export function updateAllDataRenderers(stats: DataStats): void {
  for (const { id } of DATA_STYLES) getDataRenderer(id).update(stats);
}
