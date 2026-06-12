import { useEffect, useState } from 'react';
import { useDeckStore, deckStore } from '../store.js';
import type { Config } from '../types/config-types.js';
import { CONFIG_TABS, type ConfigTab, routeConfigTab, pathForMode } from '../router.js';
import { Tabs } from './ui/tabs.js';
import { HardwareTab } from './config-tabs/HardwareTab.js';
import { BrightnessTab } from './config-tabs/BrightnessTab.js';
import { StartupTab } from './config-tabs/StartupTab.js';
import { DaemonTab } from './config-tabs/DaemonTab.js';
import { NotificationsTab } from './config-tabs/NotificationsTab.js';
import { AppearanceTab } from './config-tabs/AppearanceTab.js';
import { IntegrationsTab } from './config-tabs/IntegrationsTab.js';

async function reloadConfig() {
  const r = await fetch('/api/config');
  if (!r.ok) throw new Error(`config reload failed: ${r.status}`);
  const { config } = await r.json() as { config: Config };
  deckStore.getState().loadConfigData(config);
}

export function ConfigPanel({ dualModule, topPad }: { dualModule: boolean; topPad: number }) {
  const configData = useDeckStore(s => s.configData);
  const patchConfig = useDeckStore(s => s.patchConfig);
  const [activeTab, setActiveTab] = useState<ConfigTab>(() => routeConfigTab(window.location.pathname) ?? 'hardware');

  useEffect(() => {
    if (import.meta.env.STORYBOOK) return;
    reloadConfig().catch(console.error);
  }, []);

  // Reflect the active tab in the URL (/config/<tab>) so it is deep-linkable,
  // and follow back/forward navigation between tabs.
  useEffect(() => {
    window.history.replaceState(null, '', pathForMode('config', activeTab) + window.location.search);
  }, [activeTab]);
  useEffect(() => {
    const onPop = () => {
      const t = routeConfigTab(window.location.pathname);
      if (t) setActiveTab(t);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [disconnecting, setDisconnecting] = useState(false);
  async function handleTwitchDisconnect() {
    setDisconnecting(true);
    try {
      const r = await fetch('/api/twitch/disconnect', { method: 'POST' });
      if (r.ok) await reloadConfig();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full font-mono overflow-auto" style={{ paddingTop: topPad }}>
      <div className="mx-auto w-full max-w-[800px] px-4 sm:px-7">
        <div className="pt-6 flex justify-center">
          <Tabs
            options={CONFIG_TABS}
            value={activeTab}
            onChange={v => { if ((CONFIG_TABS as readonly string[]).includes(v)) setActiveTab(v as ConfigTab); }}
            aria-label="Config sections"
          />
        </div>

        <div className="mt-[4vh] pb-10 flex justify-center" aria-live="polite" aria-busy={!configData}>
        <div className="w-full text-xs">
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
                dualModule={dualModule}
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
                dualModule={dualModule}
              />
            )}
            {activeTab === 'appearance' && (
              <AppearanceTab
                {...(configData.appearance !== undefined ? { value: configData.appearance } : {})}
                onChange={v => patchConfig({ appearance: v })}
              />
            )}
            {activeTab === 'integrations' && (
              <IntegrationsTab config={configData} onChange={patchConfig} onDisconnect={() => void handleTwitchDisconnect()} disconnecting={disconnecting} />
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">loading…</p>
        )}
        </div>
      </div>
      </div>
    </div>
  );
}
