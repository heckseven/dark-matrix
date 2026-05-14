import { useEffect, useRef, useState, useCallback } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { useDesignerStore, designerStore } from '../store.js';
import type { ClockFace, DataStyle } from '../store.js';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';
import type { ClockRenderer } from '../../../animations/clock-renderers.js';
import { DATA_STYLES, createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataRenderer, DataStats } from '../../../animations/data-renderers.js';

const COLS = 9;
const ROWS = 34;

// ── clock face preview ────────────────────────────────────────────────────

const _clockCache: Record<'left' | 'right', Partial<Record<ClockFace, ClockRenderer>>> = { left: {}, right: {} };
if (import.meta.hot) {
  import.meta.hot.dispose(() => { _clockCache.left = {}; _clockCache.right = {}; });
}

function renderClockToB64(face: ClockFace, now: Date, side: 'left' | 'right'): string {
  const cache = _clockCache[side];
  if (!cache[face]) cache[face] = createClockRenderer(face);
  const frame = cache[face]!({ now, side });
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

type ClockPair = { left: string; right: string };

function initClockPixels(now: Date): Record<ClockFace, ClockPair> {
  const m = {} as Record<ClockFace, ClockPair>;
  for (const { id } of CLOCK_FACES) {
    m[id] = { left: renderClockToB64(id, now, 'left'), right: renderClockToB64(id, now, 'right') };
  }
  return m;
}

// ── data widget preview ───────────────────────────────────────────────────

const _dataRenderers: Partial<Record<DataStyle, DataRenderer>> = {};

function getDataRenderer(style: DataStyle): DataRenderer {
  if (!_dataRenderers[style]) _dataRenderers[style] = createDataRenderer({ style });
  return _dataRenderers[style]!;
}

function renderDataToB64(style: DataStyle): string {
  const frame = getDataRenderer(style).render();
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

// ── shared card component ─────────────────────────────────────────────────

function HudCard({
  id,
  label,
  activeLeft,
  activeRight,
  pixels,
  dualModule,
  onSelectLeft,
  onSelectRight,
}: {
  id: string;
  label: string;
  activeLeft: boolean;
  activeRight: boolean;
  pixels: string;
  dualModule: boolean;
  onSelectLeft: () => void;
  onSelectRight: () => void;
}) {
  const active = activeLeft || activeRight;
  const labelId = `hud-label-${id}`;
  const c = { position: 'absolute' as const, width: 16, height: 16, pointerEvents: 'none' as const };
  const b = `1px solid ${active ? 'white' : 'rgba(255,255,255,0.35)'}`;

  return (
    <div className="group relative flex flex-col gap-3 items-center rounded-sm p-3">
      <div aria-hidden="true" className={`absolute inset-0 pointer-events-none transition-opacity ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}>
        <span aria-hidden="true" style={{ ...c, top: 0,    left: 0,    borderTop: b, borderLeft: b }} />
        <span aria-hidden="true" style={{ ...c, top: 0,    right: 0,   borderTop: b, borderRight: b }} />
        <span aria-hidden="true" style={{ ...c, bottom: 0, left: 0,    borderBottom: b, borderLeft: b }} />
        <span aria-hidden="true" style={{ ...c, bottom: 0, right: 0,   borderBottom: b, borderRight: b }} />
      </div>
      <MatrixPreview pixels={pixels} width={dualModule ? 18 : 9} />
      <span id={labelId} className="font-mono text-xs text-foreground">{label}</span>
      {dualModule ? (
        <div role="group" aria-labelledby={labelId} className="flex gap-1 font-mono text-xs">
          <button
            type="button"
            aria-label={`L — ${label} left`}
            aria-pressed={activeLeft}
            className={`px-2 py-0.5 border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-1 ${activeLeft ? 'border-white text-white' : 'border-foreground/30 text-foreground/50 hover:text-foreground hover:border-foreground/60'}`}
            onClick={onSelectLeft}
          >L</button>
          <button
            type="button"
            aria-label={`R — ${label} right`}
            aria-pressed={activeRight}
            className={`px-2 py-0.5 border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-1 ${activeRight ? 'border-white text-white' : 'border-foreground/30 text-foreground/50 hover:text-foreground hover:border-foreground/60'}`}
            onClick={onSelectRight}
          >R</button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={label}
          aria-pressed={activeLeft}
          className="absolute inset-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]"
          onClick={onSelectLeft}
        />
      )}
    </div>
  );
}

// ── full hud config payload ───────────────────────────────────────────────

function buildConfig() {
  const s = designerStore.getState();
  return {
    leftWidget:     s.hudLeftWidget,
    leftFace:       s.hudLeftFace,
    leftDataStyle:  s.hudLeftDataStyle,
    rightWidget:    s.hudRightWidget,
    rightFace:      s.hudRightFace,
    rightDataStyle: s.hudRightDataStyle,
  };
}

// ── main component ────────────────────────────────────────────────────────

export function HudPanel({ dualModule = false, fastClock = false }: { dualModule?: boolean; fastClock?: boolean }) {
  const hudLeftFace      = useDesignerStore(s => s.hudLeftFace);
  const hudRightFace     = useDesignerStore(s => s.hudRightFace);
  const hudLeftWidget    = useDesignerStore(s => s.hudLeftWidget);
  const hudRightWidget   = useDesignerStore(s => s.hudRightWidget);
  const hudLeftDataStyle = useDesignerStore(s => s.hudLeftDataStyle);
  const hudRightDataStyle= useDesignerStore(s => s.hudRightDataStyle);

  const wsRef     = useRef<WebSocket | null>(null);
  const simTimeRef = useRef<number>(Date.now());
  const fastClockRef = useRef(fastClock);

  const [clockPixels, setClockPixels] = useState<Record<ClockFace, ClockPair>>(() => initClockPixels(new Date()));
  const [dataPixels,  setDataPixels]  = useState<Partial<Record<DataStyle, string>>>({});

  // clock animation loop
  const renderAllClocks = useCallback(() => {
    if (fastClockRef.current) simTimeRef.current += 60_000;
    else simTimeRef.current = Date.now();
    setClockPixels(initClockPixels(new Date(simTimeRef.current)));
  }, []);

  useEffect(() => {
    simTimeRef.current = fastClock ? simTimeRef.current : Date.now();
    fastClockRef.current = fastClock;
    const id = setInterval(renderAllClocks, fastClock ? 150 : 100);
    return () => clearInterval(id);
  }, [fastClock, renderAllClocks]);

  // data renderer refresh (re-renders all styles from shared renderer instances)
  function refreshDataPixels() {
    const next: Partial<Record<DataStyle, string>> = {};
    for (const { id } of DATA_STYLES) next[id] = renderDataToB64(id);
    setDataPixels(next);
  }

  // WebSocket: hud-mode-start, data-stats streaming
  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'hud-mode-start', ...buildConfig() }));
      ws.send(JSON.stringify({ type: 'data-stats-start' }));
    });

    ws.addEventListener('message', (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { type: string } & Partial<DataStats>;
        if (msg.type === 'data-stats') {
          const stats: DataStats = {
            cpuPct:   msg.cpuPct   ?? 0,
            ramPct:   msg.ramPct   ?? 0,
            netRxBps: msg.netRxBps ?? 0,
            netTxBps: msg.netTxBps ?? 0,
          };
          for (const { id } of DATA_STYLES) getDataRenderer(id).update(stats);
          refreshDataPixels();
        }
      } catch { /* ignore */ }
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data-stats-stop' }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, []);

  function sendConfig() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'hud-config', ...buildConfig() }));
  }

  // clock face selection
  function selectClockLeft(face: ClockFace) {
    designerStore.getState().setHudLeftWidget('clock');
    designerStore.getState().setHudLeftFace(face);
    sendConfig();
  }
  function selectClockRight(face: ClockFace) {
    designerStore.getState().setHudRightWidget('clock');
    designerStore.getState().setHudRightFace(face);
    sendConfig();
  }
  function selectClockBoth(face: ClockFace) {
    designerStore.getState().setHudLeftWidget('clock');
    designerStore.getState().setHudRightWidget('clock');
    designerStore.getState().setHudLeftFace(face);
    designerStore.getState().setHudRightFace(face);
    sendConfig();
  }

  // data widget selection
  function selectDataLeft(style: DataStyle) {
    designerStore.getState().setHudLeftWidget('data', style);
    sendConfig();
  }
  function selectDataRight(style: DataStyle) {
    designerStore.getState().setHudRightWidget('data', style);
    sendConfig();
  }
  function selectDataBoth(style: DataStyle) {
    designerStore.getState().setHudLeftWidget('data', style);
    designerStore.getState().setHudRightWidget('data', style);
    sendConfig();
  }

  const clockFaceActiveLeft  = (id: ClockFace) => hudLeftWidget  === 'clock' && hudLeftFace  === id;
  const clockFaceActiveRight = (id: ClockFace) => hudRightWidget === 'clock' && hudRightFace === id;
  const dataActiveLeft  = (id: DataStyle) => hudLeftWidget  === 'data' && hudLeftDataStyle  === id;
  const dataActiveRight = (id: DataStyle) => hudRightWidget === 'data' && hudRightDataStyle === id;

  return (
    <div className="flex-1 flex flex-col items-start justify-center gap-8 px-8 py-8 overflow-y-auto">
      <div role="group" aria-label="Clock face" className="grid grid-cols-4 gap-6">
        {CLOCK_FACES.map(({ id, label }) => {
          const { left: leftPx, right: rightPx } = clockPixels[id];
          const pixels = dualModule ? btoa(atob(leftPx) + atob(rightPx)) : leftPx;
          return (
            <HudCard
              key={id}
              id={`clock-${id}`}
              label={label}
              activeLeft={clockFaceActiveLeft(id)}
              activeRight={clockFaceActiveRight(id)}
              pixels={pixels}
              dualModule={dualModule}
              onSelectLeft={() => dualModule ? selectClockLeft(id) : selectClockBoth(id)}
              onSelectRight={() => selectClockRight(id)}
            />
          );
        })}
      </div>
      <div role="group" aria-label="Data widget" className="grid grid-cols-4 gap-6">
        {DATA_STYLES.map(({ id, label }) => {
          const base = dataPixels[id] ?? renderDataToB64(id);
          const pixels = dualModule ? btoa(atob(base) + atob(base)) : base;
          return (
            <HudCard
              key={id}
              id={`data-${id}`}
              label={label}
              activeLeft={dataActiveLeft(id)}
              activeRight={dataActiveRight(id)}
              pixels={pixels}
              dualModule={dualModule}
              onSelectLeft={() => dualModule ? selectDataLeft(id) : selectDataBoth(id)}
              onSelectRight={() => selectDataRight(id)}
            />
          );
        })}
      </div>
    </div>
  );
}
