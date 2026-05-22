import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { App } from './App.js';
import { AudioLab } from './components/AudioLab.js';
import { NotificationLab } from './components/NotificationLab.js';
import { TooltipProvider } from './components/ui/tooltip.js';

const params = new URLSearchParams(window.location.search);
const isLab = params.has('lab');
const labTab = params.get('lab');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLab
      ? <TooltipProvider>{labTab === 'notifications' ? <NotificationLab /> : <AudioLab />}</TooltipProvider>
      : <App />}
  </StrictMode>,
);
