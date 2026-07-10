import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './legacy.css';
import './app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label="app-root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// ── Letzte Rettungsebene: Fehler AUSSERHALB von React (z. B. beim Boot)
//    dürfen nie einen stummen schwarzen Screen hinterlassen.
window.addEventListener('error', paintFatalIfBlank);
window.addEventListener('unhandledrejection', paintFatalIfBlank as any);
function paintFatalIfBlank(ev: ErrorEvent | PromiseRejectionEvent) {
  const root = document.getElementById('root');
  if (root && root.children.length > 0) return;   // App lebt — nichts tun
  const msg = (ev as ErrorEvent).message || String((ev as PromiseRejectionEvent).reason || 'Unbekannter Fehler');
  document.body.innerHTML = `
    <div style="max-width:420px;margin:18vh auto 0;padding:1.6rem;text-align:center;
      font-family:system-ui,sans-serif;color:#e8e0f5;background:rgba(14,12,24,.95);
      border:1px solid rgba(232,58,90,.4);border-radius:16px">
      <div style="font-size:2rem;color:#e83a5a">◈</div>
      <h2 style="font-size:.95rem;letter-spacing:.16em;color:#e83a5a;margin:.5rem 0">RISS IN DER VOID</h2>
      <p style="font-size:.76rem;color:#a094c4;line-height:1.5">Die App konnte nicht starten. / The app failed to boot.</p>
      <pre style="font-size:.62rem;color:#e83a5a;white-space:pre-wrap;word-break:break-word;text-align:left;
        background:rgba(232,58,90,.07);padding:.5rem;border-radius:8px">${msg.replace(/</g, '&lt;')}</pre>
      <button onclick="location.reload()" style="padding:.55rem 1.1rem;border-radius:8px;cursor:pointer;
        border:1px solid #a855f7;background:transparent;color:#e8e0f5">◈ Neu starten</button>
    </div>`;
}

// ── PWA: Service Worker (Cache-First App-Shell) ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.info('[SHADOW~1] ◈ SW aktiv — Scope:', reg.scope))
      .catch(err => console.warn('[SHADOW~1] SW-Registrierung fehlgeschlagen:', err));
  });
}
