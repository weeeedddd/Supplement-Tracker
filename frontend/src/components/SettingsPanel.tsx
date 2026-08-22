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
import {
  disableBackgroundReminders,
  enableBackgroundReminders,
  getBackgroundReminderStatus,
  publishBackgroundSchedule,
  type BackgroundReminderState,
} from '../lib/backgroundReminders';
import {
  getNativeNotificationPermission,
  isNativeApp,
  requestNativeNotificationPermission,
  syncNativeNotifications,
  type NativeNotificationPermission,
} from '../lib/nativeApp';
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
import { applyTheme, getCurrentTheme } from '../lib/themes';
import { SystemIcon } from './SystemIcon';

const THEME_CHOICES = [
  { id: 'shadow', de: 'Nacht', en: 'Night' },
  { id: 'system', de: 'Mondlicht', en: 'Moonlight' },
  { id: 'ghoul', de: 'Glut', en: 'Ember' },
] as const;

const RELEASE_LANGS = ['de', 'en'] as const;
const copy = (de: string, en: string) => lang === 'de' ? de : en;

function backgroundReminderLabel(state: BackgroundReminderState): string {
  const labels: Record<BackgroundReminderState, [string, string]> = {
    unsupported: ['Dieser Browser weckt die App nicht im Hintergrund', 'This browser cannot wake the app in the background'],
    'needs-notifications': ['Systemhinweise zuerst freigeben', 'Allow system notices first'],
    blocked: ['Der Browser blockiert Hinweise für diese App', 'The browser blocks notices for this app'],
    'needs-permission': ['Als App installieren, damit der Browser das Wecken erlaubt', 'Install as an app so the browser allows background wake-ups'],
    available: ['Bereit — kann ohne Backend eingeschaltet werden', 'Ready — can be switched on without a backend'],
    active: ['Aktiv: Erinnerungen laufen auch bei geschlossener App', 'Active: reminders also run while the app is closed'],
  };
  const [de, en] = labels[state];
  return copy(de, en);
}

function pushLabel(state: ClosedAppPushState): string {
  const labels: Record<ClosedAppPushState, [string, string]> = {
    unsupported: ['Geschlossener-App-Push wird hier nicht unterstützt', 'Closed-app push is unsupported here'],
    'needs-backend': ['Backend-URL für geschlossenen Push erforderlich', 'Backend URL required for closed-app push'],
    'needs-account': ['Im Gildenbereich anmelden, um Push zu verbinden', 'Sign in under Guild to connect push'],
    'not-configured': ['Server braucht noch VAPID-Schlüssel', 'Server still needs VAPID keys'],
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
  const [closedPushState, setClosedPushState] = useState<ClosedAppPushState>('unsupported');
  const [backgroundState, setBackgroundState] = useState<BackgroundReminderState>('unsupported');
  const [nativePermission, setNativePermission] = useState<NativeNotificationPermission>('unavailable');
  const [nativeScheduled, setNativeScheduled] = useState(0);

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
    void getClosedAppPushStatus()
      .then(status => setClosedPushState(status.state))
      .catch(() => setClosedPushState('not-configured'));
    void getBackgroundReminderStatus()
      .then(status => setBackgroundState(status.state))
      .catch(() => setBackgroundState('unsupported'));
    void getNativeNotificationPermission().then(setNativePermission).catch(() => setNativePermission('unavailable'));
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
    const next = saveNotificationPreferences(patch);
    setNotificationPreferences(next);
    if (closedPushState === 'subscribed') void syncClosedAppPushPreferences(next).catch(() => {
      setNotificationStatus(copy('Lokale Einstellung gespeichert; Server-Sync ist gerade nicht erreichbar.', 'Local setting saved; server sync is currently unavailable.'));
    });
    if (isNativeApp()) void syncNativeNotifications(next).then(setNativeScheduled);
    else void publishBackgroundSchedule();
    void processDueNotifications();
  };

  const activateNotifications = async () => {
    const permission = isNativeApp() ? 'granted' : await requestSystemNotificationPermission();
    setNotificationPermission(permission);
    const next = saveNotificationPreferences({ enabled: true });
    setNotificationPreferences(next);
    if (isNativeApp()) {
      const granted = await requestNativeNotificationPermission();
      setNativePermission(granted);
      setNativeScheduled(await syncNativeNotifications(next));
    }
    if (closedPushState === 'subscribed') {
      await syncClosedAppPushPreferences(next).catch(() => {
        setNotificationStatus(copy('Lokale Hinweise sind aktiv; der Push-Server ist gerade nicht erreichbar.', 'Local notices are active; the push server is currently unavailable.'));
      });
    }
    createActivationNotice();
    await publishBackgroundSchedule();
    await getBackgroundReminderStatus().then(status => setBackgroundState(status.state)).catch(() => undefined);
    await processDueNotifications();
    setNotificationStatus(permission === 'granted'
      ? isNativeApp()
        ? copy('Erinnerungen laufen als echte System-Alarme — auch wenn die App vollständig geschlossen ist.', 'Reminders now run as real system alarms — including while the app is fully closed.')
        : copy('Systemhinweise sind aktiv. CORELINE erinnert dich auf diesem Gerät zu deinen gewählten Zeiten.', 'System notices are active. CORELINE will remind you on this device at your selected times.')
      : copy('In-App-Erinnerungen sind aktiv. Der Browser hat Systemhinweise nicht freigegeben; du kannst die Browser-Berechtigung später ändern.', 'In-app reminders are active. The browser did not allow system notices; you can change the browser permission later.'));
  };

  const toggleBackgroundReminders = async (enable: boolean) => {
    if (enable) {
      const status = await enableBackgroundReminders();
      setBackgroundState(status.state);
      setNotificationStatus(status.state === 'active'
        ? copy('Der Browser weckt CORELINE jetzt regelmäßig für fällige Erinnerungen.', 'The browser will now wake CORELINE regularly for due reminders.')
        : copy('Der Browser hat das Wecken im Hintergrund nicht freigegeben. Installiere CORELINE als App oder nutze Hintergrund-Push mit Konto.', 'The browser did not allow background wake-ups. Install CORELINE as an app, or use background push with an account.'));
      return;
    }
    await disableBackgroundReminders();
    const status = await getBackgroundReminderStatus();
    setBackgroundState(status.state);
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
                'Lokale Hinweise arbeiten beim Öffnen der App. Mit Konto, Backend und VAPID kann CORELINE auch bei geschlossener App erinnern.',
                'Local notices work when the app opens. With an account, backend, and VAPID, CORELINE can also remind you while fully closed.',
              )}</small></span>
            </div>

            <div className={`notification-push-state ${closedPushState === 'subscribed' ? 'active' : ''}`}>
              <span><strong>{copy('Hintergrund-Push', 'Background push')}</strong><small>{pushLabel(closedPushState)}</small></span>
              {closedPushState === 'subscribed'
                ? <button type="button" className="secondary-button" onClick={() => void disableClosedAppPush().then(() => setClosedPushState('ready'))}>{copy('Trennen', 'Disconnect')}</button>
                : <button type="button" className="secondary-button" disabled={!['ready'].includes(closedPushState)} onClick={() => void connectClosedPush()}>{copy('Verbinden', 'Connect')}</button>}
            </div>

            <div className={`notification-push-state ${nativePermission === 'granted' || backgroundState === 'active' ? 'active' : ''}`}>
              <span>
                <strong>{copy('Erinnerungen bei geschlossener App', 'Reminders while the app is closed')}</strong>
                <small>{isNativeApp()
                  ? nativePermission === 'granted'
                    ? copy(`System-Alarme aktiv (${nativeScheduled} geplant)`, `System alarms active (${nativeScheduled} scheduled)`)
                    : copy('Erlaube CORELINE Benachrichtigungen in den Android-Einstellungen', 'Allow CORELINE notifications in the Android settings')
                  : backgroundReminderLabel(backgroundState)}</small>
              </span>
              {isNativeApp()
                ? <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void requestNativeNotificationPermission()
                    .then(async (granted) => {
                      setNativePermission(granted);
                      setNativeScheduled(await syncNativeNotifications(notificationPreferences));
                    })}
                >{copy('Neu planen', 'Reschedule')}</button>
                : backgroundState === 'active'
                  ? <button type="button" className="secondary-button" onClick={() => void toggleBackgroundReminders(false)}>{copy('Ausschalten', 'Switch off')}</button>
                  : <button
                    type="button"
                    className="secondary-button"
                    disabled={!['available', 'needs-permission'].includes(backgroundState)}
                    onClick={() => void toggleBackgroundReminders(true)}
                  >{copy('Einschalten', 'Switch on')}</button>}
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
