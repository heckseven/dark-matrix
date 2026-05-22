import { useDeckStore, deckStore } from '../store.js';
import type { PreviewTarget } from '../store.js';
import { exportProject } from '../files.js';
import { Button } from './ui/button.js';
import { Toggle } from './ui/toggle.js';
import { Slider } from './ui/slider.js';
import { Checkbox } from './ui/checkbox.js';
import { Text } from './ui/text.js';

const GRAY_PALETTE = [51, 102, 153, 204];

function Swatch({ value }: { value: number }) {
  const setActiveColor = useDeckStore(s => s.setActiveColor);
  return (
    <button
      type="button"
      className="w-5 h-5 p-0 border border-border rounded-sm shrink-0 cursor-pointer"
      style={{ background: `rgb(${value},${value},${value})` }}
      aria-label={`Gray value ${value}`}
      onClick={() => setActiveColor(value)}
    />
  );
}

const TARGET_OPTIONS: Array<{ label: string; value: PreviewTarget; ariaLabel: string }> = [
  { label: 'L', value: 'left',   ariaLabel: 'Preview target: Left' },
  { label: 'R', value: 'right',  ariaLabel: 'Preview target: Right' },
  { label: 'Both', value: 'both', ariaLabel: 'Preview target: Both' },
  { label: 'Mirror', value: 'mirror', ariaLabel: 'Preview target: Mirror' },
];

const Sep = () => <Text as="span" className="text-border select-none" role="separator" aria-orientation="vertical">|</Text>;

export function Toolbar() {
  const mode = useDeckStore(s => s.mode);
  const activeColor = useDeckStore(s => s.activeColor);
  const undoStack = useDeckStore(s => s.undoStack);
  const redoStack = useDeckStore(s => s.redoStack);
  const loop = useDeckStore(s => s.loop);
  const previewTarget = useDeckStore(s => s.previewTarget);
  const previewBw = useDeckStore(s => s.previewBw);
  const activeFrameIdx = useDeckStore(s => s.activeFrameIdx);

  const setMode = useDeckStore(s => s.setMode);
  const setActiveColor = useDeckStore(s => s.setActiveColor);
  const undo = useDeckStore(s => s.undo);
  const redo = useDeckStore(s => s.redo);
  const setLoop = useDeckStore(s => s.setLoop);
  const setPreviewTarget = useDeckStore(s => s.setPreviewTarget);
  const setPreviewBw = useDeckStore(s => s.setPreviewBw);
  const clearFrame = useDeckStore(s => s.clearFrame);

  return (
    <div role="toolbar" aria-label="Pixel editor tools" className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border flex-wrap">
      {/* Mode */}
      <div role="group" aria-label="Drawing mode" className="flex items-center gap-1">
        <Toggle pressed={mode === 'bw'} onPressedChange={() => setMode('bw')} pressedLabel="BW">BW</Toggle>
        <Toggle pressed={mode === 'gray'} onPressedChange={() => setMode('gray')} pressedLabel="Gray">Gray</Toggle>
      </div>

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
            aria-label="Active gray value"
            aria-valuetext={`${activeColor}`}
            onChange={e => setActiveColor(Number(e.target.value))}
          />
          <div
            role="status"
            aria-live="polite"
            aria-label={`Active color: ${activeColor}`}
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
      <label className="flex items-center gap-1 cursor-pointer">
        <Checkbox checked={loop} onChange={e => setLoop(e.target.checked)} />
        <Text as="span" size="xs">Loop</Text>
      </label>

      <Sep />

      {/* Preview target */}
      <div role="group" aria-label="Preview target" className="flex items-center gap-1">
        {TARGET_OPTIONS.map(({ label, value, ariaLabel }) => (
          <Toggle key={value} pressed={previewTarget === value} onPressedChange={() => setPreviewTarget(value)} pressedLabel={label} aria-label={ariaLabel}>
            {label}
          </Toggle>
        ))}
      </div>

      <Sep />

      {/* Preview BW toggle — gray mode only */}
      {mode === 'gray' && (
        <Toggle pressed={previewBw} onPressedChange={setPreviewBw} pressedLabel="Preview BW" title="Send frames as BW for faster hardware preview">
          Preview BW
        </Toggle>
      )}

      <Sep />

      {/* Clear + Save */}
      <Button onClick={() => clearFrame(activeFrameIdx)} aria-label="Clear active frame">Clear</Button>
      <Button onClick={() => void exportProject({ state: deckStore.getState() })} aria-label="Save project as .dmx.json">
        Save
      </Button>
    </div>
  );
}
