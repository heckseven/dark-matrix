import { useEffect, useState } from 'react';
import { useDesignerStore, designerStore } from '../store.js';
import type { Config } from '../types/config-types.js';
import { Tabs } from './ui/tabs.js';
import { HardwareTab } from './config-tabs/HardwareTab.js';
import { BrightnessTab } from './config-tabs/BrightnessTab.js';
import { StartupTab } from './config-tabs/StartupTab.js';
import { DaemonTab } from './config-tabs/DaemonTab.js';
import { NotificationsTab } from './config-tabs/NotificationsTab.js';
import { AppearanceTab } from './config-tabs/AppearanceTab.js';

const CONFIG_TABS = ['hardware', 'brightness', 'startup', 'daemon', 'notifications', 'appearance'] as const;
type ConfigTab = typeof CONFIG_TABS[number];

export function ConfigPanel({ dualModule: _dualModule }: { dualModule: boolean }) {
  const configData = useDesignerStore(s => s.configData);
  const configDirty = useDesignerStore(s => s.configDirty);
  const patchConfig = useDesignerStore(s => s.patchConfig);
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
      <header className="relative flex items-center justify-center px-7 py-4 min-h-[58px]">
        <span className="flex items-center gap-2 text-xs text-foreground">
          config
          {configDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label="unsaved changes" />}
        </span>
        <button
          onClick={() => void handleSave()}
          disabled={!configDirty}
          className="absolute right-7 text-xs px-3 py-1 border border-white/20 rounded-sm disabled:opacity-30 hover:border-white/50 transition-colors"
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
          <>
            {activeTab === 'hardware' && (
              <HardwareTab
                value={configData.modules}
                onChange={v => patchConfig({ modules: v })}
              />
            )}
            {activeTab === 'brightness' && (
              <BrightnessTab
                value={configData.brightness}
                onChange={v => patchConfig({ brightness: v })}
              />
            )}
            {activeTab === 'startup' && (
              <StartupTab
                value={configData.startup}
                onChange={v => patchConfig({ startup: v })}
              />
            )}
            {activeTab === 'daemon' && (
              <DaemonTab
                value={configData.daemon}
                onChange={v => patchConfig({ daemon: v })}
              />
            )}
            {activeTab === 'notifications' && (
              <NotificationsTab
                value={configData.notification_rules ?? []}
                onChange={rules => patchConfig({ notification_rules: rules })}
              />
            )}
            {activeTab === 'appearance' && (
              // TODO: add unsaved-changes navigation guard when App.tsx mode switch is wired
              <AppearanceTab value={configData} />
            )}
          </>
        ) : (
          <p className="text-xs text-white/40">loading…</p>
        )}
      </div>
    </div>
  );
}
