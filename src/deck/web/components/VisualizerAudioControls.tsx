import { useEffect } from 'react';
import type { RefObject } from 'react';
import { deckStore, useDeckStore } from '../store.js';
import { Slider } from './ui/slider.js';
import { Toggle } from './ui/toggle.js';
import { Tooltip } from './ui/tooltip.js';

/** 0% → 1×, 100% → 8× preview gain applied to the web visualizer rendering. */
export const MAX_GAIN_BOOST = 7;

/**
 * Shared mic-source + sensitivity ("levels") controls for the visualizer, used by
 * both audio mode and cast mode so the two stay in sync. Source and the per-source
 * sensitivities live in the store (shared across modes); the slider also writes the
 * live preview gain into `gainMultiplierRef`, which the renderers read each frame.
 *
 * The caller decides when to show these — they belong on screen only while a
 * visualizer is running or the picker is open.
 */
export function VisualizerAudioControls({ hasMic, gainMultiplierRef }: {
  hasMic: boolean;
  gainMultiplierRef: RefObject<number>;
}) {
  const audioSource = useDeckStore(s => s.audioSource);
  const micSensitivity = useDeckStore(s => s.micSensitivity);
  const monitorSensitivity = useDeckStore(s => s.monitorSensitivity);
  const sensitivity = audioSource === 'mic' ? micSensitivity : monitorSensitivity;
  const sourceLabel = audioSource === 'mic' ? 'Mic' : 'Monitor';

  // Keep the live preview gain in step with the active source's sensitivity —
  // on mount (incl. after config hydration) and on every subsequent change.
  useEffect(() => {
    gainMultiplierRef.current = 1 + (sensitivity / 100) * MAX_GAIN_BOOST;
  }, [sensitivity, gainMultiplierRef]);

  return (
    <div className="flex items-center gap-2">
      <Tooltip content={`${sourceLabel} sensitivity`} side="bottom">
        <span>
          <Slider
            aria-label={`${sourceLabel} sensitivity`}
            aria-valuetext={`${sensitivity}%`}
            value={sensitivity}
            min={0}
            max={100}
            step={1}
            className="w-32"
            valueLabel={`${sensitivity}%`}
            onChange={e => {
              const v = Number(e.target.value);
              if (audioSource === 'mic') {
                deckStore.getState().setMicSensitivity(v);
              } else {
                deckStore.getState().setMonitorSensitivity(v);
              }
            }}
          />
        </span>
      </Tooltip>
      {hasMic && (
        <Toggle
          pressed={audioSource === 'mic'}
          onPressedChange={(on) => deckStore.getState().setAudioSource(on ? 'mic' : 'monitor')}
          title={audioSource === 'mic' ? 'Disable mic' : 'Enable mic'}
          aria-label={audioSource === 'mic' ? 'Disable mic' : 'Enable mic'}
        >
          <span aria-hidden="true">mic</span>
        </Toggle>
      )}
    </div>
  );
}
