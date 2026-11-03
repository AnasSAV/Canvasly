import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { Feedback } from './ui/Feedback';
import { TooltipLayer } from './ui/Tooltip';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Feedback />
    <TooltipLayer />
  </StrictMode>,
);
