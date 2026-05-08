import { useDesignerStore, designerStore } from '../store.js';
import type { PreviewTarget } from '../store.js';
import { exportProject } from '../files.js';
import { Button } from './ui/button.js';
import { Toggle } from './ui/toggle.js';
import { Slider } from './ui/slider.js';

const GRAY_PALETTE = [51, 102, 153, 204];

function Swatch({ value }: { value: number }) {
  const setActiveColor = useDesignerStore(s => s.setActiveColor);
  return (
    <button
      type="button"
      className="w-5 h-5 p-0 border border-border rounded-sm shrink-0 cursor-pointer"
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

const Sep = () => <span className="text-border select-none">|</span>;

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

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border flex-wrap">
      {/* Mode */}
      <Toggle pressed={mode === 'bw'} onPressedChange={() => setMode('bw')} pressedLabel="BW">BW</Toggle>
      <Toggle pressed={mode === 'gray'} onPressedChange={() => setMode('gray')} pressedLabel="Gray">Gray</Toggle>

      <Sep />

      {/* B&W swatches always visible */}
      <Swatch value={0} />
      <Swatch value={255} />

      {/* Gray swatches + slider + active swatch — gray mode only */}
      {mode === 'gray' && (
        <>
          {GRAY_PALETTE.map(v => <Swatch key={v} value={v} />)}
          <Slider
            min={0} max={255}
            value={activeColor}
            onChange={e => setActiveColor(Number((e.target as HTMLInputElement).value))}
          />
          <div
            className="w-5 h-5 rounded-sm border-2 border-ring shrink-0"
            style={{ background: `rgb(${activeColor},${activeColor},${activeColor})` }}
          />
        </>
      )}

      <Sep />

      {/* Undo / Redo */}
      <Button disabled={undoStack.length === 0} onClick={undo}>Undo</Button>
      <Button disabled={redoStack.length === 0} onClick={redo}>Redo</Button>

      <Sep />

      {/* Loop */}
      <label className="flex items-center gap-1 text-xs cursor-pointer">
        <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />
        Loop
      </label>

      <Sep />

      {/* Preview target */}
      {TARGET_OPTIONS.map(({ label, value }) => (
        <Toggle key={value} pressed={previewTarget === value} onPressedChange={() => setPreviewTarget(value)} pressedLabel={label}>
          {label}
        </Toggle>
      ))}

      <Sep />

      {/* Preview BW toggle — gray mode only */}
      {mode === 'gray' && (
        <Toggle pressed={previewBw} onPressedChange={setPreviewBw} pressedLabel="Preview BW" title="Send frames as BW for faster hardware preview">
          Preview BW
        </Toggle>
      )}

      <Sep />

      {/* Clear + Save */}
      <Button onClick={() => clearFrame(activeFrameIdx)} title="Clear active frame">Clear</Button>
      <Button onClick={() => void exportProject({ state: designerStore.getState() })} title="Download .dmx.json">
        Save
      </Button>
    </div>
  );
}
