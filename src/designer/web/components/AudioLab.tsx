import { useState, useEffect, useRef, useMemo } from 'react';
import { AUDIO_STYLES, LAB_PARAMS, createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle, RenderCtx } from '../../../animations/audio-renderers.js';

const COLS = 9;
const ROWS = 34;
const SCALE = 6;  // CSS scale; canvas native is 9×34

// ── mock audio ─────────────────────────────────────────────────────────────

const BASE_BANDS = [210, 165, 125, 90, 62, 42, 26, 13, 6];

function mockAudio(tick: number): RenderCtx {
  const beat = Math.max(0, Math.sin(tick * 0.06)) ** 1.5;
  const slow = 0.2 + 0.8 * Math.max(0, Math.sin(tick * 0.018));
  const bands = BASE_BANDS.map((base, i) => {
    const level = i < 3 ? beat : slow;
    return Math.max(2, base * (0.15 + 0.85 * level) * (0.75 + Math.random() * 0.5));
  });
  return { bands, fftSize: 2048, gain: 1.5 };
}

// ── cell state ─────────────────────────────────────────────────────────────

type CellState = { id: string; style: AudioStyle; params: Record<string, number> };

let _uid = 0;
function uid(): string { return String(++_uid); }

function defaultParams(style: AudioStyle): Record<string, number> {
  return Object.fromEntries((LAB_PARAMS[style] ?? []).map(p => [p.key, p.default]));
}

// ── single cell ────────────────────────────────────────────────────────────

function LabCell({ cell, audioCtx, onClone, onRemove, onChange }: {
  cell: CellState;
  audioCtx: RenderCtx;
  onClone: () => void;
  onRemove: () => void;
  onChange: (style: AudioStyle, params: Record<string, number>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef(audioCtx);
  audioRef.current = audioCtx;

  const renderer = useMemo(
    () => createAudioRenderer(cell.style, cell.params),
    // Recreate when style or params change; JSON.stringify is intentional for dev-tool use
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cell.style, JSON.stringify(cell.params)],
  );
  const rendererRef = useRef(renderer);
  rendererRef.current = renderer;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const imgData = new ImageData(COLS, ROWS);
    const id = setInterval(() => {
      const frame = rendererRef.current(audioRef.current);
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const v = frame[col * ROWS + row] ?? 0;
          const idx = (row * COLS + col) * 4;
          imgData.data[idx]     = v;
          imgData.data[idx + 1] = v;
          imgData.data[idx + 2] = v;
          imgData.data[idx + 3] = 255;
        }
      }
      ctx2d.putImageData(imgData, 0, 0);
    }, 80);
    return () => clearInterval(id);
  }, []);

  const params = LAB_PARAMS[cell.style] ?? [];

  function setStyle(next: AudioStyle) {
    onChange(next, defaultParams(next));
  }

  function setParam(key: string, val: number) {
    onChange(cell.style, { ...cell.params, [key]: val });
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      background: '#111', border: '1px solid #2a2a2a', borderRadius: 4,
      padding: 10, minWidth: 160, maxWidth: 220,
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <select
          value={cell.style}
          onChange={e => setStyle(e.target.value as AudioStyle)}
          style={{
            flex: 1, background: '#1a1a1a', border: '1px solid #333', color: '#ccc',
            borderRadius: 3, padding: '2px 4px', fontSize: 11,
          }}
        >
          {AUDIO_STYLES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <button
          onClick={onClone}
          title="Clone"
          style={{ background: 'none', border: '1px solid #333', color: '#888', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}
        >⎘</button>
        <button
          onClick={onRemove}
          title="Remove"
          style={{ background: 'none', border: '1px solid #333', color: '#666', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}
        >×</button>
      </div>

      {/* preview */}
      <canvas
        ref={canvasRef}
        width={COLS}
        height={ROWS}
        style={{
          width: COLS * SCALE, height: ROWS * SCALE,
          imageRendering: 'pixelated', alignSelf: 'center',
          border: '1px solid #1e1e1e',
        }}
      />

      {/* params */}
      {params.map(p => {
        const val = cell.params[p.key] ?? p.default;
        return (
          <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
              <span>{p.label}</span>
              <span style={{ color: '#999', fontVariantNumeric: 'tabular-nums' }}>{val.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min={p.min} max={p.max} step={p.step}
              value={val}
              onChange={e => setParam(p.key, Number(e.target.value))}
              style={{ width: '100%', accentColor: '#4a9eff' }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── lab root ───────────────────────────────────────────────────────────────

const INITIAL_STYLES: AudioStyle[] = ['life-erode-4', 'life-erode-4b', 'life-erode-4c', 'life-erode-4e'];

export function AudioLab() {
  const [cells, setCells] = useState<CellState[]>(() =>
    INITIAL_STYLES.map(s => ({ id: uid(), style: s, params: defaultParams(s) }))
  );
  const [audioCtx, setAudioCtx] = useState<RenderCtx>(() => mockAudio(0));
  const tickRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current += 1;
      setAudioCtx(mockAudio(tickRef.current));
    }, 80);
    return () => clearInterval(id);
  }, []);

  function addCell() {
    setCells(cs => [...cs, { id: uid(), style: 'life-erode-4', params: defaultParams('life-erode-4') }]);
  }

  function cloneCell(cellId: string) {
    setCells(cs => {
      const idx = cs.findIndex(c => c.id === cellId);
      if (idx === -1) return cs;
      const src = cs[idx]!;
      const copy: CellState = { ...src, id: uid() };
      return [...cs.slice(0, idx + 1), copy, ...cs.slice(idx + 1)];
    });
  }

  function removeCell(cellId: string) {
    setCells(cs => cs.filter(c => c.id !== cellId));
  }

  function updateCell(cellId: string, style: AudioStyle, params: Record<string, number>) {
    setCells(cs => cs.map(c => c.id === cellId ? { ...c, style, params } : c));
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#ccc',
      padding: 20, fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: '#555' }}>audio lab</span>
        <button
          onClick={addCell}
          style={{
            background: 'none', border: '1px solid #333', color: '#888',
            borderRadius: 3, cursor: 'pointer', padding: '4px 10px', fontSize: 11,
          }}
        >+ add cell</button>
        <span style={{ fontSize: 10, color: '#333', marginLeft: 'auto' }}>
          preview is raw grayscale · hardware applies threshold at 128
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        {cells.map(cell => (
          <LabCell
            key={cell.id}
            cell={cell}
            audioCtx={audioCtx}
            onClone={() => cloneCell(cell.id)}
            onRemove={() => removeCell(cell.id)}
            onChange={(style, params) => updateCell(cell.id, style, params)}
          />
        ))}
      </div>
    </div>
  );
}
