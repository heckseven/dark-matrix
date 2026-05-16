import { useEffect, useState } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import type { Config } from '../types/config-types.js';
import { Tabs } from './ui/tabs.js';

const CONFIG_TABS = ['hardware', 'brightness', 'startup', 'daemon', 'notifications', 'appearance'] as const;
type ConfigTab = typeof CONFIG_TABS[number];

export function ConfigPanel({ dualModule: _dualModule }: { dualModule: boolean }) {
  const configData = useDesignerStore(s => s.configData);
  const configDirty = useDesignerStore(s => s.configDirty);
  const [activeTab, setActiveTab] = useState<ConfigTab>('hardware');

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(({ config }: { config: Config }) => designerStore.getState().loadConfigData(config))
      .catch(console.error);
  }, []);

  async function handleSave() {
    if (!configData) return;
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configData),
    });
    if (res.ok) designerStore.getState().markClean();
  }

  return (
    <div className="flex flex-col h-full font-mono">
      <header className="flex items-center gap-3 px-7 py-4 min-h-[58px]">
        <span className="text-xs text-foreground">config</span>
        {configDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label="unsaved changes" />}
        <div className="flex-1" />
        <button
          onClick={() => void handleSave()}
          disabled={!configDirty}
          className="text-xs px-3 py-1 border border-white/20 rounded-sm disabled:opacity-30 hover:border-white/50 transition-colors"
        >
          save
        </button>
      </header>

      <div className="px-7">
        <Tabs
          options={CONFIG_TABS}
          value={activeTab}
          onChange={v => setActiveTab(v as ConfigTab)}
          aria-label="Config sections"
        />
      </div>

      <div className="flex-1 overflow-auto px-7 py-4">
        {configData ? (
          <p className="text-xs text-white/40">{activeTab}</p>
        ) : (
          <p className="text-xs text-white/40">loading…</p>
        )}
      </div>
    </div>
  );
}
