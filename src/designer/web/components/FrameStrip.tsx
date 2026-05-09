import { useState, Fragment } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import type { Frame } from '../store.js';
import { Button } from './ui/button.js';
import { ScrubInput } from './ui/scrub-input.js';
import { Stack } from './ui/stack.js';
import { MatrixPreview } from './MatrixPreview.js';

function DropLine() {
  return <div aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />;
}

function GapZone({ afterIdx, showDrop, setDropTarget }: {
  afterIdx: number;
  showDrop: boolean;
  setDropTarget: (v: number | null) => void;
}) {
  return (
    <div
      className={`-my-10 h-10 flex items-center gap-1 px-1 transition-opacity ${showDrop ? '' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(afterIdx + 1); }}
    >
      {showDrop ? (
        <div className="flex-1 h-0.5 bg-green-500 rounded-full pointer-events-none" />
      ) : (
        <>
          <div className="flex-1 h-px bg-border" />
          <Button
            variant="ghost"
            aria-label={`Insert frame after frame ${afterIdx + 1}`}
            tooltip={`Insert frame after frame ${afterIdx + 1}`}
            onClick={() => designerStore.getState().addFrame(afterIdx)}
          >
            +
          </Button>
          <div className="flex-1 h-px bg-border" />
        </>
      )}
    </div>
  );
}

function FrameCell({
  frame, idx, width, frameCount, dropTarget, setDropTarget,
}: {
  frame: Frame; idx: number; width: 9 | 18; frameCount: number;
  dropTarget: number | null; setDropTarget: (v: number | null) => void;
}) {
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);
  const active = idx === activeFrameIdx;
  const [dragging, setDragging] = useState(false);

  return (
    <div
      aria-label={`Frame ${idx + 1}`}
      tabIndex={0}
      className={`flex flex-row gap-3 p-1 rounded border-2 ${active ? 'border-ring' : 'border-transparent hover:border-border'}`}
      onClick={() => designerStore.getState().setActiveFrame(idx)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          designerStore.getState().setActiveFrame(idx);
        }
      }}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        setDropTarget(e.clientY < rect.top + rect.height / 2 ? idx : idx + 1);
      }}
      onDrop={e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const from = Number(raw);
        const target = dropTarget;
        setDropTarget(null);
        if (!Number.isInteger(from) || from < 0 || from >= frameCount || target === null) return;
        const to = from < target ? target - 1 : target;
        if (to !== from) designerStore.getState().moveFrame(from, to);
      }}
    >
      <div
        draggable
        aria-hidden="true"
        tabIndex={-1}
        onDragStart={e => { setDragging(true); e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragging(false); setDropTarget(null); }}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <MatrixPreview pixels={frame.pixels} width={width} />
      </div>
      <Stack justify="between" align="start">
        <Stack gap="xs" align="start">
          <Button
            variant="ghost"
            aria-label="Move frame up"
            tooltip="Move up"
            disabled={idx === 0}
            onClick={e => { e.stopPropagation(); designerStore.getState().moveFrame(idx, idx - 1); }}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            aria-label="Move frame down"
            tooltip="Move down"
            disabled={idx === frameCount - 1}
            onClick={e => { e.stopPropagation(); designerStore.getState().moveFrame(idx, idx + 1); }}
          >
            ↓
          </Button>
        </Stack>
        <Stack gap="xs" align="start">
          <Button
            variant="ghost"
            aria-label="Clone frame"
            onClick={e => { e.stopPropagation(); designerStore.getState().cloneFrame(idx); }}
          >
            ⧉
          </Button>
          <ScrubInput
            value={frame.delayMs}
            onChange={v => designerStore.getState().setFrameDelay(idx, v)}
            min={0}
            max={60000}
            suffix="ms"
            aria-label={`Frame ${idx + 1} delay (ms)`}
          />
        </Stack>
      </Stack>
    </div>
  );
}

export function FrameStrip() {
  const frames = useDesignerStore(s => s.frames);
  const width = useDesignerStore(s => s.width);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  return (
    <div className="flex flex-col overflow-y-auto pr-6">
      <Stack
        aria-label="Animation frames"
        gap="2xl"
        className="pt-5 pb-5"
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
        }}
      >
        {dropTarget === 0 && <DropLine />}
        {frames.map((frame, idx) => (
          <Fragment key={idx}>
            <FrameCell
              frame={frame}
              idx={idx}
              width={width}
              frameCount={frames.length}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
            />
            {idx < frames.length - 1 && (
              <GapZone afterIdx={idx} showDrop={dropTarget === idx + 1} setDropTarget={setDropTarget} />
            )}
          </Fragment>
        ))}
        {dropTarget === frames.length && <DropLine />}
      </Stack>
      <Button
        variant="ghost"
        aria-label="Add frame"
        tooltip="Add frame"
        onClick={() => { const s = designerStore.getState(); s.addFrame(s.activeFrameIdx); }}
      >
        +
      </Button>
    </div>
  );
}
