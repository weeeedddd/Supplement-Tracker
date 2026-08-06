import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyDocumentLanguage } from './lib/i18n';
import './legacy.css';
import './app.css';
import './product-shell.css';

applyDocumentLanguage();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label="app-root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

window.addEventListener('error', paintFatalIfBlank);
window.addEventListener('unhandledrejection', paintFatalIfBlank as EventListener);

function paintFatalIfBlank(event: ErrorEvent | PromiseRejectionEvent) {
  const root = document.getElementById('root');
  if (root && root.children.length > 0) return;

  const message = (event as ErrorEvent).message
    || String((event as PromiseRejectionEvent).reason || 'Unknown startup error');
  const panel = document.createElement('main');
  panel.style.cssText = 'max-width:420px;margin:18vh auto 0;padding:1.6rem;text-align:center;font-family:system-ui,sans-serif;color:#e8e0f5;background:rgba(14,12,24,.95);border:1px solid rgba(232,58,90,.4);border-radius:16px';

  const title = document.createElement('h1');
  title.textContent = 'CORELINE could not start';
  title.style.cssText = 'font-size:1rem;letter-spacing:.08em;color:#ff8ca3;margin:.5rem 0';
  const copy = document.createElement('p');
  copy.textContent = 'Your local data has not been changed. Reload the app to try again.';
  copy.style.cssText = 'font-size:.76rem;color:#a094c4;line-height:1.5';
  const detail = document.createElement('pre');
  detail.textContent = message;
  detail.style.cssText = 'font-size:.62rem;color:#ff8ca3;white-space:pre-wrap;word-break:break-word;text-align:left;background:rgba(232,58,90,.07);padding:.5rem;border-radius:8px';
  const retry = document.createElement('button');
  retry.textContent = 'Reload app';
  retry.style.cssText = 'padding:.55rem 1.1rem;border-radius:8px;cursor:pointer;border:1px solid #5eead4;background:transparent;color:#e8e0f5';
  retry.addEventListener('click', () => location.reload());

  panel.append(title, copy, detail, retry);
  document.body.replaceChildren(panel);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.info('[CORELINE] offline shell active:', registration.scope);
        void registration.update();
      })
      .catch(error => console.warn('[CORELINE] offline shell unavailable:', error));
  });
}
