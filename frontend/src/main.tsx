import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './legacy.css';
import './app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// ── PWA: Service Worker (Cache-First App-Shell) ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.info('[SHADOW~1] ◈ SW aktiv — Scope:', reg.scope))
      .catch(err => console.warn('[SHADOW~1] SW-Registrierung fehlgeschlagen:', err));
  });
}
