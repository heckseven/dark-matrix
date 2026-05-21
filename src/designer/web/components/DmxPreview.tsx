import { useEffect, useState } from 'react';
import type { AssetMeta } from '../../../lib/asset-meta.js';
import { MatrixPreview } from './MatrixPreview.js';

const ROWS = 34;
const COLS = 9;

function toB64(f: Uint8Array): string {
  let s = '';
  for (let i = 0; i < f.length; i++) s += String.fromCharCode(f[i]!);
  return btoa(s);
}

function blankB64(cols: number) { return toB64(new Uint8Array(cols * ROWS)); }

function decodeB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

function expand9to18(frame: string): string {
  const src = decodeB64(frame);
  const out = new Uint8Array(18 * ROWS);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      out[c * ROWS + r]          = src[c * ROWS + r] ?? 0;
      out[(c + COLS) * ROWS + r] = src[c * ROWS + r] ?? 0;
    }
  }
  return toB64(out);
}

function trim18to9(frame: string): string {
  const src = decodeB64(frame);
  const out = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      out[c * ROWS + r] = src[c * ROWS + r] ?? 0;
    }
  }
  return toB64(out);
}

export function DmxPreview({ filename, dual = false }: { filename?: string | undefined; dual?: boolean }) {
  const [asset, setAsset] = useState<AssetMeta | null>(null);
  const [px, setPx] = useState(() => blankB64(dual ? 18 : 9));

  useEffect(() => {
    setAsset(null);
    setPx(blankB64(dual ? 18 : 9));
    if (!filename) return;
    fetch(`/api/assets/${encodeURIComponent(filename)}`)
      .then(r => r.ok ? r.json() as Promise<{ ok: boolean; asset: AssetMeta }> : Promise.reject())
      .then(d => setAsset(d.asset))
      .catch(() => setAsset(null));
  }, [filename, dual]);

  useEffect(() => {
    if (!asset || asset.frames.length === 0) return;
    let frameIdx = 0;
    let dead = false;
    let timerId: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (dead) return;
      const rawFrame = asset.frames[frameIdx] ?? asset.firstFrame;
      let displayFrame: string;
      if (dual) {
        displayFrame = asset.width === 9 ? expand9to18(rawFrame) : rawFrame;
      } else {
        displayFrame = asset.width === 18 ? trim18to9(rawFrame) : rawFrame;
      }
      setPx(displayFrame);
      const delay = asset.delays[frameIdx] ?? 100;
      frameIdx = frameIdx < asset.frames.length - 1 ? frameIdx + 1 : 0;
      timerId = setTimeout(tick, delay || 100);
    };

    tick();
    return () => { dead = true; clearTimeout(timerId); };
  }, [asset, dual]);

  return <MatrixPreview pixels={px} width={dual ? 18 : 9} />;
}
