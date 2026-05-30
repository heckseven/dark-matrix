import { useEffect, useRef, useCallback, useState } from 'react';
import { useDeckStore, deckStore } from '../store.js';
import { updateAllDataRenderers } from '../data-renderer-pool.js';
import type { DataStats } from '../../../animations/data-renderers.js';
import { AUDIO_STYLES } from '../../../animations/audio-renderers.js';
import type { RenderCtx } from '../../../animations/audio-renderers.js';
import type { HudPresetClient } from '../types/hud-preset.js';
import type { BiomePreset } from '../types/life-types.js';
import { MatrixItemColumn } from './MatrixItemColumn.js';
import { usePresetPixels } from './usePresetPixels.js';
import { useAlignedTopPad } from './useAlignedTopPad.js';
import { Button } from './ui/button.js';
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
    leftTimerStyle: l.widget === 'timer' ? (l.style ?? 'elegant') : undefined,
    leftTimerDurationMs: l.widget === 'timer' ? l.durationMs : undefined,
    leftTimerRepeat: l.widget === 'timer' ? l.repeat : undefined,
    leftDataStyle: l.widget === 'data' ? l.style : undefined,
    leftAudioStyle: l.widget === 'audio' ? l.style : undefined,
    leftClaudeStyle: l.widget === 'claude' ? l.style : undefined,
    leftFile: l.widget === 'image' ? l.file : undefined,
    leftBiomeName: l.widget === 'life' ? l.biomeName : undefined,
    leftRandomIntervalMs: l.widget === 'life' && l.biomeName === 'random' ? (l.randomIntervalMs ?? 30000) : undefined,
    leftText: l.widget === 'text' ? l.text : undefined,
    leftTextStyle: l.widget === 'text' ? l.style : undefined,
    leftTextSize: l.widget === 'text' ? l.size : undefined,
    leftTextSpeed: l.widget === 'text' ? l.speed : undefined,
    leftTextSpan: l.widget === 'text' ? l.span : undefined,
    leftTextFlicker: l.widget === 'text' ? l.flicker : undefined,
    leftTextTransition: l.widget === 'text' ? l.transition : undefined,
    leftTextLoopDelayMs: l.widget === 'text' ? l.loopDelayMs : undefined,
    rightWidget: r.widget,
    rightFace: r.widget === 'clock' ? r.face : undefined,
    rightTimerStyle: r.widget === 'timer' ? (r.style ?? 'elegant') : undefined,
    rightTimerDurationMs: r.widget === 'timer' ? r.durationMs : undefined,
    rightTimerRepeat: r.widget === 'timer' ? r.repeat : undefined,
    rightDataStyle: r.widget === 'data' ? r.style : undefined,
    rightAudioStyle: r.widget === 'audio' ? r.style : undefined,
    rightClaudeStyle: r.widget === 'claude' ? r.style : undefined,
    rightFile: r.widget === 'image' ? r.file : undefined,
    rightBiomeName: r.widget === 'life' ? r.biomeName : undefined,
    rightRandomIntervalMs: r.widget === 'life' && r.biomeName === 'random' ? (r.randomIntervalMs ?? 30000) : undefined,
    rightText: r.widget === 'text' ? r.text : undefined,
    rightTextStyle: r.widget === 'text' ? r.style : undefined,
    rightTextSize: r.widget === 'text' ? r.size : undefined,
    rightTextSpeed: r.widget === 'text' ? r.speed : undefined,
    rightTextSpan: r.widget === 'text' ? r.span : undefined,
    rightTextFlicker: r.widget === 'text' ? r.flicker : undefined,
    rightTextTransition: r.widget === 'text' ? r.transition : undefined,
    rightTextLoopDelayMs: r.widget === 'text' ? r.loopDelayMs : undefined,
  };
}

// ── main component ────────────────────────────────────────────────────────

const INITIAL_AUDIO_CTX: RenderCtx = { bands: [200, 150, 100, 70, 40, 20, 10, 5, 2], fftSize: 2048, gain: 1.5 };

function makeSimCtx(frame: number): RenderCtx {
  const bands = Array.from({ length: 9 }, (_, i) => {
    const t = frame * 0.05;
    const base = 0.7 - i * 0.05;
    const level = Math.max(0, Math.min(1,
      base + 0.2 * Math.sin(t * (0.5 + i * 0.11) + i * 1.2)
           + 0.08 * Math.sin(t * 2.1 + i * 2.5)
    ));
    const db = level * 60 - 60;
    return Math.round((1024 / 1.5) * Math.pow(10, db / 20));
  });
  return { bands, fftSize: 2048, gain: 1.5 };
}

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

  const [audioCtx, setAudioCtx] = useState<RenderCtx>(INITIAL_AUDIO_CTX);
  const [inspectorNeedsAudio, setInspectorNeedsAudio] = useState(false);
  const [inspectorClocksVisible, setInspectorClocksVisible] = useState(false);
  const [triggerPresetName, setTriggerPresetName] = useState<string | null>(null);

  const previewHasAudio = selectedPreset?.left?.widget === 'audio' || selectedPreset?.right?.widget === 'audio';
  const needsAudio = previewHasAudio || inspectorNeedsAudio;

  const mainRef    = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // +8: preset list — preview canvas is inset p-2 = 8px, aligning bracket edges.
  // -2: inspector — header py-1 (4px) + trigger p-1 (4px) + half-leading (2px) = 10px offset;
  //     subtract 2 so the visual glyph top lands on the bracket at canvas y=0 (p-2 + 8px).
  const presetTopPad    = useAlignedTopPad(mainRef, previewRef, topPad,  8);
  const inspectorTopPad = useAlignedTopPad(mainRef, previewRef, topPad, -2);

  const { getPixels: getPresetPixels, onTick: onPresetTick } = usePresetPixels(hudPresets, audioCtx);

  const wsRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsAudioRef = useRef(needsAudio);
  const audioSourceRef = useRef(audioSource);
  const sentInitialHudConfigRef = useRef(false);
  const simFrameRef = useRef(0);
  const lastRealAudioRef = useRef(0);
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
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
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
      ws.send(JSON.stringify({ type: 'biome-presets-get' }));
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
        if (msg.type === 'biome-presets') {
          deckStore.getState().loadBiomes((msg as unknown as { presets?: BiomePreset[] }).presets ?? []);
        } else if (msg.type === 'hud-presets') {
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
          // Threshold >= 5 is intentional: quiet real audio (1–4) defers to simulation,
          // which is preferable to a barely-moving visualisation.
          if (msg.bands.reduce((m: number, v: number) => v > m ? v : m, -Infinity) >= 5) {
            lastRealAudioRef.current = Date.now();
            setAudioCtx({ bands: msg.bands, fftSize: msg.fftSize ?? 2048, gain: msg.gain ?? 1.0 });
          }
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
    }
  }, [needsAudio, audioSource]);

  // Simulate animated audio when real audio is silent or not subscribed
  useEffect(() => {
    if (!needsAudio) return;
    const id = setInterval(() => {
      if (Date.now() - lastRealAudioRef.current > 400) {
        simFrameRef.current++;
        setAudioCtx(makeSimCtx(simFrameRef.current));
      }
    }, 100);
    return () => clearInterval(id);
  }, [needsAudio]);

  // Tell App whether to show the mic toggle
  useEffect(() => {
    onNeedsAudioChange?.(needsAudio);
  }, [needsAudio, onNeedsAudioChange]);

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
        <MatrixItemColumn<HudPresetClient>
          items={hudPresets}
          getKey={p => p.name}
          getPixels={getPresetPixels}
          getWidth={_ => 18}
          getName={p => p.name}
          getAriaLabel={(p, isActive) => isActive ? `${p.name} (default)` : p.name}
          isSelected={p => p.name === selectedPresetName}
          isActive={p => p.name === activePresetName}
          onSelect={(p) => {
            const { hudPresets, selectPreset } = deckStore.getState();
            const preset = hudPresets.find(q => q.name === p.name);
            selectPreset(p.name);
            if (preset) sendWs(buildPresetConfigPayload(preset));
          }}
          onAdd={() => {
            const preset = makeDefaultPreset();
            deckStore.getState().createPreset(preset);
            deckStore.getState().selectPreset(preset.name);
            debouncedSave();
          }}
          onInsert={(afterIdx) => {
            const preset = makeDefaultPreset();
            deckStore.getState().insertPreset(preset, afterIdx);
            deckStore.getState().selectPreset(preset.name);
            debouncedSave();
          }}
          insertLabel={idx => `Insert preset after position ${idx + 1}`}
          onDelete={(p) => {
            deckStore.getState().deletePreset(p.name);
            debouncedSave();
          }}
          onDuplicate={(p, idx) => {
            const state = deckStore.getState();
            const src   = state.hudPresets[idx]!;
            const copy: HudPresetClient = { ...src, name: `${src.name} copy` };
            state.insertPreset(copy, idx);
            debouncedSave();
          }}
          onRename={(p, next) => {
            deckStore.getState().renamePreset(p.name, next);
            debouncedSave();
          }}
          onMove={(from, to) => {
            deckStore.getState().movePreset(from, to);
            debouncedSave();
          }}
          onActivate={(p) => {
            deckStore.getState().selectPreset(p.name);
            sendWs({ type: 'hud-preset-activate', name: p.name });
          }}
          activateLabel="Set as default"
          activeLabel="Default preset"
          extraControls={(p) => (
            <Button variant="ghost" className="w-8" aria-label="Edit triggers" tooltip="Edit triggers" tooltipSide="right"
              onClick={e => { e.stopPropagation(); setTriggerPresetName(p.name); }}>if</Button>
          )}
          animated={true}
          onTick={onPresetTick}
          addLabel="Add preset"
          emptyText="no presets"
          aria-label="Presets"
          sideAlign="end"
          topPadding={presetTopPad}
        />
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
            key={`${hudSelectedSide}-${selectedPreset?.name ?? 'none'}`}
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
            onChangeBoth={(widget) => {
              if (!selectedPreset) return;
              deckStore.getState().updatePresetWidget(selectedPreset.name, 'left', widget);
              deckStore.getState().updatePresetWidget(selectedPreset.name, 'right', widget);
              sendHudConfig();
              debouncedSave();
            }}
            onDeleteBiome={(name) => {
              deckStore.getState().deleteBiome(name);
              sendWs({ type: 'biome-preset-save', presets: deckStore.getState().biomePresets });
            }}
            onEditBiome={(name) => {
              deckStore.getState().selectBiome(name);
              deckStore.getState().setActiveMode('life');
            }}
            dualModule={dualModule}
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
