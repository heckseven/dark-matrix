import { useDeckStore, deckStore } from '../store.js';
import { Button } from './ui/button.js';
import { ScrubInput } from './ui/scrub-input.js';
import { MatrixItem } from './MatrixItem.js';
import { MatrixItemList } from './MatrixItemList.js';

export function FrameStrip({ topPadding = 0, bottomPadding = 0 }: { topPadding?: number; bottomPadding?: number }) {
  const frames = useDeckStore(s => s.frames);
  const width = useDeckStore(s => s.width);
  const activeFrameIdx = useDeckStore(s => s.activeFrameIdx);

  return (
    <MatrixItemList
      items={frames}
      getKey={(_, idx) => idx}
      renderItem={(frame, idx, dragProps) => (
        <MatrixItem
          aria-label={`Frame ${idx + 1}`}
          width={width}
          pixels={frame.pixels}
          isSelected={idx === activeFrameIdx}
          onSelect={() => deckStore.getState().setActiveFrame(idx)}
          dragIdx={dragProps.dragIdx}
          onDragOver={dragProps.onDragOver}
          onDrop={dragProps.onDrop}
          controlsTop={
            <>
              <Button
                variant="ghost"
                aria-label="Move frame up"
                tooltip="Move up"
                disabled={idx === 0}
                onClick={e => { e.stopPropagation(); deckStore.getState().moveFrame(idx, idx - 1); }}
              >↑</Button>
              <Button
                variant="ghost"
                aria-label="Move frame down"
                tooltip="Move down"
                disabled={idx === frames.length - 1}
                onClick={e => { e.stopPropagation(); deckStore.getState().moveFrame(idx, idx + 1); }}
              >↓</Button>
            </>
          }
          controlsBottom={
            <>
              <Button
                variant="ghost"
                aria-label="Clone frame"
                tooltip="Clone frame"
                onClick={e => { e.stopPropagation(); deckStore.getState().cloneFrame(idx); }}
              >⧉</Button>
              {frames.length > 1 && (
                <Button
                  variant="ghost"
                  aria-label="Delete frame"
                  tooltip="Delete frame"
                  onClick={e => { e.stopPropagation(); deckStore.getState().removeFrame(idx); }}
                >×</Button>
              )}
              <ScrubInput
                value={frame.delayMs}
                onChange={v => deckStore.getState().setFrameDelay(idx, v)}
                min={0}
                max={60000}
                suffix="ms"
                aria-label={`Frame ${idx + 1} delay (ms)`}
              />
            </>
          }
        />
      )}
      onMove={(from, to) => deckStore.getState().moveFrame(from, to)}
      onInsert={afterIdx => deckStore.getState().addFrame(afterIdx)}
      insertLabel={idx => `Insert frame after frame ${idx + 1}`}
      onAdd={() => { const s = deckStore.getState(); s.addFrame(s.activeFrameIdx); }}
      addLabel="Add frame"
      aria-label="Animation frames"
      semantic={false}
      gap="2xl"
      sideAlign="start"
      topPadding={topPadding}
      bottomPadding={bottomPadding}
    />
  );
}
