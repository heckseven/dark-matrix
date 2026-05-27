import { useEffect, useRef, useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { useDeckStore, deckStore } from '../store.js';
import { MatrixItem } from './MatrixItem.js';
import type { AudioStyle, AudioSource } from '../store.js';
import { AUDIO_STYLES, createRenderer } from '../../../animations/audio-renderers.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import { BAYER4 } from '../../../animations/bayer.js';
import { AudioFullscreen } from './AudioFullscreen.js';

const COLS = 9;
const ROWS = 34;

function makeFrame(fill: (c: number, r: number) => number): string {
  const data = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      data[c * ROWS + r] = fill(c, r);
  return btoa(String.fromCharCode(...data));
}

const EQ_H    = [10, 16, 22, 28, 30, 28, 22, 16, 10] as const;
const SPEC_H  = [ 4,  7, 10, 13, 14, 13, 10,  7,  4] as const;
const CTR     = Math.floor(ROWS / 2);

const PLACEHOLDER: Record<AudioStyle, string> = {
  'spectrum-fall':       makeFrame((c, r) => Math.abs(r - CTR) <= SPEC_H[c]! ? 255 - Math.round((r / (ROWS - 1)) * 255) : 0),
  'vu-glitch':           makeFrame((c, r) => r % 9 < 4 && (c * 5 + r * 7) % 7 < 4 ? 255 : 0),
  'circuit':             makeFrame((c, r) => { const bv = Math.floor(r / 4), bh = Math.floor(c / 3); return (bv + bh) % 3 !== 0 && (c * 7 + r * 11) % 5 < 3 ? 255 : 0; }),
  'spirits':             makeFrame((c, r) => { const h = [10,16,22,28,30,28,22,16,10][c]!; const bRow = ROWS - 1 - h; return Math.abs(r - bRow) <= 1 ? Math.round(255 * Math.pow(0.78, Math.abs(r - bRow))) : 0; }),
  'scope-dual':          makeFrame((c, r) => { const rA = ROWS - 1 - Math.round(EQ_H[c]! / ROWS * (ROWS - 1)); const rB = ROWS - 1 - Math.round(EQ_H[COLS - 1 - c]! / ROWS * (ROWS - 1)) + 4; return r === rA ? 255 : Math.abs(r - rA) === 1 ? 170 : r === rB ? 180 : Math.abs(r - rB) === 1 ? 150 : 0; }),
  'glitch-sort-b':       makeFrame((c, r) => { const sc = (c + 1) % 9; const h = [10,16,22,28,30,28,22,16,10][sc]!; return r < h && (sc * 7 + r * 11) % 3 < 2 ? 255 : 0; }),
  'spiral-d':            makeFrame((c, r) => { const CC=4, CR=17; for (let arm=0; arm<2; arm++) { const off=(arm/2)*2*Math.PI; for (let s=0; s<45; s++) { const frac=s/44; const theta=off+frac*5*Math.PI; const sc=Math.round(CC+Math.cos(theta)*CC*frac); const sr=Math.round(CR+Math.sin(theta)*CR*frac); if (sc===c && sr===r) return 255; } } return 0; }),
  'strobe':              makeFrame((c, _r) => [1,0,0,1,1,0,0,1,0][c] ? 255 : 0),
  'dark-matter':         makeFrame((c, r) => { const t = ROWS - EQ_H[c]!; return r === t - 2 ? 255 : r >= t ? ((c * 13 + r * 7) % 11 < 9 ? 255 : 0) : 0; }),
  'neo':                 makeFrame((c, r) => { const head = [6, 20, 11, 3, 16, 26, 8, 14, 22][c]!; const d = r - head; return d >= 0 && d < 9 ? Math.round(255 * Math.pow(0.65, d)) : 0; }),
  'cipher':              makeFrame((c, r) => (c * 17 + r * 31) % 7 < 4 ? 255 : 0),
  'wake':                makeFrame((_c, r) => Math.max(Math.round(255 * Math.pow(0.86, Math.abs(r - 7) * 1.1)), Math.round(255 * Math.pow(0.86, Math.abs(r - 23) * 1.1)))),
  'rhythm':              makeFrame((_c, r) => Math.round(Math.max(0, 1 - Math.abs(Math.abs(r - CTR) - 8) / 1.5) * 255)),
  'drop':                makeFrame((c, r) => { const cx = 4, cy = 17; const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2); return Math.round(Math.max(0, 1 - Math.abs(d - 8) / 0.5) * 255); }),
  'life-erode-4':        makeFrame((c, r) => (c * 19 + r * 37 + c * r * 5) % 13 < 1 ? 255 : 0),
  'kick-d':              makeFrame((c, r) => { const h = [1,3,6,11,16,11,6,3,1][c]!; return r === ROWS - 1 - h ? 255 : 0; }),
  'waterfall':           makeFrame((_c, r) => Math.round((r / (ROWS - 1)) * 255)),
  'sparks':              makeFrame((c, r) => ((c * 7 + r * 11) % 13 < Math.round((1 - r / (ROWS - 1)) * 6)) ? 255 : 0),
  'hex':                 makeFrame((c, r) => { const heads = [[8,22,14],[5,19,26],[12,6,20],[3,17,28],[7,15,23],[15,8,25],[10,20,4],[4,18,27],[9,2,16]][c]!; return Math.max(...heads.map((h, i) => { const d = r - h + i; return d >= 0 && d < 9 ? Math.round(255 * Math.pow(0.65, d)) : 0; })); }),
  'specter':             makeFrame((c, r) => (c * 7 + r * 11) % 17 < 2 && (c * 3 + r * 5) % 7 < 3 ? 200 : 0),
  'heat':                makeFrame((c, r) => { const h = Math.round((EQ_H[c]! + (c % 3 === 0 ? 4 : c % 3 === 1 ? -3 : 2)) * 0.25); return r >= ROWS - h ? ((c * 13 + r * 29) % 11 < 4 ? 0 : 255) : r < ROWS-h && r > ROWS-h-14 && (c*3+r*7)%13===0 ? Math.round(200*Math.pow(0.87,ROWS-h-1-r)) : 0; }),
  'glitch-corrupt':      makeFrame((c, r) => (c>=1&&c<=3&&r>=8&&r<=17)||(c>=5&&c<=7&&r>=20&&r<=28) ? (c*17+r*31)%5<3 ? 255 : 0 : 0),
};

function frameToB64(frame: Uint8Array): string {
  const out = new Uint8Array(frame.length);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const threshold = (BAYER4[row % 4]![col % 4]! + 0.5) * (255 / 16);
      out[col * ROWS + row] = (frame[col * ROWS + row] ?? 0) > threshold ? 255 : 0;
    }
  }
  return btoa(String.fromCharCode(...out));
}

function mirrorFrame(b64: string): string {
  const src = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  const dst = new Uint8Array(COLS * 2 * ROWS);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = src[c * ROWS + r] ?? 0;
      dst[c * ROWS + r] = v;
      dst[(COLS * 2 - 1 - c) * ROWS + r] = v;
    }
  }
  return btoa(String.fromCharCode(...dst));
}

export function AudioPanel({
  dualModule = false,
  fullscreenStyle = null,
  onFullscreenChange = () => {},
  onFullscreenIdleChange = () => {},
  gainMultiplierRef,
}: {
  dualModule?: boolean;
  fullscreenStyle?: AudioStyle | null;
  onFullscreenChange?: (style: AudioStyle | null) => void;
  onFullscreenIdleChange?: (idle: boolean) => void;
  gainMultiplierRef?: RefObject<number>;
}) {
  const audioStyle = useDeckStore(s => s.audioStyle);
  const audioSource = useDeckStore(s => s.audioSource);
  const [livePixels, setLivePixels] = useState<Partial<Record<AudioStyle, string>>>({});
  const defaultGainRef = useRef(1.0);
  const activeGainRef = gainMultiplierRef ?? defaultGainRef;
  const wsRef = useRef<WebSocket | null>(null);
  const fullBandsRef = useRef<number[] | null>(null);
  const fftSizeRef = useRef<number>(2048);
  const gainRef = useRef<number>(1.0);
  const bandCountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const prevStyleRef = useRef<AudioStyle | null>(null);

  const renderersRef = useRef<Record<AudioStyle, ReturnType<typeof createRenderer>> | null>(null);
  if (!renderersRef.current) {
    renderersRef.current = Object.fromEntries(
      AUDIO_STYLES.map(({ id }) => [id, createRenderer(id as AudioStyle)])
    ) as Record<AudioStyle, ReturnType<typeof createRenderer>>;
  }

  const sendViz = useCallback((source: AudioSource, style: AudioStyle) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'audio-viz', style, source }));
  }, []);

  const sendSetBands = useCallback((n: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'audio-viz-setbands', bandCount: n }));
  }, []);

  const handleBandCountChange = useCallback((n: number) => {
    if (bandCountDebounceRef.current) clearTimeout(bandCountDebounceRef.current);
    bandCountDebounceRef.current = setTimeout(() => sendSetBands(n), 200);
  }, [sendSetBands]);

  // Cleanup when fullscreen exits — whether from Escape, internal button, or header switch
  useEffect(() => {
    const prev = prevStyleRef.current;
    prevStyleRef.current = fullscreenStyle;
    if (prev !== null && fullscreenStyle === null) {
      fullBandsRef.current = null;
      sendSetBands(0);
      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (trigger) setTimeout(() => trigger.focus(), 0);
    }
  }, [fullscreenStyle, sendSetBands]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      const { audioStyle: style, audioSource: source } = deckStore.getState();
      ws.send(JSON.stringify({ type: 'audio-viz', style, source }));
    };

    ws.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string') return;
        const msg = JSON.parse(e.data) as { type: string; bands?: number[]; fftSize?: number; gain?: number; fullBands?: number[] };
        if (msg.type === 'audio-bands' && msg.bands) {
          fftSizeRef.current = msg.fftSize ?? 2048;
          gainRef.current = msg.gain ?? 1.0;
          if (msg.fullBands) fullBandsRef.current = msg.fullBands;
          const ctx: RenderCtx = { bands: msg.bands, fftSize: msg.fftSize ?? 2048, gain: (msg.gain ?? 1.0) * activeGainRef.current };
          const renderers = renderersRef.current!;
          const next: Partial<Record<AudioStyle, string>> = {};
          for (const { id } of AUDIO_STYLES) {
            const fn = renderers[id as AudioStyle];
            if (fn) next[id as AudioStyle] = frameToB64(fn(ctx));
          }
          setLivePixels(next);
        }
      } catch { /* ignore */ }
    };

    return () => {
      const w = wsRef.current;
      wsRef.current = null;
      if (bandCountDebounceRef.current) { clearTimeout(bandCountDebounceRef.current); bandCountDebounceRef.current = null; }
      if (w && w.readyState === WebSocket.OPEN) {
        w.send(JSON.stringify({ type: 'audio-viz-stop' }));
      }
      w?.close();
    };
  }, []);

  useEffect(() => {
    sendViz(audioSource, audioStyle);
  }, [audioStyle, audioSource, sendViz]);

  // Fullscreen view
  if (fullscreenStyle !== null) {
    return (
      <AudioFullscreen
        style={fullscreenStyle}
        fullBandsRef={fullBandsRef}
        fftSizeRef={fftSizeRef}
        gainRef={gainRef}
        gainMultiplierRef={activeGainRef}
        onBandCountChange={handleBandCountChange}
        onIdleChange={onFullscreenIdleChange}
        onExit={() => onFullscreenChange(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 px-8 py-8 overflow-y-auto overflow-x-hidden">
      <div role="group" aria-label="Audio visualizer style" className="grid grid-cols-7 gap-6 justify-items-center">
        {AUDIO_STYLES.map(({ id, label }) => {
          const active = audioStyle === id;
          const base = livePixels[id as AudioStyle] ?? PLACEHOLDER[id as AudioStyle]!;
          const pixels = dualModule ? mirrorFrame(base) : base;
          return (
            <MatrixItem
              key={id}
              name={label}
              aria-label={`${label} visualizer`}
              width={dualModule ? 18 : 9}
              pixels={pixels}
              isSelected={active}
              onSelect={() => {
                triggerRef.current = document.activeElement as HTMLElement;
                deckStore.getState().setAudioStyle(id as AudioStyle);
                onFullscreenChange(id as AudioStyle);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
