import { useEffect, useRef, useState } from 'react';

import { backendHealth, getBackendUrl, setBackendUrl } from '../lib/backend';
import { LANG_NAMES, LANGS, lang, setLang } from '../lib/i18n';
import { collectExportableLocalData, LOCAL_SYNC_STATE } from '../lib/localMode';
import { S } from '../lib/storage';
import { applyTheme, getCurrentTheme } from '../lib/themes';
import { SystemIcon } from './SystemIcon';

const THEME_CHOICES = [
  { id: 'shadow', label: 'Nacht' },
  { id: 'system', label: 'Mondlicht' },
  { id: 'ghoul', label: 'Ember' },
] as const;

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onLocalReset: () => void;
}

function validSecureBackendUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const localDev = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return url.protocol === 'https:' || (localDev && url.protocol === 'http:');
  } catch {
    return false;
  }
}

export function SettingsPanel({ open, onClose, onLocalReset }: SettingsPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [backendDraft, setBackendDraft] = useState('');
  const [backendStatus, setBackendStatus] = useState('');
  const [checkingBackend, setCheckingBackend] = useState(false);

  useEffect(() => {
    if (!open) {
      setResetArmed(false);
      return;
    }
    setBackendDraft(getBackendUrl());
    setBackendStatus('');
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const exportData = () => {
    const snapshot = collectExportableLocalData(localStorage);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coreline-backup-${snapshot.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetLocalData = () => {
    const appKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(S._p)) appKeys.push(key);
    }
    appKeys.forEach((key) => localStorage.removeItem(key));
    onClose();
    onLocalReset();
  };

  const saveAndCheckBackend = async () => {
    const normalized = backendDraft.trim().replace(/\/+$/, '');
    if (normalized && !validSecureBackendUrl(normalized)) {
      setBackendStatus('Nutze HTTPS. Unsicheres HTTP ist nur für localhost in der Entwicklung erlaubt.');
      return;
    }
    setBackendUrl(normalized);
    if (!normalized) {
      setBackendStatus('Backend-Verbindung entfernt. Alle lokalen Funktionen bleiben verfügbar.');
      return;
    }
    setCheckingBackend(true);
    setBackendStatus('Verbindung wird geprüft …');
    const healthy = await backendHealth();
    setCheckingBackend(false);
    setBackendStatus(healthy
      ? 'Backend erreichbar. KI und Standortsuche werden pro Anfrage weiterhin separat geprüft.'
      : 'Backend nicht erreichbar. URL wurde gespeichert; die App fällt weiterhin sicher auf lokale Funktionen zurück.');
  };

  return (
    <div className="product-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <h2 id="settings-title">Einstellungen & Daten</h2>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Einstellungen schließen"><SystemIcon name="close" /></button>
        </header>

        <div className="settings-section sync-state" aria-label="Konto- und Synchronisierungsstatus">
          <div className="status-dot" aria-hidden="true" />
          <div>
            <strong>Auf diesem Gerät gespeichert</strong>
            <p>Profil, Plan, Mahlzeiten und Einheiten funktionieren ohne Konto. Cloud-Konten und verschlüsselte Synchronisierung sind zukünftige Integrationen und werden hier nicht vorgetäuscht.</p>
            <code>{LOCAL_SYNC_STATE.mode} · Schema {LOCAL_SYNC_STATE.schemaVersion}</code>
          </div>
        </div>

        <div className="settings-section">
          <strong>Sicheres Backend für echte KI & Karten</strong>
          <p>Nur die Server-URL gehört hier hinein. OpenAI- und Karten-API-Schlüssel bleiben ausschließlich als Server-Umgebungsvariablen im Backend.</p>
          <label className="system-field settings-backend-field">
            Backend-URL
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://api.example.com"
              value={backendDraft}
              onChange={(event) => setBackendDraft(event.target.value)}
            />
          </label>
          <div className="settings-backend-actions">
            <button className="secondary-button" type="button" onClick={() => void saveAndCheckBackend()} disabled={checkingBackend}>
              {checkingBackend ? 'Prüfe …' : 'Speichern & prüfen'}
            </button>
          </div>
          {backendStatus && <p role="status">{backendStatus}</p>}
        </div>

        <div className="settings-grid">
          <fieldset className="settings-section">
            <legend>Sprache</legend>
            <div className="choice-row">
              {LANGS.map((code) => (
                <button key={code} className={lang === code ? 'choice active' : 'choice'}
                  onClick={() => setLang(code)} aria-pressed={lang === code}>
                  {LANG_NAMES[code] || code.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Darstellung</legend>
            <div className="choice-row">
              {THEME_CHOICES.map((choice) => (
                <button key={choice.id} className={getCurrentTheme() === choice.id ? 'choice active' : 'choice'}
                  onClick={() => applyTheme(choice.id)} aria-pressed={getCurrentTheme() === choice.id}>
                  {choice.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="settings-section data-actions">
          <div>
            <strong>Lokales Backup</strong>
            <p>Lade eine JSON-Sicherung herunter. Veraltete Demo-Anmeldedaten werden immer ausgeschlossen.</p>
          </div>
          <button className="secondary-button" onClick={exportData}>Daten exportieren</button>
        </div>

        <div className="settings-section danger-zone">
          <div>
            <strong>Dieses Gerät zurücksetzen</strong>
            <p>Löscht alle CORELINE-Daten in diesem Browser. Exportiere vorher ein Backup, wenn du sie behalten möchtest.</p>
          </div>
          {!resetArmed ? (
            <button className="danger-button" onClick={() => setResetArmed(true)}>Zurücksetzen vorbereiten</button>
          ) : (
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setResetArmed(false)}>Abbrechen</button>
              <button className="danger-button" onClick={resetLocalData}>Lokale Daten löschen</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
