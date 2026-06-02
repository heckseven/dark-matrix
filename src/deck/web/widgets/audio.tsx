import { useState, useEffect, useRef } from 'react';
import { MatrixItem } from '../components/MatrixItem.js';
import { AUDIO_STYLES, createRenderer as createAudioRenderer } from '../../../animations/audio-renderers.js';
import type { AudioStyle as AudioStyleImport, RenderCtx } from '../../../animations/audio-renderers.js';
import type { HudWidget } from '../types/hud-preset.js';
import type { BrowserWidgetDescriptor, GridContext } from './types.js';
import { bayerToB64, bayerDitherToUint8, mirrorFrame, EMPTY_PIXELS } from './utils.js';
import { audioBase } from '../../../lib/widgets/audio.js';
import type { AudioWidget } from '../../../lib/widgets/audio.js';

// Module-level renderer cache (shared by thumbnail, preview, and grid)
const _audioThumbCache: Partial<Record<AudioStyleImport, ReturnType<typeof createAudioRenderer>>> = {};

export const MOCK_AUDIO_CTX: RenderCtx = { bands: [200, 150, 100, 70, 40, 20, 10, 5, 2], fftSize: 2048, gain: 1.5 };

function initAudioRenderers(): Record<AudioStyleImport, ReturnType<typeof createAudioRenderer>> {
  return Object.fromEntries(
    AUDIO_STYLES.map(({ id }) => [id, createAudioRenderer(id)])
  ) as Record<AudioStyleImport, ReturnType<typeof createAudioRenderer>>;
}

function AudioGrid({ currentWidget, audioCtx, side, onPick, onMount, onUnmount }: GridContext) {
  const ctxRef = useRef<RenderCtx>(audioCtx ?? MOCK_AUDIO_CTX);
  ctxRef.current = audioCtx ?? MOCK_AUDIO_CTX;
  const sideRef = useRef<'left' | 'right'>(side);
  sideRef.current = side;

  const renderersRef = useRef<Record<AudioStyleImport, ReturnType<typeof createAudioRenderer>> | null>(null);
  if (!renderersRef.current) renderersRef.current = initAudioRenderers();

  function renderAudio(
    r: Record<AudioStyleImport, ReturnType<typeof createAudioRenderer>>,
    c: RenderCtx,
    s: 'left' | 'right'
  ) {
    return Object.fromEntries(AUDIO_STYLES.map(({ id }) => {
      const raw = r[id]!(c);
      return [id, bayerToB64(s === 'right' ? mirrorFrame(raw) : raw)];
    }));
  }

  const [pixels, setPixels] = useState<Partial<Record<AudioStyleImport, string>>>(() => {
    const r = renderersRef.current!;
    return renderAudio(r, MOCK_AUDIO_CTX, side);
  });

  useEffect(() => {
    onMount();
    return onUnmount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const iid = setInterval(() => {
      const r = renderersRef.current!;
      setPixels(renderAudio(r, ctxRef.current, sideRef.current));
    }, 100);
    return () => clearInterval(iid);
  }, []);

  return (
    <div role="group" aria-label="Audio panels" className="flex flex-wrap gap-6">
      {AUDIO_STYLES.map(({ id, label }) => (
        <MatrixItem
          key={id}
          name={label}
          aria-label={label}
          width={9}
          pixels={pixels[id] ?? EMPTY_PIXELS}
          isSelected={currentWidget?.widget === 'audio' && (currentWidget.style ?? AUDIO_STYLES[0]!.id) === id}
          onSelect={() => onPick({ widget: 'audio', style: id } as HudWidget)}
        />
      ))}
    </div>
  );
}

export const audioDescriptor: BrowserWidgetDescriptor<AudioWidget> = {
  ...audioBase,

  GridComponent: AudioGrid,

  renderThumbnail(widget, side, opts) {
    const style = (widget.style ?? AUDIO_STYLES[0]!.id) as AudioStyleImport;
    const audioCtx = opts?.audioCtx ?? MOCK_AUDIO_CTX;
    // check pre-rendered frames first
    const cached = opts?.audioFrames?.[style]?.[side];
    if (cached) return cached;
    if (!_audioThumbCache[style]) _audioThumbCache[style] = createAudioRenderer(style);
    const frame = _audioThumbCache[style]!(audioCtx);
    const out = new Uint8Array(9 * 34);
    for (let i = 0; i < frame.length; i++) out[i] = (frame[i] ?? 0) > 127 ? 255 : 0;
    const pixels = side === 'right' ? mirrorFrame(out) : out;
    return btoa(String.fromCharCode(...pixels));
  },

  renderPreview(widget, side, _now, opts) {
    const style = (widget.style ?? AUDIO_STYLES[0]!.id) as AudioStyleImport;
    const audioCtx = opts?.audioCtx ?? MOCK_AUDIO_CTX;
    if (!_audioThumbCache[style]) _audioThumbCache[style] = createAudioRenderer(style);
    const rendered = _audioThumbCache[style]!(audioCtx);
    return side === 'right' ? mirrorFrame(bayerDitherToUint8(rendered)) : bayerDitherToUint8(rendered);
  },

  serializeConfig(widget, side) {
    return {
      [`${side}Widget`]: 'audio',
      ...(widget.style !== undefined ? { [`${side}AudioStyle`]: widget.style } : {}),
    };
  },
};
