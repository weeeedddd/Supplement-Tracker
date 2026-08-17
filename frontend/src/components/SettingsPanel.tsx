import { useEffect, useRef, useState } from 'react';

import {
  checkBackendCapabilities,
  getBackendUrl,
  setBackendUrl,
  type BackendCapabilities,
} from '../lib/backend';
import { LANG_NAMES, lang, setLang } from '../lib/i18n';
import { collectExportableLocalData, LOCAL_SYNC_STATE } from '../lib/localMode';
import { useModalIsolation } from '../lib/modal';
import {
  createActivationNotice,
  getSystemNotificationPermission,
  loadNotificationPreferences,
  processDueNotifications,
  requestSystemNotificationPermission,
  saveNotificationPreferences,
  type CorelineNotificationPermission,
  type CorelineNotificationPreferences,
} from '../lib/notifications';
import { deleteAllProgressPhotos } from '../lib/progressPhotos';
import { S } from '../lib/storage';
import { applyTheme, getCurrentTheme } from '../lib/themes';
import { SystemIcon } from './SystemIcon';

const THEME_CHOICES = [
  { id: 'shadow', de: 'Nacht', en: 'Night' },
  { id: 'system', de: 'Mondlicht', en: 'Moonlight' },
  { id: 'ghoul', de: 'Glut', en: 'Ember' },
] as const;

const RELEASE_LANGS = ['de', 'en'] as const;
const copy = (de: string, en: string) => lang === 'de' ? de : en;

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onLocalReset: () => void;
  onBackendStatusChange?: (capabilities: BackendCapabilities) => void;
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

export function SettingsPanel({ open, onClose, onLocalReset, onBackendStatusChange }: SettingsPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [backendDraft, setBackendDraft] = useState('');
  const [backendStatus, setBackendStatus] = useState('');
  const [checkingBackend, setCheckingBackend] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState(() => loadNotificationPreferences());
  const [notificationPermission, setNotificationPermission] = useState<CorelineNotificationPermission>(() => getSystemNotificationPermission());
  const [notificationStatus, setNotificationStatus] = useState('');

  useModalIsolation(open, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: onClose,
  });

  useEffect(() => {
    if (!open) {
      setResetArmed(false);
      setResetStatus('');
      return;
    }
    setBackendDraft(getBackendUrl());
    setBackendStatus('');
    setNotificationPreferences(loadNotificationPreferences());
    setNotificationPermission(getSystemNotificationPermission());
    setNotificationStatus('');
    closeRef.current?.focus();
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

  const resetLocalData = async () => {
    setResetting(true);
    setResetStatus('');
    try {
      await deleteAllProgressPhotos();
    } catch {
      setResetStatus(copy(
        'Die private Fotobibliothek konnte nicht gelöscht werden. Andere Daten wurden deshalb noch nicht verändert. Prüfe den Browserspeicher und versuche es erneut.',
        'The private photo library could not be deleted. Other data was left unchanged. Check browser storage and try again.',
      ));
      setResetting(false);
      return;
    }
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
      setBackendStatus(copy(
        'Nutze HTTPS. Unsicheres HTTP ist nur für localhost in der Entwicklung erlaubt.',
        'Use HTTPS. Insecure HTTP is allowed only for localhost during development.',
      ));
      return;
    }
    setBackendUrl(normalized);
    if (!normalized) {
      setBackendStatus(copy(
        'Backend-Verbindung entfernt. Alle lokalen Funktionen bleiben verfügbar.',
        'Backend connection removed. All local features remain available.',
      ));
      return;
    }
    setCheckingBackend(true);
    setBackendStatus(copy('Verbindung wird geprüft …', 'Checking connection …'));
    const capabilities = await checkBackendCapabilities();
    onBackendStatusChange?.(capabilities);
    setCheckingBackend(false);
    if (!capabilities.reachable) {
      setBackendStatus(copy(
        'Backend nicht erreichbar. URL wurde gespeichert; die App fällt weiterhin sicher auf lokale Funktionen zurück.',
        'Backend unavailable. The URL was saved; the app continues to fall back safely to local features.',
      ));
      return;
    }
    if (capabilities.ai && capabilities.nearbyStores) {
      setBackendStatus(copy(
        'Backend erreichbar. OpenAI und Google Maps sind serverseitig freigegeben; jede echte Anfrage wird weiterhin separat geprüft.',
        'Backend reachable. OpenAI and Google Maps are enabled server-side; every real request is still checked separately.',
      ));
      return;
    }
    const missing = [
      !capabilities.ai ? copy('OpenAI', 'OpenAI') : '',
      !capabilities.nearbyStores ? copy('Google Maps', 'Google Maps') : '',
    ].filter(Boolean).join(' + ');
    setBackendStatus(copy(
      `Backend erreichbar. ${missing} ist serverseitig nicht freigegeben; lokale Funktionen bleiben aktiv.`,
      `Backend reachable. ${missing} is not enabled server-side; local features remain active.`,
    ));
  };

  const updateNotificationPreferences = (patch: Partial<CorelineNotificationPreferences>) => {
    setNotificationPreferences(saveNotificationPreferences(patch));
    void processDueNotifications();
  };

  const activateNotifications = async () => {
    const permission = await requestSystemNotificationPermission();
    setNotificationPermission(permission);
    setNotificationPreferences(saveNotificationPreferences({ enabled: true }));
    createActivationNotice();
    await processDueNotifications();
    setNotificationStatus(permission === 'granted'
      ? copy('Systemhinweise sind aktiv. CORELINE erinnert dich auf diesem Gerät zu deinen gewählten Zeiten.', 'System notices are active. CORELINE will remind you on this device at your selected times.')
      : copy('In-App-Erinnerungen sind aktiv. Der Browser hat Systemhinweise nicht freigegeben; du kannst die Browser-Berechtigung später ändern.', 'In-app reminders are active. The browser did not allow system notices; you can change the browser permission later.'));
  };

  return (
    <div className="product-modal" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <h2 id="settings-title">{copy('Einstellungen & Daten', 'Settings & data')}</h2>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label={copy('Einstellungen schließen', 'Close settings')}><SystemIcon name="close" /></button>
        </header>

        <section className="settings-section sync-state" aria-labelledby="local-storage-status-title">
          <div className="status-dot" aria-hidden="true" />
          <div>
            <h3 id="local-storage-status-title">{copy('Auf diesem Gerät gespeichert', 'Stored on this device')}</h3>
            <p>{copy(
              'Profil, Plan, Mahlzeiten und Einheiten funktionieren ohne Konto. Cloud-Konten und verschlüsselte Synchronisierung sind zukünftige Integrationen und werden hier nicht vorgetäuscht.',
              'Profile, plan, meals, and sessions work without an account. Cloud accounts and encrypted sync are future integrations and are not simulated here.',
            )}</p>
            <code>{LOCAL_SYNC_STATE.mode} · Schema {LOCAL_SYNC_STATE.schemaVersion}</code>
          </div>
        </section>

        <details className="settings-section settings-integration notification-settings">
          <summary>
            <span>
              <strong>{copy('Benachrichtigungen', 'Notifications')}</strong>
              <small>{notificationPreferences.enabled ? copy('Training, Regeneration und Routine auf diesem Gerät', 'Training, recovery, and routine on this device') : copy('Noch nicht aktiviert', 'Not enabled yet')}</small>
            </span>
            <SystemIcon name="chevron" />
          </summary>
          <div className="settings-integration-body">
            <div className="notification-settings-status">
              <SystemIcon name="bell" />
              <span><strong>{notificationPermission === 'granted' ? copy('Android-Systemhinweise verfügbar', 'Android system notices available') : copy('In-App-Systemlog verfügbar', 'In-app system log available')}</strong><small>{copy(
                'Fällige Hinweise erscheinen, sobald CORELINE geöffnet oder wieder aktiv wird. Push bei vollständig geschlossener App benötigt später ein optionales Backend.',
                'Due notices appear when CORELINE is open or becomes active again. Push while the app is fully closed will require an optional backend later.',
              )}</small></span>
            </div>

            <div className="notification-toggle-grid">
              <label><input type="checkbox" checked={notificationPreferences.training} onChange={event => updateNotificationPreferences({ training: event.target.checked })} /><span><strong>{copy('Trainings-Quest', 'Training quest')}</strong><small>{copy('An ausgewählten Wochentagen', 'On selected weekdays')}</small></span></label>
              <label><input type="checkbox" checked={notificationPreferences.recovery} onChange={event => updateNotificationPreferences({ recovery: event.target.checked })} /><span><strong>{copy('Regenerations-Check', 'Recovery check')}</strong><small>{copy('Etwa 20 Stunden nach einer Einheit', 'About 20 hours after a session')}</small></span></label>
              <label><input type="checkbox" checked={notificationPreferences.supplements} onChange={event => updateNotificationPreferences({ supplements: event.target.checked })} /><span><strong>{copy('Routine-Check', 'Routine check')}</strong><small>{copy('Nur für bewusst getrackte Produkte', 'Only for deliberately tracked products')}</small></span></label>
            </div>

            <div className="notification-time-grid">
              <label>{copy('Trainingszeit', 'Training time')}<input type="time" value={notificationPreferences.trainingTime} onChange={event => updateNotificationPreferences({ trainingTime: event.target.value })} /></label>
              <label>{copy('Routinezeit', 'Routine time')}<input type="time" value={notificationPreferences.supplementTime} onChange={event => updateNotificationPreferences({ supplementTime: event.target.value })} /></label>
            </div>

            <fieldset className="notification-day-picker">
              <legend>{copy('Trainingstage', 'Training days')}</legend>
              <div>{[
                [1, copy('Mo', 'Mon')],
                [2, copy('Di', 'Tue')],
                [3, copy('Mi', 'Wed')],
                [4, copy('Do', 'Thu')],
                [5, copy('Fr', 'Fri')],
                [6, copy('Sa', 'Sat')],
                [0, copy('So', 'Sun')],
              ].map(([day, label]) => {
                const active = notificationPreferences.trainingDays.includes(day as number);
                return <button key={day} type="button" className={active ? 'active' : ''} aria-pressed={active} onClick={() => updateNotificationPreferences({
                  trainingDays: active
                    ? notificationPreferences.trainingDays.filter(value => value !== day)
                    : [...notificationPreferences.trainingDays, day as number],
                })}>{label}</button>;
              })}</div>
            </fieldset>

            <div className="settings-backend-actions">
              {notificationPreferences.enabled
                ? <button className="secondary-button" type="button" onClick={() => {
                  setNotificationPreferences(saveNotificationPreferences({ enabled: false }));
                  setNotificationStatus(copy('Erinnerungen wurden pausiert.', 'Reminders were paused.'));
                }}>{copy('Erinnerungen pausieren', 'Pause reminders')}</button>
                : <button className="secondary-button" type="button" onClick={() => void activateNotifications()}>{copy('Benachrichtigungen aktivieren', 'Enable notifications')}</button>}
            </div>
            {notificationStatus && <p role="status">{notificationStatus}</p>}
          </div>
        </details>

        <details className="settings-section settings-integration">
          <summary>
            <span>
              <strong>{copy('Integrationen & erweitertes Backend', 'Integrations & advanced backend')}</strong>
              <small>{copy('Optional für echte KI und die Standortsuche', 'Optional for real AI and location search')}</small>
            </span>
            <SystemIcon name="chevron" />
          </summary>
          <div className="settings-integration-body">
            <p>{copy(
              'Nur die Server-URL gehört hier hinein. OpenAI- und Karten-API-Schlüssel bleiben ausschließlich als Server-Umgebungsvariablen im Backend.',
              'Only the server URL belongs here. OpenAI and maps API keys remain server-side environment variables in the backend.',
            )}</p>
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
                {checkingBackend ? copy('Prüfe …', 'Checking …') : copy('Speichern & prüfen', 'Save & check')}
              </button>
            </div>
            {backendStatus && <p role="status">{backendStatus}</p>}
          </div>
        </details>

        <div className="settings-grid">
          <fieldset className="settings-section">
            <legend>{copy('Sprache', 'Language')}</legend>
            <div className="choice-row">
              {RELEASE_LANGS.map((code) => (
                <button key={code} className={lang === code ? 'choice active' : 'choice'}
                  type="button" onClick={() => setLang(code)} aria-pressed={lang === code}>
                  {LANG_NAMES[code] || code.toUpperCase()}
                </button>
              ))}
            </div>
            <p>{copy('Die Kernoberfläche ist auf Deutsch und Englisch verfügbar; gespeicherte Inhalte und Anbieter-Ergebnisse können ihre Ausgangssprache behalten.', 'The core interface is available in German and English; saved content and provider results may retain their source language.')}</p>
          </fieldset>

          <fieldset className="settings-section">
            <legend>{copy('Darstellung', 'Appearance')}</legend>
            <div className="choice-row">
              {THEME_CHOICES.map((choice) => (
                <button key={choice.id} className={getCurrentTheme() === choice.id ? 'choice active' : 'choice'}
                  type="button" onClick={() => applyTheme(choice.id)} aria-pressed={getCurrentTheme() === choice.id}>
                  {lang === 'de' ? choice.de : choice.en}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="settings-section data-actions">
          <div>
            <strong>{copy('Lokales Backup', 'Local backup')}</strong>
            <p>{copy('Lade eine JSON-Sicherung herunter. Fortschrittsfotos und veraltete Demo-Anmeldedaten sind bewusst nicht enthalten.', 'Download a JSON backup. Progress photos and obsolete demo credentials are deliberately excluded.')}</p>
          </div>
          <button className="secondary-button" type="button" onClick={exportData}>{copy('Daten exportieren', 'Export data')}</button>
        </div>

        <div className="settings-section danger-zone">
          <div>
            <strong>{copy('Dieses Gerät zurücksetzen', 'Reset this device')}</strong>
            <p>{copy('Löscht alle CORELINE-Daten einschließlich Fortschrittsfotos in diesem Browser. Fotos sind nicht im JSON-Backup enthalten und werden endgültig entfernt.', 'Deletes all CORELINE data, including progress photos, in this browser. Photos are not part of the JSON backup and will be permanently removed.')}</p>
          </div>
          {!resetArmed ? (
            <button className="danger-button" type="button" onClick={() => setResetArmed(true)}>{copy('Zurücksetzen vorbereiten', 'Prepare reset')}</button>
          ) : (
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setResetArmed(false)}>{copy('Abbrechen', 'Cancel')}</button>
              <button className="danger-button" type="button" disabled={resetting} onClick={() => void resetLocalData()}>{resetting ? copy('Wird gelöscht …', 'Deleting…') : copy('Lokale Daten löschen', 'Delete local data')}</button>
            </div>
          )}
          {resetStatus && <p className="system-inline-error" role="alert">{resetStatus}</p>}
        </div>
      </section>
    </div>
  );
}
