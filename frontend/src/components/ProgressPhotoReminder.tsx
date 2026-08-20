import { useCallback, useEffect, useState } from 'react';

import { lang } from '../lib/i18n';
import { calculateProgressPhotoReminder, listProgressPhotoSets } from '../lib/progressPhotos';
import {
  getProgressPhotoPreferences,
  isProgressPhotoReminderSnoozed,
  PROGRESS_PHOTO_REMINDER_EVENT,
  snoozeProgressPhotoReminder,
} from '../lib/progressPhotoPreferences';
import { SystemIcon } from './SystemIcon';

import '../progress-photos.css';

export interface ProgressPhotoReminderProps {
  onOpen: () => void;
  eligible?: boolean;
  locale?: 'de' | 'en';
  className?: string;
}

export function ProgressPhotoReminder({
  onOpen,
  eligible = true,
  locale = lang === 'en' ? 'en' : 'de',
  className = '',
}: ProgressPhotoReminderProps) {
  const [visible, setVisible] = useState(false);

  const refresh = useCallback(async () => {
    if (!eligible) {
      setVisible(false);
      return;
    }
    try {
      const preferences = getProgressPhotoPreferences();
      if (!preferences.reminderEnabled || isProgressPhotoReminderSnoozed(preferences)) {
        setVisible(false);
        return;
      }
      const [latest] = await listProgressPhotoSets();
      const reminder = calculateProgressPhotoReminder(latest?.completedAt, preferences.cadenceWeeks);
      setVisible(reminder.hasBaseline && reminder.due);
    } catch {
      setVisible(false);
    }
  }, [eligible]);

  useEffect(() => {
    void refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onStorage = () => void refresh();
    window.addEventListener(PROGRESS_PHOTO_REMINDER_EVENT, onStorage);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(PROGRESS_PHOTO_REMINDER_EVENT, onStorage);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  if (!visible) return null;
  const c = (de: string, en: string) => locale === 'de' ? de : en;
  return (
    <aside className={`progress-photo-reminder ${className}`.trim()} aria-labelledby="progress-photo-reminder-title">
      <div className="progress-photo-reminder__mark"><SystemIcon name="camera" /></div>
      <div>
        <span className="progress-photo-kicker">{c('Optionaler Check-in', 'Optional check-in')}</span>
        <h2 id="progress-photo-reminder-title">{c('Zeit für einen privaten Vergleich', 'Time for a private comparison')}</h2>
        <p>{c(
          'Diese Erinnerung erscheint nur in der App. Fotos bleiben lokal und werden nicht analysiert.',
          'This reminder appears only in the app. Photos stay local and are not analysed.')}</p>
      </div>
      <div className="progress-photo-reminder__actions">
        <button type="button" className="progress-photo-primary" onClick={onOpen}>{c('Jetzt öffnen', 'Open now')}</button>
        <button type="button" className="progress-photo-secondary" onClick={() => {
          snoozeProgressPhotoReminder(7);
          setVisible(false);
        }}>{c('In 7 Tagen', 'In 7 days')}</button>
      </div>
    </aside>
  );
}
