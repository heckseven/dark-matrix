import { useDeckStore, deckStore } from '../store.js';
import { ScrubInput } from './ui/scrub-input.js';
import { MatrixItemColumn } from './MatrixItemColumn.js';
import type { Frame } from '../store.js';

export function FrameStrip({ topPadding = 0, bottomPadding = 0 }: { topPadding?: number; bottomPadding?: number }) {
  const frames        = useDeckStore(s => s.frames);
  const width         = useDeckStore(s => s.width);
  const activeFrameIdx = useDeckStore(s => s.activeFrameIdx);

  return (
    <MatrixItemColumn<Frame>
      items={frames}
      getKey={(_, idx) => idx}
      getPixels={f => f.pixels}
      getWidth={_ => width}
      getAriaLabel={(_, __, idx) => `Frame ${idx + 1}`}
      isSelected={(_, idx) => idx === activeFrameIdx}
      onSelect={(_, idx) => deckStore.getState().setActiveFrame(idx)}
      onMove={(from, to) => deckStore.getState().moveFrame(from, to)}
      onInsert={afterIdx => deckStore.getState().addFrame(afterIdx)}
      insertLabel={idx => `Insert frame after frame ${idx + 1}`}
      onDuplicate={(_, idx) => deckStore.getState().cloneFrame(idx)}
      onDelete={(_, idx) => deckStore.getState().removeFrame(idx)}
      onAdd={() => { const s = deckStore.getState(); s.addFrame(s.activeFrameIdx); }}
      addLabel="Add frame"
      extraControls={(f, idx) => (
        <ScrubInput
          value={f.delayMs}
          onChange={v => deckStore.getState().setFrameDelay(idx, v)}
          min={0}
          max={60000}
          suffix="ms"
          aria-label={`Frame ${idx + 1} delay (ms)`}
        />
      )}
      aria-label="Animation frames"
      semantic={false}
      gap="2xl"
      sideAlign="start"
      topPadding={topPadding}
      bottomPadding={bottomPadding}
    />
  );
}
