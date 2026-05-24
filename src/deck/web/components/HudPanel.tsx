import { useEffect, useRef, useCallback, useState } from 'react';
import { useDeckStore, deckStore } from '../store.js';
import { updateAllDataRenderers } from '../data-renderer-pool.js';
import type { DataStats } from '../../../animations/data-renderers.js';
import { AUDIO_STYLES } from '../../../animations/audio-renderers.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import type { HudPresetClient } from '../types/hud-preset.js';
import { PresetList } from './PresetList.js';
import { HudDualPreview } from './HudDualPreview.js';
import { HudInspector } from './HudInspector.js';
import { TriggerView } from './TriggerView.js';
import { ThreePanelLayout } from './ThreePanelLayout.js';

// ── module-level WS send (shared with App header) ────────────────────────

let _moduleWs: WebSocket | null = null;

export function hudSendWsGlobal(msg: object): void {
  if (_moduleWs && _moduleWs.readyState === WebSocket.OPEN) {
    _moduleWs.send(JSON.stringify(msg));
  }
}


// ── helpers ───────────────────────────────────────────────────────────────

function makeDefaultPreset(): HudPresetClient {
  const ts = Date.now().toString(36);
  return {
    name: `preset-${ts}`,
    left:  { widget: 'clock', face: 'elegant' },
    right: { widget: 'clock', face: 'elegant' },
  };
}

function buildPresetConfigPayload(preset: HudPresetClient) {
  const l = preset.left;
  const r = preset.right;
  return {
    type: 'hud-config' as const,
    leftWidget: l.widget,
    leftFace: l.widget === 'clock' ? l.face : undefined,
    leftDataStyle: l.widget === 'data' ? l.style : undefined,
    leftAudioStyle: l.widget === 'audio' ? l.style : undefined,
    leftFile: l.widget === 'image' ? l.file : undefined,
    rightWidget: r.widget,
    rightFace: r.widget === 'clock' ? r.face : undefined,
    rightDataStyle: r.widget === 'data' ? r.style : undefined,
    rightAudioStyle: r.widget === 'audio' ? r.style : undefined,
    rightFile: r.widget === 'image' ? r.file : undefined,
  };
}

// ── main component ────────────────────────────────────────────────────────

const MOCK_AUDIO_CTX: RenderCtx = { bands: [200, 150, 100, 70, 40, 20, 10, 5, 2], fftSize: 2048, gain: 1.5 };

export function HudPanel({ dualModule = false, topPad = 0, onNeedsAudioChange, onClocksVisibleChange, clockNow }: {
  dualModule?: boolean;
  topPad?: number;
  onNeedsAudioChange?: (needs: boolean) => void;
  onClocksVisibleChange?: (visible: boolean) => void;
  clockNow?: Date;
}) {
  const hudPresets         = useDeckStore(s => s.hudPresets);
  const activePresetName   = useDeckStore(s => s.activePresetName);
  const selectedPresetName = useDeckStore(s => s.selectedPresetName);
  const hudSelectedSide    = useDeckStore(s => s.hudSelectedSide);
  const audioSource        = useDeckStore(s => s.audioSource);

  const selectedPreset = hudPresets.find(p => p.name === selectedPresetName) ?? null;

  const [audioCtx, setAudioCtx] = useState<RenderCtx>(MOCK_AUDIO_CTX);
  const [inspectorNeedsAudio, setInspectorNeedsAudio] = useState(false);
  const [inspectorClocksVisible, setInspectorClocksVisible] = useState(false);
  const [triggerPresetName, setTriggerPresetName] = useState<string | null>(null);

  const previewHasAudio = selectedPreset?.left?.widget === 'audio' || selectedPreset?.right?.widget === 'audio';
  const needsAudio = previewHasAudio || inspectorNeedsAudio;

  const mainRef    = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [presetTopPad, setPresetTopPad] = useState(0);
  const [inspectorTopPad, setInspectorTopPad] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsAudioRef = useRef(needsAudio);
  const audioSourceRef = useRef(audioSource);
  const sentInitialHudConfigRef = useRef(false);
  needsAudioRef.current = needsAudio;
  audioSourceRef.current = audioSource;

  // ── WebSocket helpers ────────────────────────────────────────────────

  function sendWs(msg: object) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      sendWs({ type: 'hud-preset-save', presets: deckStore.getState().hudPresets });
    }, 800);
  }, []);

  function sendHudConfig() {
    const preset = deckStore.getState().hudPresets.find(p => p.name === selectedPresetName);
    if (preset) sendWs(buildPresetConfigPayload(preset));
  }

  // ── WebSocket lifecycle ──────────────────────────────────────────────

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;
    _moduleWs = ws;

    ws.addEventListener('open', () => {
      sentInitialHudConfigRef.current = false;
      ws.send(JSON.stringify({ type: 'hud-mode-start' }));
      // Apply the in-memory selected preset immediately — don't wait for hud-presets-get
      // round-trip, which reads disk and may return stale data if a save hasn't flushed yet.
      const storeState = deckStore.getState();
      const immediatePreset = storeState.hudPresets.find(p => p.name === storeState.selectedPresetName);
      if (immediatePreset) {
        ws.send(JSON.stringify(buildPresetConfigPayload(immediatePreset)));
        sentInitialHudConfigRef.current = true;
      }
      ws.send(JSON.stringify({ type: 'hud-presets-get' }));
      ws.send(JSON.stringify({ type: 'data-stats-start' }));
      // Subscribe to audio bands now if needed — the needsAudio effect may have fired
      // before the WS was open and returned early, so re-apply here.
      if (needsAudioRef.current) {
        ws.send(JSON.stringify({ type: 'hud-audio-bands-subscribe', source: audioSourceRef.current }));
      }
    });

    ws.addEventListener('message', (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; bands?: number[]; fftSize?: number; gain?: number } & Partial<DataStats> & Partial<{ presets: HudPresetClient[]; activeName: string | null; name: string | null }>;
        if (msg.type === 'hud-presets') {
          deckStore.getState().loadPresets(msg.presets ?? [], msg.activeName ?? null);
          // If open handler couldn't send hud-config (hudPresets was empty at connect time),
          // send it now from the disk data. Safe because empty hudPresets means no unsaved changes.
          if (!sentInitialHudConfigRef.current) {
            const state = deckStore.getState();
            const preset = state.hudPresets.find(p => p.name === state.selectedPresetName);
            if (preset) {
              sendWs(buildPresetConfigPayload(preset));
              sentInitialHudConfigRef.current = true;
            }
          }
          // hud-config already sent (above or from open handler); don't re-send from
          // disk data if we already applied in-memory state — disk may be stale.
        } else if (msg.type === 'hud-preset-activated') {
          deckStore.getState().setActivePreset(msg.name ?? null);
        } else if (msg.type === 'data-stats') {
          const stats: DataStats = {
            cpuPct:   msg.cpuPct   ?? 0,
            ramPct:   msg.ramPct   ?? 0,
            netRxBps: msg.netRxBps ?? 0,
            netTxBps: msg.netTxBps ?? 0,
            ...(Array.isArray(msg.cpuCores) ? { cpuCores: msg.cpuCores as number[] } : {}),
          };
          updateAllDataRenderers(stats);
        } else if (msg.type === 'audio-bands' && msg.bands) {
          setAudioCtx({ bands: msg.bands, fftSize: msg.fftSize ?? 2048, gain: msg.gain ?? 1.0 });
        }
      } catch { /* ignore */ }
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        // Flush any pending debounced save so the next hud-presets-get reads current data.
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
          ws.send(JSON.stringify({ type: 'hud-preset-save', presets: deckStore.getState().hudPresets }));
        }
        ws.send(JSON.stringify({ type: 'data-stats-stop' }));
      }
      ws.close();
      wsRef.current = null;
      _moduleWs = null;
    };
  }, []);

  // Subscribe/unsubscribe to FFT bands without affecting hardware
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (needsAudio) {
      ws.send(JSON.stringify({ type: 'hud-audio-bands-subscribe', source: audioSource }));
    } else {
      ws.send(JSON.stringify({ type: 'hud-audio-bands-unsubscribe' }));
      setAudioCtx(MOCK_AUDIO_CTX);
    }
  }, [needsAudio, audioSource]);

  // Tell App whether to show the mic toggle
  useEffect(() => {
    onNeedsAudioChange?.(needsAudio);
  }, [needsAudio, onNeedsAudioChange]);

  // Keep preset list top edge aligned with the preview top edge.
  // The preview is flexbox-centered inside <main>; the gap above it changes with window height.
  useEffect(() => {
    const update = () => {
      const main    = mainRef.current;
      const preview = previewRef.current;
      if (!main || !preview) return;
      const mainRect    = main.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      // +8 aligns the card's outer bracket edge with the preview's canvas bracket
      // (preview canvas is inset p-2 = 8px inside its wrapper).
      setPresetTopPad(Math.max(0, previewRect.top - mainRect.top - topPad + 8));
      // Inspector bracket offset: header bar (py-1 div=8px + sm button=20px → 28px)
      // + grid content py-4 (16px) = 44px above the first tile bracket.
      // Subtract 44 then add back preview's p-2 (8px) → net -36.
      setInspectorTopPad(Math.max(0, previewRect.top - mainRect.top - topPad - 36));
    };
    update();
    const ro = new ResizeObserver(update);
    if (mainRef.current) ro.observe(mainRef.current);
    return () => ro.disconnect();
  }, [topPad]);

  useEffect(() => {
    onClocksVisibleChange?.(inspectorClocksVisible);
  }, [inspectorClocksVisible, onClocksVisibleChange]);

  // ── render ───────────────────────────────────────────────────────────

  return (
    <>
    <ThreePanelLayout
      gap="1rem"
      leftLabel="Preset list"
      leftStyle={{ paddingTop: topPad }}
      rightLabel="Widget inspector"
      rightStyle={{ paddingTop: topPad }}
      left={
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', maxWidth: 208, marginLeft: 'auto', marginRight: 16, paddingTop: presetTopPad }}>
        <PresetList
          presets={hudPresets}
          activeName={activePresetName}
          selectedName={selectedPresetName}
          audioCtx={audioCtx}
          onSelect={(name) => {
            const { hudPresets, selectPreset } = deckStore.getState();
            const preset = hudPresets.find(p => p.name === name);
            selectPreset(name);
            if (preset) sendWs(buildPresetConfigPayload(preset));
          }}
          onActivate={(name) => {
            deckStore.getState().selectPreset(name);
            sendWs({ type: 'hud-preset-activate', name });
          }}
          onCreate={() => {
            const p = makeDefaultPreset();
            deckStore.getState().createPreset(p);
            debouncedSave();
          }}
          onInsert={(afterIdx) => {
            const p = makeDefaultPreset();
            deckStore.getState().insertPreset(p, afterIdx);
            debouncedSave();
          }}
          onDelete={(name) => {
            deckStore.getState().deletePreset(name);
            debouncedSave();
          }}
          onDuplicate={(name) => {
            const state = deckStore.getState();
            const idx = state.hudPresets.findIndex(p => p.name === name);
            if (idx === -1) return;
            const src = state.hudPresets[idx]!;
            const copy: HudPresetClient = { ...src, name: `${src.name} copy` };
            state.insertPreset(copy, idx);
            debouncedSave();
          }}
          onRename={(old, next) => {
            deckStore.getState().renamePreset(old, next);
            debouncedSave();
          }}
          onMove={(from, to) => {
            deckStore.getState().movePreset(from, to);
            debouncedSave();
          }}
          onEditTriggers={(name) => setTriggerPresetName(name)}
        />
        </div>
      }
      centerRef={mainRef}
      center={
        <div className="h-full flex items-center justify-center overflow-hidden">
          <div ref={previewRef} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <HudDualPreview
              leftWidget={selectedPreset?.left ?? null}
              rightWidget={selectedPreset?.right ?? null}
              selectedSide={hudSelectedSide}
              onSelectSide={(side) => deckStore.getState().selectSide(side)}
              audioCtx={audioCtx}
              {...(clockNow !== undefined ? { clockNow } : {})}
            />
          </div>
        </div>
      }
      right={
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: inspectorTopPad }}>
          <HudInspector
            key={`${hudSelectedSide}-${selectedPresetName ?? 'none'}`}
            widget={selectedPreset
              ? (hudSelectedSide === 'left' ? selectedPreset.left : selectedPreset.right)
              : null
            }
            {...(selectedPreset ? { oppositeWidget: hudSelectedSide === 'left' ? selectedPreset.right : selectedPreset.left } : {})}
            side={hudSelectedSide}
            audioCtx={audioCtx}
            onNeedsAudio={setInspectorNeedsAudio}
            onClocksVisible={setInspectorClocksVisible}
            onChange={(widget) => {
              if (!selectedPreset) return;
              deckStore.getState().updatePresetWidget(selectedPreset.name, hudSelectedSide, widget);
              sendHudConfig();
              debouncedSave();
            }}
          />
        </div>
      }
    />
    {triggerPresetName !== null && (() => {
      const tp = hudPresets.find(p => p.name === triggerPresetName);
      if (!tp) return null;
      return (
        <TriggerView
          key={triggerPresetName}
          preset={tp}
          onDone={() => setTriggerPresetName(null)}
          onChange={(triggers) => {
            deckStore.getState().updatePresetTriggers(tp.name, triggers);
            debouncedSave();
          }}
          onMatchChange={(match) => {
            deckStore.getState().updatePresetMatch(tp.name, match);
            debouncedSave();
          }}
        />
      );
    })()}
    </>
  );
}
