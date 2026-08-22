// ═══════════════════════════════════════════════════════════════════
//  ◈ HINTERGRUND-ERINNERUNGEN — Erinnerungen ohne offene App
//  Ohne Backend kann nur der Service Worker aufwachen. Die App legt
//  deshalb einen einfachen Zeitplan im Cache ab; Periodic Background
//  Sync weckt den Worker, der fällige Einträge zeigt.
//  Server-Push (siehe push.ts) bleibt der verlässlichere Weg und hat
//  Vorrang, sobald ein Backend verbunden ist.
// ═══════════════════════════════════════════════════════════════════
import { lang } from './i18n';
import type { CorelineNotificationPreferences } from './notifications';
import { loadNotificationPreferences } from './notifications';
import { dateKey, S } from './storage';

export const REMINDER_SCHEDULE_CACHE = 'coreline-reminders';
export const REMINDER_SCHEDULE_PATH = '__coreline/reminder-schedule.json';
export const BACKGROUND_SYNC_TAG = 'coreline-reminders';

/** Browsers decide the real cadence; this is the floor we ask for. */
export const BACKGROUND_SYNC_MIN_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface BackgroundReminder {
  id: string;
  time: string;
  /** Weekdays (0 = Sunday). An empty list means every day. */
  days: number[];
  title: string;
  body: string;
  url: string;
  /** Day key on which the app already saw this reminder as unnecessary. */
  suppressedOn?: string;
}

export interface BackgroundReminderSchedule {
  version: 1;
  updatedAt: number;
  quietStart: string;
  quietEnd: string;
  snoozedUntil: number;
  reminders: BackgroundReminder[];
}

export type BackgroundReminderState =
  | 'unsupported'
  | 'needs-permission'
  | 'needs-notifications'
  | 'blocked'
  | 'available'
  | 'active';

export interface BackgroundReminderStatus {
  state: BackgroundReminderState;
  registered: boolean;
  reminders: number;
}

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

function periodicSync(registration: ServiceWorkerRegistration): PeriodicSyncManager | null {
  const manager = (registration as ServiceWorkerRegistration & {
    periodicSync?: PeriodicSyncManager;
  }).periodicSync;
  return manager ?? null;
}

export function backgroundRemindersSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'caches' in window
    && 'Notification' in window
    && 'PeriodicSyncManager' in window;
}

const localCopy = (de: string, en: string, language = lang): string => language === 'de' ? de : en;

function completedWorkoutToday(day: string): boolean {
  const sessions = S.get<Array<{ completedAt?: number }>>('train_sessions') || [];
  return sessions.some(session => (
    Number.isFinite(session.completedAt) && dateKey(new Date(Number(session.completedAt))) === day
  ));
}

/**
 * Turn the notification preferences into a flat, self-contained plan the
 * service worker can evaluate without any app code.
 */
export function buildBackgroundSchedule(
  preferences: CorelineNotificationPreferences,
  now = Date.now(),
  language = lang,
): BackgroundReminderSchedule {
  const day = dateKey(new Date(now));
  const reminders: BackgroundReminder[] = [];

  if (preferences.training) {
    reminders.push({
      id: 'training',
      time: preferences.trainingTime,
      days: preferences.trainingDays,
      title: localCopy('Charakter-Quest verfügbar', 'Character quest available', language),
      body: localCopy(
        'Dein ausgerüsteter Trainingspfad wartet. Öffne CORELINE, wenn Erholung und Alltag passen.',
        'Your equipped training path is waiting. Open CORELINE when recovery and your day allow it.',
        language,
      ),
      url: './?screen=training',
      suppressedOn: completedWorkoutToday(day) ? day : undefined,
    });
  }

  const routine = S.get<unknown[]>('protocol');
  if (preferences.supplements && Array.isArray(routine) && routine.length) {
    const checked = S.get<string[]>(`day_${day}`);
    reminders.push({
      id: 'supplements',
      time: preferences.supplementTime,
      days: [],
      title: localCopy('Routine-Check', 'Routine check', language),
      body: localCopy(
        'Prüfe nur Produkte, die du bewusst trackst, und halte dich an Produktetikett sowie fachliche Beratung.',
        'Check only products you deliberately track, and follow the product label and qualified guidance.',
        language,
      ),
      url: './?screen=ki',
      suppressedOn: Array.isArray(checked) && checked.length >= routine.length ? day : undefined,
    });
  }

  if (preferences.hydration) {
    reminders.push({
      id: 'hydration',
      time: '14:00',
      days: [],
      title: localCopy('Trink-Check', 'Hydration check', language),
      body: localCopy(
        'Trage nur ein, was du tatsächlich getrunken hast; dies ist kein medizinisches Trinkziel.',
        'Log only what you actually drank; this is not a medical hydration target.',
        language,
      ),
      url: './?screen=dashboard',
      suppressedOn: (S.get<number>(`mana_${day}`) || 0) >= 2 ? day : undefined,
    });
  }

  if (preferences.meals) {
    reminders.push({
      id: 'meals',
      time: '13:30',
      days: [],
      title: localCopy('Mahlzeiten-Check', 'Meal check', language),
      body: localCopy(
        'Heute ist noch keine Mahlzeit erfasst. Wenn du bereits gegessen hast, kannst du sie nachtragen.',
        'No meal is logged today. If you already ate, you can add it now.',
        language,
      ),
      url: './?screen=fuel',
      suppressedOn: (S.get<unknown[]>(`food_${day}`) || []).length ? day : undefined,
    });
  }

  return {
    version: 1,
    updatedAt: now,
    quietStart: preferences.quietStart,
    quietEnd: preferences.quietEnd,
    snoozedUntil: preferences.snoozedUntil,
    reminders: preferences.enabled ? reminders : [],
  };
}

async function scheduleRequest(): Promise<{ registration: ServiceWorkerRegistration; url: string } | null> {
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return { registration, url: new URL(REMINDER_SCHEDULE_PATH, registration.scope).href };
}

/**
 * Write the plan where the woken service worker can find it. Failures are
 * silent: in-app reminders keep working either way.
 */
export async function publishBackgroundSchedule(
  schedule?: BackgroundReminderSchedule,
): Promise<boolean> {
  try {
    const target = await scheduleRequest();
    if (!target) return false;
    const payload = schedule ?? buildBackgroundSchedule(loadNotificationPreferences());
    const cache = await caches.open(REMINDER_SCHEDULE_CACHE);
    await cache.put(target.url, new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    }));
    return true;
  } catch {
    return false;
  }
}

export async function getBackgroundReminderStatus(): Promise<BackgroundReminderStatus> {
  const reminders = buildBackgroundSchedule(loadNotificationPreferences()).reminders.length;
  if (!backgroundRemindersSupported()) return { state: 'unsupported', registered: false, reminders };
  if (Notification.permission === 'denied') return { state: 'blocked', registered: false, reminders };
  if (Notification.permission !== 'granted') return { state: 'needs-notifications', registered: false, reminders };

  const registration = await navigator.serviceWorker.getRegistration();
  const manager = registration ? periodicSync(registration) : null;
  if (!manager) return { state: 'unsupported', registered: false, reminders };

  let registered = false;
  try {
    registered = (await manager.getTags()).includes(BACKGROUND_SYNC_TAG);
  } catch {
    registered = false;
  }
  if (registered) return { state: 'active', registered: true, reminders };

  try {
    const permission = await navigator.permissions?.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (permission && permission.state !== 'granted') {
      return { state: 'needs-permission', registered: false, reminders };
    }
  } catch {
    // Permission introspection is optional; registration still decides.
  }
  return { state: 'available', registered: false, reminders };
}

/**
 * Ask the browser to wake the worker periodically. Chromium grants this only
 * for installed apps the user engages with, so a rejection is expected and
 * must stay non-fatal.
 */
export async function enableBackgroundReminders(): Promise<BackgroundReminderStatus> {
  await publishBackgroundSchedule();
  if (!backgroundRemindersSupported()) return getBackgroundReminderStatus();
  const registration = await navigator.serviceWorker.getRegistration();
  const manager = registration ? periodicSync(registration) : null;
  if (!manager) return getBackgroundReminderStatus();
  try {
    await manager.register(BACKGROUND_SYNC_TAG, { minInterval: BACKGROUND_SYNC_MIN_INTERVAL_MS });
  } catch {
    // Not granted for this installation — the status below reports it.
  }
  return getBackgroundReminderStatus();
}

export async function disableBackgroundReminders(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const manager = registration ? periodicSync(registration) : null;
  try {
    await manager?.unregister(BACKGROUND_SYNC_TAG);
  } catch {
    // Nothing registered — nothing to clean up.
  }
  await publishBackgroundSchedule({
    version: 1,
    updatedAt: Date.now(),
    quietStart: '22:00',
    quietEnd: '07:00',
    snoozedUntil: 0,
    reminders: [],
  });
}
