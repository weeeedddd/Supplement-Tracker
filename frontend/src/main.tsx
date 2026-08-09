import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyDocumentLanguage, lang } from './lib/i18n';
import '@fontsource/barlow-condensed/latin-400.css';
import '@fontsource/barlow-condensed/latin-ext-400.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-ext-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-ext-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-ext-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-ext-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-ext-700.css';
import './legacy.css';
import './app.css';
import './product-shell.css';
import './coreline-system.css';

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
  panel.style.cssText = 'max-width:440px;margin:18vh auto 0;padding:1.6rem;text-align:center;font-family:Manrope,system-ui,sans-serif;color:#eeeae0;background:#111516;border:1px solid rgba(238,234,224,.34);clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px)';

  const title = document.createElement('h1');
  title.textContent = lang === 'de' ? 'CORELINE konnte nicht starten' : 'CORELINE could not start';
  title.style.cssText = 'font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:1.4rem;letter-spacing:.08em;color:#eeeae0;margin:.5rem 0;text-transform:uppercase';
  const copy = document.createElement('p');
  copy.textContent = lang === 'de' ? 'Deine lokalen Daten wurden nicht verändert. Lade die App neu, um es erneut zu versuchen.' : 'Your local data has not been changed. Reload the app to try again.';
  copy.style.cssText = 'font-size:.78rem;color:#aaa79f;line-height:1.6';
  const detail = document.createElement('pre');
  detail.textContent = message;
  detail.style.cssText = 'font-size:.68rem;color:#ef8792;white-space:pre-wrap;word-break:break-word;text-align:left;background:rgba(239,102,117,.06);padding:.65rem;border:1px solid rgba(239,102,117,.3)';
  const retry = document.createElement('button');
  retry.textContent = lang === 'de' ? 'App neu laden' : 'Reload app';
  retry.style.cssText = 'min-height:44px;padding:.55rem 1.1rem;cursor:pointer;border:1px solid #78e7ed;background:#78e7ed;color:#061012;font:700 .78rem Manrope,system-ui,sans-serif;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)';
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
