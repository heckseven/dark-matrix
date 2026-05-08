import { useEffect, useRef } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import type { Frame } from '../store.js';
import { Button } from './ui/button.js';

const THUMB_W = 36;
const THUMB_H = 68;
const ROWS = 34;

function renderThumb(canvas: HTMLCanvasElement, frame: Frame, width: number) {
  const ctx = canvas.getContext('2d')!;
  const bin = atob(frame.pixels);
  const pixels = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pixels[i] = bin.charCodeAt(i);
  const scaleX = THUMB_W / width;
  const scaleY = THUMB_H / ROWS;
  ctx.clearRect(0, 0, THUMB_W, THUMB_H);
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = pixels[c * ROWS + r] ?? 0;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.round(c * scaleX), Math.round(r * scaleY), Math.max(1, Math.round(scaleX)), Math.max(1, Math.round(scaleY)));
    }
  }
}

function FrameCell({ frame, idx, width }: { frame: Frame; idx: number; width: number }) {
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ fromIdx: number | null }>({ fromIdx: null });

  useEffect(() => {
    if (canvasRef.current) renderThumb(canvasRef.current, frame, width);
  }, [frame, width]);

  const active = idx === activeFrameIdx;

  return (
    <div
      className={`flex flex-col items-center gap-1 cursor-pointer p-1 rounded border-2 ${active ? 'border-ring' : 'border-transparent hover:border-border'}`}
      draggable
      onClick={() => designerStore.getState().setActiveFrame(idx)}
      onDragStart={e => { dragRef.current.fromIdx = idx; e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={e => {
        e.preventDefault();
        const from = dragRef.current.fromIdx;
        if (from !== null && from !== idx) designerStore.getState().moveFrame(from, idx);
        dragRef.current.fromIdx = null;
      }}
      onDragEnd={() => { dragRef.current.fromIdx = null; }}
    >
      <canvas ref={canvasRef} width={THUMB_W} height={THUMB_H} className="[image-rendering:pixelated]" />
      <div className="flex gap-1 items-center">
        <input
          type="number" min={0} step={10}
          defaultValue={frame.delayMs}
          className="w-12 bg-input text-foreground border border-border text-center text-xs rounded px-0.5"
          onChange={e => designerStore.getState().setFrameDelay(idx, Math.max(0, Number(e.target.value)))}
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
      {frames.map((frame, idx) => (
        <FrameCell key={idx} frame={frame} idx={idx} width={width} />
      ))}
      <Button
        className="self-center shrink-0"
        title="Add frame"
        onClick={() => designerStore.getState().addFrame(activeFrameIdx)}
      >
        +
      </Button>
    </div>
  );
}
