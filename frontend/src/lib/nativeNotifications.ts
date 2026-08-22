import type { LocalNotificationSchema } from '@capacitor/local-notifications';

import { lang } from './i18n';
import {
  isNativeAndroidApp,
  rememberNativeNotificationPermission,
} from './nativePlatform';
import {
  loadNotificationPreferences,
  syncScheduledNotifications,
  type CorelineNotificationItem,
  type CorelineNotificationPreferences,
} from './notifications';
import { S } from './storage';

export const NATIVE_NOTIFICATION_CHANNEL = 'coreline-system';
export const NATIVE_NOTIFICATION_ID_START = 700_000_000;
export const NATIVE_NOTIFICATION_ID_END = 799_999_999;
const DEFAULT_HORIZON_DAYS = 14;
const MAX_SCHEDULED_NOTICES = 96;

interface NativeReminderOptions {
  now?: number;
  horizonDays?: number;
  hasTrackedRoutine?: boolean;
  streakCount?: number;
  pendingItems?: CorelineNotificationItem[];
}

function text(de: string, en: string, language: string): string {
  return language === 'de' ? de : en;
}

function clockMinutes(clock: string): number {
  const [hour, minute] = clock.split(':').map(Number);
  return hour * 60 + minute;
}

function allowedDuringQuietHours(
  date: Date,
  preferences: CorelineNotificationPreferences,
): boolean {
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = clockMinutes(preferences.quietStart);
  const end = clockMinutes(preferences.quietEnd);
  if (start === end) return true;
  if (start < end) return minute < start || minute >= end;
  return minute >= end && minute < start;
}

function reminderId(key: string, occupied: Set<number>): number {
  let hash = 2_166_136_261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  const span = NATIVE_NOTIFICATION_ID_END - NATIVE_NOTIFICATION_ID_START + 1;
  let candidate = NATIVE_NOTIFICATION_ID_START + (hash >>> 0) % span;
  while (occupied.has(candidate)) {
    candidate = candidate === NATIVE_NOTIFICATION_ID_END
      ? NATIVE_NOTIFICATION_ID_START
      : candidate + 1;
  }
  occupied.add(candidate);
  return candidate;
}

export function buildNativeReminderSchedule(
  preferences: CorelineNotificationPreferences,
  language = lang,
  options: NativeReminderOptions = {},
): LocalNotificationSchema[] {
  if (!preferences.enabled) return [];

  const now = options.now ?? Date.now();
  const horizonDays = Math.max(1, Math.min(21, options.horizonDays ?? DEFAULT_HORIZON_DAYS));
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const horizonEnd = start.getTime() + horizonDays * 86_400_000;
  const occupied = new Set<number>();
  const scheduled: Array<LocalNotificationSchema & { dueAt: number }> = [];

  const add = (
    key: string,
    title: string,
    body: string,
    date: Date,
    screen: string,
  ) => {
    const dueAt = date.getTime();
    if (
      dueAt <= now + 5_000
      || dueAt <= preferences.snoozedUntil
      || dueAt >= horizonEnd
      || !allowedDuringQuietHours(date, preferences)
    ) return;

    scheduled.push({
      id: reminderId(key, occupied),
      title,
      body,
      channelId: NATIVE_NOTIFICATION_CHANNEL,
      isExactNotification: false,
      schedule: { at: date, allowWhileIdle: true },
      extra: { coreline: true, screen },
      dueAt,
    });
  };

  const atClock = (day: Date, clock: string): Date => {
    const [hour, minute] = clock.split(':').map(Number);
    const result = new Date(day);
    result.setHours(hour, minute, 0, 0);
    return result;
  };

  for (let offset = 0; offset < horizonDays; offset++) {
    const day = new Date(start);
    day.setDate(day.getDate() + offset);
    const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;

    if (preferences.training && preferences.trainingDays.includes(day.getDay())) {
      add(
        `training:${key}`,
        text('Charakter-Quest verfügbar', 'Character quest available', language),
        text('Prüfe deinen Trainingspfad und starte nur, wenn Erholung und Alltag passen.', 'Check your training path and start only when recovery and your day allow it.', language),
        atClock(day, preferences.trainingTime),
        'training',
      );
    }

    if (preferences.hydration) {
      add(
        `hydration:${key}`,
        text('Trink-Check', 'Hydration check', language),
        text('Hast du heute schon etwas getrunken? Trage nur ein, was tatsächlich passt.', 'Have you had something to drink today? Log only what you actually drank.', language),
        atClock(day, '14:00'),
        'dashboard',
      );
    }

    if (preferences.meals) {
      add(
        `meal:${key}`,
        text('Mahlzeiten-Check', 'Meal check', language),
        text('Schon gegessen? Dein Charakter-Ernährungsplan wartet im Essen-Bereich.', 'Already eaten? Your character food plan is waiting in the Food section.', language),
        atClock(day, '13:30'),
        'fuel',
      );
    }

    if (preferences.supplements && options.hasTrackedRoutine) {
      add(
        `routine:${key}`,
        text('Routine-Check', 'Routine check', language),
        text('Prüfe ausschließlich Supplements, die du bereits bewusst trackst.', 'Check only supplements that you deliberately track.', language),
        atClock(day, preferences.supplementTime),
        'ki',
      );
    }

    if (preferences.streakRescue && (options.streakCount ?? 0) >= 2) {
      add(
        `streak:${key}`,
        text('Streak-Check', 'Consistency check', language),
        text('Falls heute noch etwas offen ist: Eine leichte Quest zählt mehr als Überlastung.', 'If anything is still open today, a light quest beats overtraining.', language),
        atClock(day, '20:30'),
        'training',
      );
    }
  }

  for (const item of options.pendingItems ?? []) {
    if (item.deliveredAt) continue;
    const isRecovery = item.kind === 'recovery' && preferences.recovery;
    const isUnfinished = item.id.startsWith('daily:unfinished:') && preferences.unfinishedSets;
    if (!isRecovery && !isUnfinished) continue;
    add(`pending:${item.id}`, item.title, item.body, new Date(item.dueAt), 'training');
  }

  return scheduled
    .sort((left, right) => left.dueAt - right.dueAt)
    .slice(0, MAX_SCHEDULED_NOTICES)
    .map(({ dueAt: _dueAt, ...notification }) => notification);
}

export async function syncNativeNotificationSchedule(): Promise<number> {
  if (!isNativeAndroidApp()) return 0;

  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const pending = await LocalNotifications.getPending();
  const owned = pending.notifications.filter(item => (
    item.id >= NATIVE_NOTIFICATION_ID_START && item.id <= NATIVE_NOTIFICATION_ID_END
  ));
  if (owned.length) {
    await LocalNotifications.cancel({ notifications: owned.map(item => ({ id: item.id })) });
  }

  const preferences = loadNotificationPreferences();
  if (!preferences.enabled) return 0;

  const permission = await LocalNotifications.checkPermissions();
  if (rememberNativeNotificationPermission(permission.display) !== 'granted') return 0;

  await LocalNotifications.createChannel({
    id: NATIVE_NOTIFICATION_CHANNEL,
    name: 'CORELINE System',
    description: text('Training, Ernährung, Trinken und Regeneration', 'Training, food, hydration, and recovery', lang),
    importance: 4,
    visibility: 0,
  });

  const now = Date.now();
  const reminders = buildNativeReminderSchedule(preferences, lang, {
    now,
    hasTrackedRoutine: Boolean((S.get<unknown[]>('protocol') || []).length),
    streakCount: S.get<{ count?: number }>('streak')?.count || 0,
    pendingItems: syncScheduledNotifications(now, lang),
  });

  if (reminders.length) await LocalNotifications.schedule({ notifications: reminders });
  return reminders.length;
}
