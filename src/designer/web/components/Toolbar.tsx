import { useDesignerStore, designerStore } from '../store.js';
import type { PreviewTarget } from '../store.js';
import { exportProject } from '../files.js';

const GRAY_PALETTE = [51, 102, 153, 204];

function Swatch({ value }: { value: number }) {
  const setActiveColor = useDesignerStore(s => s.setActiveColor);
  return (
    <button
      className="w-5 h-5 p-0 border border-[hsl(var(--border))] rounded-sm shrink-0"
      style={{ background: `rgb(${value},${value},${value})` }}
      title={`Value ${value}`}
      onClick={() => setActiveColor(value)}
    />
  );
}

const TARGET_OPTIONS: Array<{ label: string; value: PreviewTarget }> = [
  { label: 'L', value: 'left' },
  { label: 'R', value: 'right' },
  { label: 'Both', value: 'both' },
  { label: 'Mirror', value: 'mirror' },
];

const Sep = () => <span className="text-[hsl(var(--border))] select-none">|</span>;

export function Toolbar() {
  const mode = useDesignerStore(s => s.mode);
  const activeColor = useDesignerStore(s => s.activeColor);
  const undoStack = useDesignerStore(s => s.undoStack);
  const redoStack = useDesignerStore(s => s.redoStack);
  const loop = useDesignerStore(s => s.loop);
  const previewTarget = useDesignerStore(s => s.previewTarget);
  const previewBw = useDesignerStore(s => s.previewBw);
  const activeFrameIdx = useDesignerStore(s => s.activeFrameIdx);

  const setMode = useDesignerStore(s => s.setMode);
  const setActiveColor = useDesignerStore(s => s.setActiveColor);
  const undo = useDesignerStore(s => s.undo);
  const redo = useDesignerStore(s => s.redo);
  const setLoop = useDesignerStore(s => s.setLoop);
  const setPreviewTarget = useDesignerStore(s => s.setPreviewTarget);
  const setPreviewBw = useDesignerStore(s => s.setPreviewBw);
  const clearFrame = useDesignerStore(s => s.clearFrame);

  const btn = (active: boolean) =>
    `px-2 py-0.5 rounded border text-xs cursor-pointer ${
      active
        ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]'
        : 'bg-transparent text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]'
    }`;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[hsl(var(--border))] flex-wrap">
      {/* Mode */}
      <button className={btn(mode === 'bw')} onClick={() => setMode('bw')}>BW</button>
      <button className={btn(mode === 'gray')} onClick={() => setMode('gray')}>Gray</button>

      <Sep />

      {/* B&W swatches always visible */}
      <Swatch value={0} />
      <Swatch value={255} />

      {/* Gray swatches + slider + active swatch — gray mode only */}
      {mode === 'gray' && (
        <>
          {GRAY_PALETTE.map(v => <Swatch key={v} value={v} />)}
          <input
            type="range" min={0} max={255}
            value={activeColor}
            className="w-20 accent-[hsl(var(--primary))]"
            onChange={e => setActiveColor(Number(e.target.value))}
          />
          <div
            className="w-5 h-5 rounded-sm border-2 border-[hsl(var(--ring))] shrink-0"
            style={{ background: `rgb(${activeColor},${activeColor},${activeColor})` }}
          />
        </>
      )}

      <Sep />

      {/* Undo / Redo */}
      <button className={btn(false)} disabled={undoStack.length === 0} onClick={undo}>Undo</button>
      <button className={btn(false)} disabled={redoStack.length === 0} onClick={redo}>Redo</button>

      <Sep />

      {/* Loop */}
      <label className="flex items-center gap-1 text-xs cursor-pointer">
        <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />
        Loop
      </label>

      <Sep />

      {/* Preview target */}
      {TARGET_OPTIONS.map(({ label, value }) => (
        <button key={value} className={btn(previewTarget === value)} onClick={() => setPreviewTarget(value)}>
          {label}
        </button>
      ))}

      <Sep />

      {/* Preview BW toggle — gray mode only */}
      {mode === 'gray' && (
        <button className={btn(previewBw)} onClick={() => setPreviewBw(!previewBw)} title="Send frames as BW for faster hardware preview">
          Preview BW
        </button>
      )}

      <Sep />

      {/* Clear + Save */}
      <button className={btn(false)} onClick={() => clearFrame(activeFrameIdx)} title="Clear active frame">Clear</button>
      <button className={btn(false)} onClick={() => void exportProject({ state: designerStore.getState() })} title="Download .dmx.json">
        Save
      </button>
    </div>
  );
}
