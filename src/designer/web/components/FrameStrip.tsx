import { useState, useRef, useEffect, Fragment } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import type { Frame } from '../store.js';
import { Button } from './ui/button.js';
import { ScrubInput } from './ui/scrub-input.js';
import { Stack } from './ui/stack.js';
import { MatrixPreview } from './MatrixPreview.js';

function DropLine() {
  return <div aria-hidden="true" className="-my-[19px] h-0.5 bg-green-500 rounded-full pointer-events-none" />;
}

function GapZone({ afterIdx, showDrop, setDropTarget, frameCount }: {
  afterIdx: number;
  showDrop: boolean;
  setDropTarget: (v: number | null) => void;
  frameCount: number;
}) {
  return (
    <div
      className={`-my-10 h-10 flex items-center gap-1 px-1 transition-opacity ${showDrop ? '' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}`}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(afterIdx + 1); }}
      onDrop={e => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const from = Number(raw);
        setDropTarget(null);
        if (!Number.isInteger(from) || from < 0 || from >= frameCount) return;
        const target = afterIdx + 1;
        const to = from < target ? target - 1 : target;
        if (to !== from) designerStore.getState().moveFrame(from, to);
      }}
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

  const c = { position: 'absolute', width: 16, height: 16, pointerEvents: 'none' } as const;
  const b = `1px solid ${active ? 'white' : 'rgba(255,255,255,0.35)'}`;

  return (
    <div
      aria-label={`Frame ${idx + 1}`}
      tabIndex={0}
      className="group relative flex flex-row gap-3 p-1 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
      <div aria-hidden="true" className={`absolute inset-0 pointer-events-none transition-opacity ${active ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
        <span style={{ ...c, top: 0,    left: 0,    borderTop: b, borderLeft: b }} />
        <span style={{ ...c, top: 0,    right: 0,   borderTop: b, borderRight: b }} />
        <span style={{ ...c, bottom: 0, left: 0,    borderBottom: b, borderLeft: b }} />
        <span style={{ ...c, bottom: 0, right: 0,   borderBottom: b, borderRight: b }} />
      </div>
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
          <div className="flex">
            <Button
              variant="ghost"
              aria-label="Clone frame"
              onClick={e => { e.stopPropagation(); designerStore.getState().cloneFrame(idx); }}
            >
              ⧉
            </Button>
            {frameCount > 1 && (
              <Button
                variant="ghost"
                aria-label="Delete frame"
                tooltip="Delete frame"
                onClick={e => { e.stopPropagation(); designerStore.getState().removeFrame(idx); }}
              >
                ×
              </Button>
            )}
          </div>
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

const SCROLL_ZONE = 60;
const SCROLL_SPEED = 8;
const SCROLL_TICK = 40;

export function FrameStrip({ topPadding = 0 }: { topPadding?: number }) {
  const frames = useDesignerStore(s => s.frames);
  const width = useDesignerStore(s => s.width);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let dir: 'up' | 'down' | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function setDir(next: 'up' | 'down' | null) {
      if (next === dir) return;
      dir = next;
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
      if (next !== null) {
        intervalId = setInterval(
          () => el.scrollBy({ top: next === 'up' ? -SCROLL_SPEED : SCROLL_SPEED }),
          SCROLL_TICK,
        );
      }
    }

    function onDragOver(e: DragEvent) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (y < SCROLL_ZONE) setDir('up');
      else if (y > rect.height - SCROLL_ZONE) setDir('down');
      else setDir(null);
    }

    function stop() { setDir(null); }

    el.addEventListener('dragover', onDragOver);
    document.addEventListener('dragend', stop);
    document.addEventListener('drop', stop);

    return () => {
      stop();
      el.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragend', stop);
      document.removeEventListener('drop', stop);
    };
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex flex-col overflow-y-auto pr-6 flex-1 min-h-0"
      style={{ paddingTop: topPadding }}
    >
      <Stack
        aria-label="Animation frames"
        gap="2xl"
        className="pb-5"
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
              <GapZone afterIdx={idx} showDrop={dropTarget === idx + 1} setDropTarget={setDropTarget} frameCount={frames.length} />
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
