import * as React from 'react';
import { AUDIO_STYLES } from '../../../animations/audio-renderers.js';
import type { AudioStyle } from '../../../animations/audio-renderers.js';
import { AudioVizGrid } from './AudioVizGrid.js';

const IDLE_MS = 3000;

interface Props {
  style: AudioStyle;
  fullBandsRef: React.RefObject<number[] | null>;
  fftSizeRef: React.RefObject<number>;
  gainRef: React.RefObject<number>;
  gainMultiplierRef: React.RefObject<number>;
  onBandCountChange: (n: number) => void;
  onIdleChange: (idle: boolean) => void;
  onExit: () => void;
}

/**
 * Audio-mode fullscreen visualizer. Wraps the shared {@link AudioVizGrid}
 * renderer with the interactive behaviour for a focused, dismissable view:
 * cursor auto-hide, Escape to exit, and focus-on-mount for AT.
 */
export function AudioFullscreen({ style, fullBandsRef, fftSizeRef, gainRef, gainMultiplierRef, onBandCountChange, onIdleChange, onExit }: Props) {
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleChangeRef = React.useRef(onIdleChange);
  onIdleChangeRef.current = onIdleChange;
  const onExitRef = React.useRef(onExit);
  onExitRef.current = onExit;

  const styleName = AUDIO_STYLES.find(s => s.id === style)?.label ?? style;

  // Auto-hide cursor + notify parent for header fade
  React.useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = 'html.audio-idle * { cursor: none !important; }';
    document.head.appendChild(styleEl);

    function resetIdle() {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      document.documentElement.classList.remove('audio-idle');
      onIdleChangeRef.current(false);
      idleTimerRef.current = setTimeout(() => {
        document.documentElement.classList.add('audio-idle');
        onIdleChangeRef.current(true);
      }, IDLE_MS);
    }

    resetIdle();
    document.addEventListener('mousemove', resetIdle);
    document.addEventListener('mousedown', resetIdle);
    document.addEventListener('keydown', resetIdle);
    document.addEventListener('touchstart', resetIdle);

    return () => {
      styleEl.remove();
      document.removeEventListener('mousemove', resetIdle);
      document.removeEventListener('mousedown', resetIdle);
      document.removeEventListener('keydown', resetIdle);
      document.removeEventListener('touchstart', resetIdle);
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      document.documentElement.classList.remove('audio-idle');
      onIdleChangeRef.current(false);
    };
  }, []);

  // Escape key → exit
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      if (!el) { onExitRef.current(); return; }
      const tag = (el as HTMLElement).tagName.toLowerCase();
      if (['input', 'textarea', 'select', 'a'].includes(tag)) return;
      if ((el as HTMLElement).isContentEditable) return;
      const role = el.getAttribute('role') ?? '';
      if (['link', 'menuitem', 'option', 'textbox', 'combobox'].includes(role)) return;
      onExitRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <AudioVizGrid
      style={style}
      fullBandsRef={fullBandsRef}
      fftSizeRef={fftSizeRef}
      gainRef={gainRef}
      gainMultiplierRef={gainMultiplierRef}
      onBandCountChange={onBandCountChange}
      className="flex-1 flex items-center justify-center overflow-hidden"
      role="img"
      aria-label={`${styleName} audio visualizer`}
      tabIndex={-1}
      autoFocus
    />
  );
}
