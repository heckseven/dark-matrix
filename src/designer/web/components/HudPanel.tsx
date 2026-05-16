import { useEffect, useRef, useCallback } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import type { DataStyle } from '../store.js';
import { DATA_STYLES, createDataRenderer } from '../../../animations/data-renderers.js';
import type { DataRenderer, DataStats } from '../../../animations/data-renderers.js';
import type { HudWidget, HudPresetClient } from '../types/hud-preset.js';
import { PresetList } from './PresetList.js';
import { HudDualPreview } from './HudDualPreview.js';
import { HudInspector } from './HudInspector.js';
import { TriggerEditor } from './TriggerEditor.js';

// ── module-level WS send (shared with App header) ────────────────────────

let _moduleWs: WebSocket | null = null;

export function hudSendWsGlobal(msg: object): void {
  if (_moduleWs && _moduleWs.readyState === WebSocket.OPEN) {
    _moduleWs.send(JSON.stringify(msg));
  }
}

// ── data renderer instances (shared with live stats) ──────────────────────

const _dataRenderers: Partial<Record<DataStyle, DataRenderer>> = {};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k in _dataRenderers) delete _dataRenderers[k as DataStyle];
  });
}

function getDataRenderer(style: DataStyle): DataRenderer {
  if (!_dataRenderers[style]) _dataRenderers[style] = createDataRenderer({ style });
  return _dataRenderers[style]!;
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
    rightWidget: r.widget,
    rightFace: r.widget === 'clock' ? r.face : undefined,
    rightDataStyle: r.widget === 'data' ? r.style : undefined,
  };
}

function buildHudConfigPayload(widget: HudWidget, side: 'left' | 'right') {
  const store = designerStore.getState();
  const leftWidget  = side === 'left'  ? (widget.widget) : store.hudLeftWidget;
  const rightWidget = side === 'right' ? (widget.widget) : store.hudRightWidget;
  const leftFace    = side === 'left'  && widget.widget === 'clock' ? (widget.face ?? store.hudLeftFace)  : store.hudLeftFace;
  const rightFace   = side === 'right' && widget.widget === 'clock' ? (widget.face ?? store.hudRightFace) : store.hudRightFace;
  const leftDataStyle  = side === 'left'  && widget.widget === 'data' ? (widget.style ?? store.hudLeftDataStyle)  : store.hudLeftDataStyle;
  const rightDataStyle = side === 'right' && widget.widget === 'data' ? (widget.style ?? store.hudRightDataStyle) : store.hudRightDataStyle;
  return { type: 'hud-config' as const, leftWidget, leftFace, leftDataStyle, rightWidget, rightFace, rightDataStyle };
}

// ── main component ────────────────────────────────────────────────────────

export function HudPanel({ dualModule = false, topPad = 0 }: { dualModule?: boolean; topPad?: number }) {
  const hudPresets       = useDesignerStore(s => s.hudPresets);
  const activePresetName = useDesignerStore(s => s.activePresetName);
  const selectedPresetName = useDesignerStore(s => s.selectedPresetName);
  const hudSelectedSide  = useDesignerStore(s => s.hudSelectedSide);

  const selectedPreset = hudPresets.find(p => p.name === selectedPresetName) ?? null;

  const wsRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── WebSocket helpers ────────────────────────────────────────────────

  function sendWs(msg: object) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      sendWs({ type: 'hud-preset-save', presets: designerStore.getState().hudPresets });
    }, 800);
  }, []);

  function sendHudConfig(widget: HudWidget) {
    sendWs(buildHudConfigPayload(widget, hudSelectedSide));
  }

  // ── WebSocket lifecycle ──────────────────────────────────────────────

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;
    _moduleWs = ws;

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'hud-mode-start' }));
      ws.send(JSON.stringify({ type: 'hud-presets-get' }));
      ws.send(JSON.stringify({ type: 'data-stats-start' }));
    });

    ws.addEventListener('message', (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { type: string } & Partial<DataStats> & Partial<{ presets: HudPresetClient[]; activeName: string | null; name: string | null }>;
        if (msg.type === 'hud-presets') {
          designerStore.getState().loadPresets(msg.presets ?? [], msg.activeName ?? null);
          const { hudPresets, selectedPresetName } = designerStore.getState();
          const sel = hudPresets.find(p => p.name === selectedPresetName);
          if (sel) ws.send(JSON.stringify(buildPresetConfigPayload(sel)));
        } else if (msg.type === 'hud-preset-activated') {
          designerStore.getState().setActivePreset(msg.name ?? null);
        } else if (msg.type === 'data-stats') {
          const stats: DataStats = {
            cpuPct:   msg.cpuPct   ?? 0,
            ramPct:   msg.ramPct   ?? 0,
            netRxBps: msg.netRxBps ?? 0,
            netTxBps: msg.netTxBps ?? 0,
          };
          for (const { id } of DATA_STYLES) getDataRenderer(id).update(stats);
        }
      } catch { /* ignore */ }
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data-stats-stop' }));
      }
      ws.close();
      wsRef.current = null;
      _moduleWs = null;
    };
  }, []);

  // ── render ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: '1rem', height: '100%', width: '100%' }}>
      {/* Left: preset list */}
      <aside style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: topPad }}>
        <PresetList
          presets={hudPresets}
          activeName={activePresetName}
          selectedName={selectedPresetName}
          onSelect={(name) => {
            designerStore.getState().selectPreset(name);
            sendWs({ type: 'hud-preset-activate', name });
          }}
          onCreate={() => {
            const p = makeDefaultPreset();
            designerStore.getState().createPreset(p);
            debouncedSave();
          }}
          onInsert={(afterIdx) => {
            const p = makeDefaultPreset();
            designerStore.getState().insertPreset(p, afterIdx);
            debouncedSave();
          }}
          onDelete={(name) => {
            designerStore.getState().deletePreset(name);
            debouncedSave();
          }}
          onDuplicate={(name) => {
            const state = designerStore.getState();
            const idx = state.hudPresets.findIndex(p => p.name === name);
            if (idx === -1) return;
            const src = state.hudPresets[idx]!;
            const copy: HudPresetClient = { ...src, name: `${src.name} copy` };
            state.insertPreset(copy, idx);
            debouncedSave();
          }}
          onRename={(old, next) => {
            designerStore.getState().renamePreset(old, next);
            debouncedSave();
          }}
          onMove={(from, to) => {
            designerStore.getState().movePreset(from, to);
            debouncedSave();
          }}
        />
      </aside>

      {/* Center: dual preview + trigger editor */}
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <HudDualPreview
            leftWidget={selectedPreset?.left ?? null}
            rightWidget={selectedPreset?.right ?? null}
            selectedSide={hudSelectedSide}
            onSelectSide={(side) => designerStore.getState().selectSide(side)}
          />
          <TriggerEditor
            triggers={selectedPreset?.triggers ?? []}
            onChange={(triggers) => {
              if (!selectedPreset) return;
              designerStore.getState().updatePresetTriggers(selectedPreset.name, triggers);
              debouncedSave();
            }}
            {...(selectedPreset?.match !== undefined ? { match: selectedPreset.match } : {})}
            onMatchChange={(match) => {
              if (!selectedPreset) return;
              designerStore.getState().updatePresetMatch(selectedPreset.name, match);
              debouncedSave();
            }}
          />
        </div>
      </main>

      {/* Right: widget inspector */}
      <aside style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: topPad }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <HudInspector
            widget={selectedPreset
              ? (hudSelectedSide === 'left' ? selectedPreset.left : selectedPreset.right)
              : null
            }
            onChange={(widget) => {
              if (!selectedPreset) return;
              designerStore.getState().updatePresetWidget(selectedPreset.name, hudSelectedSide, widget);
              sendHudConfig(widget);
              debouncedSave();
            }}
          />
        </div>
      </aside>
    </div>
  );
}
