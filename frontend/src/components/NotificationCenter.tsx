import { useEffect, useMemo, useRef, useState } from 'react';

import { lang } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import {
  NOTIFICATION_UPDATED_EVENT,
  createActivationNotice,
  getSystemNotificationPermission,
  loadNotificationPreferences,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  processDueNotifications,
  requestSystemNotificationPermission,
  saveNotificationPreferences,
  type CorelineNotificationItem,
  type CorelineNotificationPermission,
} from '../lib/notifications';
import { showScreen } from '../lib/store';
import { SystemIcon, type SystemIconName } from './SystemIcon';
import '../notifications.css';

const copy = (de: string, en: string) => lang === 'de' ? de : en;

const KIND_ICON: Record<CorelineNotificationItem['kind'], SystemIconName> = {
  training: 'training',
  recovery: 'moon',
  supplements: 'supplements',
  system: 'spark',
};

function permissionLabel(permission: CorelineNotificationPermission): string {
  if (permission === 'granted') return copy('ANDROID-HINWEISE AKTIV', 'ANDROID NOTICES ACTIVE');
  if (permission === 'denied') return copy('NUR IN DER APP', 'IN-APP ONLY');
  if (permission === 'unsupported') return copy('NUR IN DER APP', 'IN-APP ONLY');
  return copy('BEREIT ZUM AKTIVIEREN', 'READY TO ENABLE');
}

function relativeDue(item: CorelineNotificationItem, now: number): string {
  const deltaMinutes = Math.round((item.dueAt - now) / 60_000);
  if (item.deliveredAt) {
    const ageMinutes = Math.max(0, Math.round((now - item.deliveredAt) / 60_000));
    if (ageMinutes < 1) return copy('gerade eben', 'just now');
    if (ageMinutes < 60) return copy(`vor ${ageMinutes} Min.`, `${ageMinutes}m ago`);
    const hours = Math.round(ageMinutes / 60);
    if (hours < 24) return copy(`vor ${hours} Std.`, `${hours}h ago`);
  }
  if (deltaMinutes > 0 && deltaMinutes < 60) return copy(`in ${deltaMinutes} Min.`, `in ${deltaMinutes}m`);
  if (deltaMinutes >= 60 && deltaMinutes < 1_440) return copy(`in ${Math.round(deltaMinutes / 60)} Std.`, `in ${Math.round(deltaMinutes / 60)}h`);
  return new Date(item.dueAt).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<CorelineNotificationItem[]>(() => loadNotifications());
  const [preferences, setPreferences] = useState(() => loadNotificationPreferences());
  const [permission, setPermission] = useState<CorelineNotificationPermission>(() => getSystemNotificationPermission());
  const [clock, setClock] = useState(() => Date.now());

  useModalIsolation(open, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: onClose,
  });

  useEffect(() => {
    const update = () => {
      setItems(loadNotifications());
      setPreferences(loadNotificationPreferences());
      setPermission(getSystemNotificationPermission());
      setClock(Date.now());
    };
    window.addEventListener(NOTIFICATION_UPDATED_EVENT, update);
    return () => window.removeEventListener(NOTIFICATION_UPDATED_EVENT, update);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    void processDueNotifications().then(setItems);
  }, [open]);

  const delivered = useMemo(() => items.filter(item => item.deliveredAt).slice(0, 20), [items]);
  const scheduled = useMemo(() => preferences.enabled
    ? items.filter(item => !item.deliveredAt).sort((a, b) => a.dueAt - b.dueAt).slice(0, 3)
    : [], [items, preferences.enabled]);
  const unread = delivered.filter(item => !item.readAt).length;

  const activate = async () => {
    const nextPermission = await requestSystemNotificationPermission();
    setPermission(nextPermission);
    const nextPreferences = saveNotificationPreferences({ enabled: true });
    setPreferences(nextPreferences);
    createActivationNotice();
    setItems(await processDueNotifications());
  };

  const openDestination = (item: CorelineNotificationItem) => {
    markNotificationRead(item.id);
    if (item.kind === 'supplements') showScreen('ki');
    if (item.kind === 'training' || item.kind === 'recovery') showScreen('training');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="product-modal notification-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="notification-center" role="dialog" aria-modal="true" aria-labelledby="notification-center-title">
        <header className="notification-header">
          <div>
            <span><SystemIcon name="bell" />SYSTEM LOG</span>
            <h2 id="notification-center-title">{copy('Benachrichtigungen', 'Notifications')}</h2>
          </div>
          <button ref={closeRef} className="system-icon-button" type="button" onClick={onClose} aria-label={copy('Benachrichtigungen schließen', 'Close notifications')}><SystemIcon name="close" /></button>
        </header>

        <div className="notification-status-line">
          <span className={preferences.enabled ? 'active' : ''}>{permissionLabel(permission)}</span>
          {unread > 0 && <b>{unread} {copy('neu', 'new')}</b>}
        </div>

        {!preferences.enabled && <section className="notification-equip-card">
          <SystemIcon name="bell" />
          <div>
            <strong>{copy('System-Impulse ausrüsten', 'Equip system prompts')}</strong>
            <p>{copy(
              'Aktiviere Trainings-, Regenerations- und optionale Routine-Erinnerungen. Die Zeiten bleiben auf diesem Gerät.',
              'Enable training, recovery, and optional routine reminders. Times stay on this device.',
            )}</p>
          </div>
          <button type="button" onClick={() => void activate()}>{copy('Aktivieren', 'Enable')}</button>
        </section>}

        {scheduled.length > 0 && <section className="notification-scheduled" aria-labelledby="scheduled-notifications-title">
          <div className="notification-section-title"><span id="scheduled-notifications-title">{copy('Nächste Impulse', 'Next prompts')}</span><small>{scheduled.length}</small></div>
          {scheduled.map(item => <article key={item.id}>
            <SystemIcon name={KIND_ICON[item.kind]} />
            <span><strong>{item.title}</strong><small>{relativeDue(item, clock)}</small></span>
          </article>)}
        </section>}

        <section className="notification-feed" aria-labelledby="notification-feed-title">
          <div className="notification-section-title">
            <span id="notification-feed-title">{copy('Systemverlauf', 'System history')}</span>
            {unread > 0 && <button type="button" onClick={() => setItems(markAllNotificationsRead())}>{copy('Alles gelesen', 'Mark all read')}</button>}
          </div>
          {delivered.length ? delivered.map(item => <article className={item.readAt ? 'read' : 'unread'} key={item.id}>
            <div className="notification-kind-icon"><SystemIcon name={KIND_ICON[item.kind]} /></div>
            <div>
              <span>{relativeDue(item, clock)}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              {item.kind !== 'system' && <button type="button" onClick={() => openDestination(item)}>{item.kind === 'supplements' ? copy('Routine öffnen', 'Open routine') : copy('Heatmap öffnen', 'Open heatmap')}<SystemIcon name="chevron" /></button>}
            </div>
          </article>) : <div className="notification-empty"><SystemIcon name="bell" /><strong>{copy('Noch keine Systemhinweise', 'No system notices yet')}</strong><p>{copy('Fällige Impulse erscheinen hier, ohne deinen Dashboard-Flow zu unterbrechen.', 'Due prompts appear here without interrupting your dashboard flow.')}</p></div>}
        </section>

        <footer className="notification-boundary"><SystemIcon name="info" /><span>{copy(
          'In dieser Stufe werden Systemhinweise ausgelöst, sobald CORELINE geöffnet oder wieder aktiv wird. Push bei vollständig geschlossener App folgt mit einem optionalen Backend.',
          'At this stage, system notices fire when CORELINE is open or becomes active again. Push while the app is fully closed will follow with an optional backend.',
        )}</span></footer>
      </section>
    </div>
  );
}
