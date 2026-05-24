import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { App } from './App.js';
import { AudioLab } from './components/AudioLab.js';
import { NotificationLab } from './components/NotificationLab.js';
import { LifeLab } from './components/LifeLab.js';
import { Tabs } from './components/ui/tabs.js';
import { TooltipProvider } from './components/ui/tooltip.js';

type LabTab = 'audio' | 'notifications' | 'life';

const LAB_TABS: { value: LabTab; label: string }[] = [
  { value: 'audio',         label: 'audio'         },
  { value: 'notifications', label: 'notifications' },
  { value: 'life',          label: 'life'           },
];

function getInitialTab(): LabTab {
  const v = new URLSearchParams(window.location.search).get('lab');
  if (v === 'notifications' || v === 'audio' || v === 'life') return v;
  return 'audio';
}

function LabApp() {
  const [tab, setTab] = useState<LabTab>(getInitialTab);

  function handleTabChange(next: string) {
    setTab(next as LabTab);
    history.replaceState({}, '', `?lab=${next}`);
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      <div className="sticky top-0 z-10 bg-background px-5 pt-4">
        <Tabs aria-label="Lab section" options={LAB_TABS} value={tab} onChange={handleTabChange} />
      </div>
      {tab === 'audio'         && <AudioLab />}
      {tab === 'notifications' && <NotificationLab />}
      {tab === 'life'          && <LifeLab />}
    </div>
  );
}

const params = new URLSearchParams(window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {params.has('lab')
      ? <TooltipProvider><LabApp /></TooltipProvider>
      : <App />}
  </StrictMode>,
);
