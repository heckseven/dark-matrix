import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { App } from './App.js';
import { AudioLab } from './components/AudioLab.js';
import { TooltipProvider } from './components/ui/tooltip.js';

const isLab = new URLSearchParams(window.location.search).has('lab');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLab ? <TooltipProvider><AudioLab /></TooltipProvider> : <App />}
  </StrictMode>,
);
