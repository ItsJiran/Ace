import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// DEBUG: Raw DOM write - if this appears, JS is loading
const dbg = document.createElement('div');
dbg.id = '__ace_debug_banner';
dbg.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#1a1a2e;color:#00ff88;font-family:monospace;font-size:13px;padding:8px 16px;pointer-events:none;';
dbg.textContent = '[ACE] main.tsx loaded — React mounting...';
document.body.appendChild(dbg);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Remove banner after 5s
setTimeout(() => dbg.remove(), 5000);
