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

export function ConfigPanel({ dualModule: _dualModule, topPad }: { dualModule: boolean; topPad: number }) {
  const configData = useDesignerStore(s => s.configData);
  const patchConfig = useDesignerStore(s => s.patchConfig);
  const [activeTab, setActiveTab] = useState<ConfigTab>('hardware');

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      // Accepted boundary: server always returns Config shape; Zod validates on write.
      .then(({ config }: { config: Config }) => designerStore.getState().loadConfigData(config))
      .catch(console.error);
  }, []);

  return (
    <div className="flex flex-col h-full w-full font-mono overflow-auto" style={{ paddingTop: topPad }}>
      <div className="mx-auto w-full max-w-[800px] px-4 sm:px-7">
        <div className="pt-4">
          <Tabs
            options={CONFIG_TABS}
            value={activeTab}
            onChange={v => { if ((CONFIG_TABS as readonly string[]).includes(v)) setActiveTab(v as ConfigTab); }}
            aria-label="Config sections"
          />
        </div>

        <div className="py-4" aria-live="polite" aria-busy={!configData}>
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
          <p className="text-xs text-white/60">loading…</p>
        )}
        </div>
      </div>
    </div>
  );
}
