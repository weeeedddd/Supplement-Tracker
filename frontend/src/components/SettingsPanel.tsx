import { useEffect, useRef, useState } from 'react';

import {
  checkBackendCapabilities,
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
import {
  disableClosedAppPush,
  enableClosedAppPush,
  getClosedAppPushStatus,
  snoozeClosedAppPush,
  syncClosedAppPushPreferences,
  type ClosedAppPushState,
} from '../lib/push';
import { deleteAllProgressPhotos } from '../lib/progressPhotos';
import { S } from '../lib/storage';
import { SystemIcon } from './SystemIcon';

const RELEASE_LANGS = ['de', 'en'] as const;
const copy = (de: string, en: string) => lang === 'de' ? de : en;

function pushLabel(state: ClosedAppPushState): string {
  const labels: Record<ClosedAppPushState, [string, string]> = {
    unsupported: ['Geschlossener-App-Push wird hier nicht unterstützt', 'Closed-app push is unsupported here'],
    'needs-backend': ['CORELINE-Dienste sind gerade nicht erreichbar', 'CORELINE services are temporarily unavailable'],
    'needs-account': ['Im Gildenbereich anmelden, um Push zu verbinden', 'Sign in under Guild to connect push'],
    'not-configured': ['Hintergrundhinweise werden noch eingerichtet', 'Background notifications are still being prepared'],
    'permission-denied': ['Browser-Berechtigung blockiert', 'Browser permission blocked'],
    ready: ['Bereit zum Verbinden', 'Ready to connect'],
    subscribed: ['Geschlossener-App-Push verbunden', 'Closed-app push connected'],
  };
  return copy(...labels[state]);
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onLocalReset: () => void;
  onBackendStatusChange?: (capabilities: BackendCapabilities) => void;
}

export function SettingsPanel({ open, onClose, onLocalReset, onBackendStatusChange }: SettingsPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [backendStatus, setBackendStatus] = useState('');
  const [checkingBackend, setCheckingBackend] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState(() => loadNotificationPreferences());
  const [notificationPermission, setNotificationPermission] = useState<CorelineNotificationPermission>(() => getSystemNotificationPermission());
  const [notificationStatus, setNotificationStatus] = useState('');
  const [closedPushState, setClosedPushState] = useState<ClosedAppPushState>('unsupported');

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
    setBackendStatus('');
    setNotificationPreferences(loadNotificationPreferences());
    setNotificationPermission(getSystemNotificationPermission());
    setNotificationStatus('');
    void getClosedAppPushStatus()
      .then(status => setClosedPushState(status.state))
      .catch(() => setClosedPushState('not-configured'));
    closeRef.current?.focus();
  }, [open]);

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

  const checkCorelineServices = async () => {
    setCheckingBackend(true);
    setBackendStatus(copy('CORELINE-Dienste werden geprüft …', 'Checking CORELINE services …'));
    const capabilities = await checkBackendCapabilities();
    onBackendStatusChange?.(capabilities);
    setCheckingBackend(false);
    if (!capabilities.reachable) {
      setBackendStatus(copy(
        'Die Online-Dienste sind gerade nicht erreichbar. Training, Ernährung und lokale Daten funktionieren weiter.',
        'Online services are temporarily unavailable. Training, nutrition, and local data keep working.',
      ));
      return;
    }
    if (capabilities.ai && capabilities.nearbyStores) {
      setBackendStatus(copy(
        'Alle CORELINE-Dienste sind bereit: Kontosync, KI-Planung und Standortsuche.',
        'All CORELINE services are ready: account sync, AI planning, and location search.',
      ));
      return;
    }
    const active = [
      capabilities.ai ? copy('KI-Planung', 'AI planning') : '',
      capabilities.nearbyStores ? copy('Standortsuche', 'location search') : '',
    ].filter(Boolean).join(' · ');
    setBackendStatus(copy(
      active ? `Kontosync ist bereit. Zusätzlich aktiv: ${active}.` : 'Kontosync ist bereit. Optionale KI- und Standortfunktionen sind noch nicht aktiviert.',
      active ? `Account sync is ready. Also active: ${active}.` : 'Account sync is ready. Optional AI and location features are not active yet.',
    ));
  };

  const updateNotificationPreferences = (patch: Partial<CorelineNotificationPreferences>) => {
    const next = saveNotificationPreferences(patch);
    setNotificationPreferences(next);
    if (closedPushState === 'subscribed') void syncClosedAppPushPreferences(next).catch(() => {
      setNotificationStatus(copy('Lokale Einstellung gespeichert; Server-Sync ist gerade nicht erreichbar.', 'Local setting saved; server sync is currently unavailable.'));
    });
    void processDueNotifications();
  };

  const activateNotifications = async () => {
    const permission = await requestSystemNotificationPermission();
    setNotificationPermission(permission);
    const next = saveNotificationPreferences({ enabled: true });
    setNotificationPreferences(next);
    if (closedPushState === 'subscribed') {
      await syncClosedAppPushPreferences(next).catch(() => {
        setNotificationStatus(copy('Lokale Hinweise sind aktiv; der Push-Server ist gerade nicht erreichbar.', 'Local notices are active; the push server is currently unavailable.'));
      });
    }
    createActivationNotice();
    await processDueNotifications();
    setNotificationStatus(permission === 'granted'
      ? copy('Systemhinweise sind aktiv. CORELINE erinnert dich auf diesem Gerät zu deinen gewählten Zeiten.', 'System notices are active. CORELINE will remind you on this device at your selected times.')
      : copy('In-App-Erinnerungen sind aktiv. Der Browser hat Systemhinweise nicht freigegeben; du kannst die Browser-Berechtigung später ändern.', 'In-app reminders are active. The browser did not allow system notices; you can change the browser permission later.'));
  };

  const connectClosedPush = async () => {
    setNotificationStatus(copy('Geschlossener-App-Push wird verbunden …', 'Connecting closed-app push …'));
    try {
      const enabledPreferences = notificationPreferences.enabled
        ? notificationPreferences
        : saveNotificationPreferences({ enabled: true });
      setNotificationPreferences(enabledPreferences);
      const next = await enableClosedAppPush(enabledPreferences);
      setClosedPushState(next.state);
      setNotificationStatus(pushLabel(next.state));
    } catch (error) {
      setNotificationStatus(copy(`Push konnte nicht verbunden werden: ${String((error as Error).message)}`, `Push could not be connected: ${String((error as Error).message)}`));
    }
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
              'Profil, Plan, Mahlzeiten und Einheiten funktionieren ohne Konto. Ein optionales CORELINE-Konto schaltet echte Freunde, Gilden, revisionssicheren Geräte-Sync und Hintergrund-Push frei; private lokale Notizen und Fotos werden nicht geteilt.',
              'Profile, plan, meals, and sessions work without an account. An optional CORELINE account unlocks real friends, Guilds, revision-safe device sync, and background push; private local notes and photos are not shared.',
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
                'Lokale Hinweise arbeiten beim Öffnen der App. Mit einem CORELINE-Konto können Erinnerungen auch bei geschlossener App ankommen.',
                'Local notices work when the app opens. With a CORELINE account, reminders can also arrive while the app is closed.',
              )}</small></span>
            </div>

            <div className={`notification-push-state ${closedPushState === 'subscribed' ? 'active' : ''}`}>
              <span><strong>{copy('Hintergrund-Push', 'Background push')}</strong><small>{pushLabel(closedPushState)}</small></span>
              {closedPushState === 'subscribed'
                ? <button type="button" className="secondary-button" onClick={() => void disableClosedAppPush().then(() => setClosedPushState('ready'))}>{copy('Trennen', 'Disconnect')}</button>
                : <button type="button" className="secondary-button" disabled={!['ready'].includes(closedPushState)} onClick={() => void connectClosedPush()}>{copy('Verbinden', 'Connect')}</button>}
            </div>

            <div className="notification-toggle-grid">
              <label><input type="checkbox" checked={notificationPreferences.training} onChange={event => updateNotificationPreferences({ training: event.target.checked })} /><span><strong>{copy('Trainings-Quest', 'Training quest')}</strong><small>{copy('An ausgewählten Wochentagen', 'On selected weekdays')}</small></span></label>
              <label><input type="checkbox" checked={notificationPreferences.recovery} onChange={event => updateNotificationPreferences({ recovery: event.target.checked })} /><span><strong>{copy('Regenerations-Check', 'Recovery check')}</strong><small>{copy('Etwa 20 Stunden nach einer Einheit', 'About 20 hours after a session')}</small></span></label>
              <label><input type="checkbox" checked={notificationPreferences.supplements} onChange={event => updateNotificationPreferences({ supplements: event.target.checked })} /><span><strong>{copy('Routine-Check', 'Routine check')}</strong><small>{copy('Nur für bewusst getrackte Produkte', 'Only for deliberately tracked products')}</small></span></label>
              <label><input type="checkbox" checked={notificationPreferences.unfinishedSets} onChange={event => updateNotificationPreferences({ unfinishedSets: event.target.checked })} /><span><strong>{copy('Offene-Sätze-Check', 'Unfinished-set check')}</strong><small>{copy('Fragt nach begonnenen, nicht bestätigten Sätzen', 'Checks started sets that were not confirmed')}</small></span></label>
              <label><input type="checkbox" checked={notificationPreferences.streakRescue} onChange={event => updateNotificationPreferences({ streakRescue: event.target.checked })} /><span><strong>{copy('Streak-Rettung', 'Streak rescue')}</strong><small>{copy('Bietet abends eine leichte adaptive Quest an', 'Offers a light adaptive quest in the evening')}</small></span></label>
              <label><input type="checkbox" checked={notificationPreferences.hydration} onChange={event => updateNotificationPreferences({ hydration: event.target.checked })} /><span><strong>{copy('Trink-Check', 'Hydration check')}</strong><small>{copy('Optionale Gedächtnisstütze, kein medizinisches Ziel', 'Optional memory aid, not a medical target')}</small></span></label>
              <label><input type="checkbox" checked={notificationPreferences.meals} onChange={event => updateNotificationPreferences({ meals: event.target.checked })} /><span><strong>{copy('Mahlzeiten-Check', 'Meal check')}</strong><small>{copy('Fragt nur, wenn noch nichts erfasst wurde', 'Only asks when nothing was logged')}</small></span></label>
            </div>

            <div className="notification-time-grid">
              <label>{copy('Trainingszeit', 'Training time')}<input type="time" value={notificationPreferences.trainingTime} onChange={event => updateNotificationPreferences({ trainingTime: event.target.value })} /></label>
              <label>{copy('Routinezeit', 'Routine time')}<input type="time" value={notificationPreferences.supplementTime} onChange={event => updateNotificationPreferences({ supplementTime: event.target.value })} /></label>
              <label>{copy('Ruhezeit ab', 'Quiet from')}<input type="time" value={notificationPreferences.quietStart} onChange={event => updateNotificationPreferences({ quietStart: event.target.value })} /></label>
              <label>{copy('Ruhezeit bis', 'Quiet until')}<input type="time" value={notificationPreferences.quietEnd} onChange={event => updateNotificationPreferences({ quietEnd: event.target.value })} /></label>
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
                  updateNotificationPreferences({ enabled: false });
                  setNotificationStatus(copy('Erinnerungen wurden pausiert.', 'Reminders were paused.'));
                }}>{copy('Erinnerungen pausieren', 'Pause reminders')}</button>
                : <button className="secondary-button" type="button" onClick={() => void activateNotifications()}>{copy('Benachrichtigungen aktivieren', 'Enable notifications')}</button>}
              <button className="secondary-button" type="button" onClick={() => {
                updateNotificationPreferences({ snoozedUntil: Date.now() + 60 * 60_000 });
                if (closedPushState === 'subscribed') void snoozeClosedAppPush(60);
                setNotificationStatus(copy('Alle Erinnerungen für 1 Stunde pausiert.', 'All reminders snoozed for 1 hour.'));
              }}>{copy('1 Std. snoozen', 'Snooze 1h')}</button>
            </div>
            {notificationStatus && <p role="status">{notificationStatus}</p>}
          </div>
        </details>

        <details className="settings-section settings-integration">
          <summary>
            <span>
              <strong>{copy('CORELINE-Dienste', 'CORELINE services')}</strong>
              <small>{copy('Kontosync, echte KI und Standortsuche', 'Account sync, real AI, and location search')}</small>
            </span>
            <SystemIcon name="chevron" />
          </summary>
          <div className="settings-integration-body">
            <div className="notification-settings-status">
              <SystemIcon name="shield" />
              <span><strong>{copy('Automatisch verwaltet', 'Managed automatically')}</strong><small>{copy('Keine technische Einrichtung in der App nötig. Zugangsdaten und KI-Schlüssel bleiben geschützt auf dem CORELINE-Server.', 'No technical setup is needed in the app. Credentials and AI keys stay protected on the CORELINE server.')}</small></span>
            </div>
            <div className="settings-backend-actions">
              <button className="secondary-button" type="button" onClick={() => void checkCorelineServices()} disabled={checkingBackend}>
                {checkingBackend ? copy('Prüfe …', 'Checking …') : copy('Systemstatus prüfen', 'Check system status')}
              </button>
            </div>
            {backendStatus && <p role="status">{backendStatus}</p>}
          </div>
        </details>

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
