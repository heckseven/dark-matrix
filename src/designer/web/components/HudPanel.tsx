import { useEffect, useRef, useState, useCallback } from 'react';
import { MatrixPreview } from './MatrixPreview.js';
import { useDesignerStore, designerStore } from '../store.js';
import type { ClockFace } from '../store.js';
import { CLOCK_FACES, createClockRenderer } from '../../../animations/clock-renderers.js';

const COLS = 9;
const ROWS = 34;

function renderFaceToB64(face: ClockFace, now = new Date()): string {
  const renderer = createClockRenderer(face);
  const frame = renderer({ now });
  const out = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
  return btoa(String.fromCharCode(...out));
}

function initPixels(now = new Date()): Record<ClockFace, string> {
  const m = {} as Record<ClockFace, string>;
  for (const { id } of CLOCK_FACES) m[id] = renderFaceToB64(id, now);
  return m;
}

function ClockFaceCard({
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
  const labelId = `clock-label-${id}`;
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

export function HudPanel({ dualModule = false, fastClock = false }: { dualModule?: boolean; fastClock?: boolean }) {
  const hudLeftFace  = useDesignerStore(s => s.hudLeftFace);
  const hudRightFace = useDesignerStore(s => s.hudRightFace);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<{ type: 'hud-config'; leftFace: ClockFace; rightFace: ClockFace } | null>(null);
  const simTimeRef = useRef<number>(Date.now());
  const fastClockRef = useRef(fastClock);
  const [livePixels, setLivePixels] = useState<Record<ClockFace, string>>(initPixels);

  const renderAll = useCallback(() => {
    if (fastClockRef.current) {
      simTimeRef.current += 60_000;
    } else {
      simTimeRef.current = Date.now();
    }
    setLivePixels(initPixels(new Date(simTimeRef.current)));
  }, []);

  useEffect(() => {
    simTimeRef.current = fastClock ? simTimeRef.current : Date.now();
    fastClockRef.current = fastClock;
    const id = setInterval(renderAll, fastClock ? 150 : 1000);
    return () => clearInterval(id);
  }, [fastClock, renderAll]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;
    ws.addEventListener('open', () => {
      const { hudLeftFace, hudRightFace } = designerStore.getState();
      ws.send(JSON.stringify({ type: 'hud-mode-start', leftFace: hudLeftFace, rightFace: hudRightFace }));
      const pending = pendingRef.current;
      if (pending) {
        ws.send(JSON.stringify(pending));
        pendingRef.current = null;
      }
    });
    return () => { ws.close(); wsRef.current = null; };
  }, []);

  const sendConfig = useCallback((leftFace: ClockFace, rightFace: ClockFace) => {
    const ws = wsRef.current;
    const payload = { type: 'hud-config' as const, leftFace, rightFace };
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (ws && ws.readyState === WebSocket.CONNECTING) pendingRef.current = payload;
      return;
    }
    ws.send(JSON.stringify(payload));
  }, []);

  function selectLeft(face: ClockFace) {
    designerStore.getState().setHudLeftFace(face);
    sendConfig(face, designerStore.getState().hudRightFace);
  }

  function selectRight(face: ClockFace) {
    designerStore.getState().setHudRightFace(face);
    sendConfig(designerStore.getState().hudLeftFace, face);
  }

  function selectBoth(face: ClockFace) {
    designerStore.getState().setHudLeftFace(face);
    designerStore.getState().setHudRightFace(face);
    sendConfig(face, face);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 px-8 py-8 overflow-y-auto">
      <div role="group" aria-label="Clock face" className="grid grid-cols-4 gap-6">
        {CLOCK_FACES.map(({ id, label }) => {
          const pixels = dualModule
            ? btoa(atob(livePixels[id]) + atob(livePixels[id]))
            : livePixels[id];
          return (
            <ClockFaceCard
              key={id}
              id={id}
              label={label}
              activeLeft={hudLeftFace === id}
              activeRight={hudRightFace === id}
              pixels={pixels}
              dualModule={dualModule}
              onSelectLeft={() => dualModule ? selectLeft(id) : selectBoth(id)}
              onSelectRight={() => selectRight(id)}
            />
          );
        })}
      </div>
    </div>
  );
}
