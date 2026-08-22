import { useState } from 'react';

import { lang } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import {
  createActivationNotice,
  processDueNotifications,
  requestSystemNotificationPermission,
  saveNotificationPreferences,
} from '../lib/notifications';
import { enableClosedAppPush, type ClosedAppPushState } from '../lib/push';
import { S } from '../lib/storage';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string) => lang === 'de' ? de : en;

interface NotificationActivationPromptProps {
  open: boolean;
  onClose: () => void;
}

function resultMessage(state: ClosedAppPushState | null, permission: NotificationPermission | 'unsupported'): string {
  if (state === 'subscribed') return copy(
    'Aktiv. Erinnerungen können jetzt auch ankommen, wenn CORELINE geschlossen ist.',
    'Active. Reminders can now arrive even while CORELINE is closed.',
  );
  if (state === 'needs-account') return copy(
    'Gerätehinweise sind aktiv. Melde dich später einmal im Gildenbereich an; danach verbindet CORELINE den Hintergrund-Push automatisch.',
    'Device notices are active. Sign in once under Guild later; CORELINE will then connect background push automatically.',
  );
  if (permission === 'denied') return copy(
    'Der Browser blockiert Systemhinweise. Der In-App-Posteingang bleibt aktiv; die Berechtigung kannst du in Chrome ändern.',
    'The browser blocks system notices. The in-app inbox remains active; you can change the permission in Chrome.',
  );
  return copy(
    'In-App-Erinnerungen sind aktiv. Hintergrund-Push wird verbunden, sobald Browser, Konto und CORELINE-Dienst bereit sind.',
    'In-app reminders are active. Background push connects when the browser, account, and CORELINE service are ready.',
  );
}

export function NotificationActivationPrompt({ open, onClose }: NotificationActivationPromptProps) {
  const [activating, setActivating] = useState(false);
  const [result, setResult] = useState('');

  useModalIsolation(open, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: onClose,
  });

  if (!open) return null;

  const activate = async () => {
    setActivating(true);
    setResult('');
    const tracksSupplements = Boolean((S.get<unknown[]>('protocol') || []).length);
    const preferences = saveNotificationPreferences({
      enabled: true,
      training: true,
      recovery: true,
      hydration: true,
      meals: true,
      unfinishedSets: true,
      streakRescue: true,
      supplements: tracksSupplements,
    });
    const permission = await requestSystemNotificationPermission();
    let pushState: ClosedAppPushState | null = null;
    if (permission === 'granted') {
      try {
        pushState = (await enableClosedAppPush(preferences)).state;
      } catch {
        pushState = 'not-configured';
      }
    }
    createActivationNotice();
    await processDueNotifications();
    setResult(resultMessage(pushState, permission));
    setActivating(false);
  };

  return (
    <div className="product-modal notification-activation-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !activating) onClose();
    }}>
      <section className="notification-activation-window" role="dialog" aria-modal="true" aria-labelledby="notification-activation-title" onMouseDown={event => event.stopPropagation()}>
        <header>
          <span><SystemIcon name="bell" />{copy('SYSTEM-HINWEISE', 'SYSTEM NOTICES')}</span>
          <button type="button" onClick={onClose} disabled={activating} aria-label={copy('Später einrichten', 'Set up later')}><SystemIcon name="close" /></button>
        </header>
        <div className="notification-activation-body">
          <small>{copy('LETZTER AKTIVIERUNGSSCHRITT', 'FINAL ACTIVATION STEP')}</small>
          <h2 id="notification-activation-title">{copy('Soll CORELINE dich erinnern?', 'Should CORELINE remind you?')}</h2>
          <p>{copy(
            'Einmal aktivieren, danach arbeitet der System-Posteingang automatisch. Mit verbundenem Gildenkonto kommen Hinweise auch bei geschlossener App.',
            'Enable once, then the system inbox works automatically. With a connected Guild account, notices also arrive while the app is closed.',
          )}</p>
          <div className="notification-activation-list">
            <span><SystemIcon name="training" /><strong>{copy('Training & offene Sätze', 'Training & unfinished sets')}</strong></span>
            <span><SystemIcon name="food" /><strong>{copy('Mahlzeiten-Check', 'Meal check')}</strong></span>
            <span><SystemIcon name="water" /><strong>{copy('Trink-Check', 'Hydration check')}</strong></span>
            <span><SystemIcon name="history" /><strong>{copy('Recovery & Streak-Rettung', 'Recovery & streak rescue')}</strong></span>
          </div>
          <p className="notification-activation-boundary"><SystemIcon name="shield" />{copy(
            'Ruhezeit 22:00–07:00 ist voreingestellt. Alles lässt sich später pausieren oder einzeln ausschalten.',
            'Quiet hours 22:00–07:00 are preset. Everything can be paused or switched off individually later.',
          )}</p>
          {result && <p className="notification-activation-result" role="status"><SystemIcon name="check" />{result}</p>}
        </div>
        <footer>
          {result
            ? <button className="notification-activation-primary" type="button" onClick={onClose}>{copy('Fertig', 'Done')}</button>
            : <>
              <button className="notification-activation-later" type="button" onClick={onClose} disabled={activating}>{copy('Später', 'Later')}</button>
              <button className="notification-activation-primary" type="button" onClick={() => void activate()} disabled={activating}>
                <SystemIcon name="bell" />{activating ? copy('Wird aktiviert …', 'Activating…') : copy('Erinnerungen aktivieren', 'Enable reminders')}
              </button>
            </>}
        </footer>
      </section>
    </div>
  );
}
