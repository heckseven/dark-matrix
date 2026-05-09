import { useRef } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import type { Frame } from '../store.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { MatrixPreview } from './MatrixPreview.js';


function FrameCell({ frame, idx, width }: { frame: Frame; idx: number; width: number }) {
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);
  const dragRef = useRef<number | null>(null);

  const active = idx === activeFrameIdx;

  return (
    <div
      role="listitem"
      className={`flex flex-col items-center gap-1 cursor-pointer p-1 rounded border-2 ${active ? 'border-ring' : 'border-transparent hover:border-border'}`}
      draggable
      onClick={() => designerStore.getState().setActiveFrame(idx)}
      onDragStart={e => { dragRef.current = idx; e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={e => {
        e.preventDefault();
        const from = dragRef.current;
        if (from !== null && from !== idx) designerStore.getState().moveFrame(from, idx);
        dragRef.current = null;
      }}
      onDragEnd={() => { dragRef.current = null; }}
    >
      <MatrixPreview pixels={frame.pixels} width={width as 9 | 18} />
      <div className="flex gap-1 items-center">
        <Input
          type="number" min={0} max={60000} step={10}
          defaultValue={frame.delayMs}
          aria-label={`Frame ${idx + 1} delay in milliseconds`}
          className="w-12 text-center"
          onChange={e => designerStore.getState().setFrameDelay(idx, Math.max(0, Math.min(60000, Number(e.target.value))))}
          onClick={e => e.stopPropagation()}
        />
        <Button
          variant="destructive"
          aria-label="Delete frame"
          onClick={e => { e.stopPropagation(); designerStore.getState().removeFrame(idx); }}
        >
          ×
        </Button>
      </div>
    </div>
  );
}

export function FrameStrip() {
  const frames = useDesignerStore(s => s.frames);
  const width = useDesignerStore(s => s.width);
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);

  return (
    <div className="flex items-start gap-1 p-2 border-t border-border overflow-x-auto">
      <div role="list" aria-label="Animation frames" className="flex items-start gap-1">
        {frames.map((frame, idx) => (
          <FrameCell key={idx} frame={frame} idx={idx} width={width} />
        ))}
      </div>
      <Button
        className="self-center shrink-0"
        aria-label="Add frame"
        onClick={() => designerStore.getState().addFrame(activeFrameIdx)}
      >
        +
      </Button>
    </div>
  );
}
