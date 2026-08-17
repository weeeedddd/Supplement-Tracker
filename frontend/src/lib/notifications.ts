import { lang } from './i18n';
import { S, dateKey } from './storage';

export type CorelineNotificationKind = 'training' | 'recovery' | 'supplements' | 'system';
export type CorelineNotificationPermission = NotificationPermission | 'unsupported';

export interface CorelineNotificationPreferences {
  enabled: boolean;
  training: boolean;
  recovery: boolean;
  supplements: boolean;
  trainingTime: string;
  supplementTime: string;
  trainingDays: number[];
}

export interface CorelineNotificationItem {
  id: string;
  kind: CorelineNotificationKind;
  title: string;
  body: string;
  dueAt: number;
  createdAt: number;
  deliveredAt?: number;
  systemShownAt?: number;
  readAt?: number;
}

export const NOTIFICATION_UPDATED_EVENT = 'coreline:notifications-updated';
export const NOTIFICATION_PREFERENCES_KEY = 'notification_preferences_v1';
export const NOTIFICATION_ITEMS_KEY = 'notification_items_v1';

export const DEFAULT_NOTIFICATION_PREFERENCES: CorelineNotificationPreferences = {
  enabled: false,
  training: true,
  recovery: true,
  supplements: false,
  trainingTime: '18:00',
  supplementTime: '09:00',
  trainingDays: [1, 3, 5],
};

const KINDS = new Set<CorelineNotificationKind>(['training', 'recovery', 'supplements', 'system']);
const DAY_MS = 86_400_000;

function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function emitUpdate(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATION_UPDATED_EVENT));
}

function localCopy(de: string, en: string, language = lang): string {
  return language === 'de' ? de : en;
}

function sanitizePreferences(value: unknown): CorelineNotificationPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const source = value as Partial<CorelineNotificationPreferences>;
  const days = Array.isArray(source.trainingDays)
    ? [...new Set(source.trainingDays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : DEFAULT_NOTIFICATION_PREFERENCES.trainingDays;
  return {
    enabled: source.enabled === true,
    training: source.training !== false,
    recovery: source.recovery !== false,
    supplements: source.supplements === true,
    trainingTime: isClockTime(source.trainingTime) ? source.trainingTime : DEFAULT_NOTIFICATION_PREFERENCES.trainingTime,
    supplementTime: isClockTime(source.supplementTime) ? source.supplementTime : DEFAULT_NOTIFICATION_PREFERENCES.supplementTime,
    trainingDays: days,
  };
}

function sanitizeItems(value: unknown, now = Date.now()): CorelineNotificationItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): CorelineNotificationItem[] => {
    if (!entry || typeof entry !== 'object') return [];
    const source = entry as Partial<CorelineNotificationItem>;
    if (
      typeof source.id !== 'string'
      || !KINDS.has(source.kind as CorelineNotificationKind)
      || typeof source.title !== 'string'
      || typeof source.body !== 'string'
      || !Number.isFinite(source.dueAt)
      || !Number.isFinite(source.createdAt)
    ) return [];
    const optionalTime = (time: unknown) => Number.isFinite(time) ? Number(time) : undefined;
    return [{
      id: source.id.slice(0, 160),
      kind: source.kind as CorelineNotificationKind,
      title: source.title.slice(0, 100),
      body: source.body.slice(0, 320),
      dueAt: Number(source.dueAt),
      createdAt: Number(source.createdAt),
      deliveredAt: optionalTime(source.deliveredAt),
      systemShownAt: optionalTime(source.systemShownAt),
      readAt: optionalTime(source.readAt),
    }];
  })
    .filter(item => item.dueAt >= now - 45 * DAY_MS)
    .sort((a, b) => b.dueAt - a.dueAt)
    .slice(0, 160);
}

function storeItems(items: CorelineNotificationItem[], emit = true): CorelineNotificationItem[] {
  const next = sanitizeItems(items);
  S.set(NOTIFICATION_ITEMS_KEY, next);
  if (emit) emitUpdate();
  return next;
}

function dateAtClock(reference: Date, value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  const next = new Date(reference);
  next.setHours(hours, minutes, 0, 0);
  return next.getTime();
}

function dailyReminder(
  kind: Extract<CorelineNotificationKind, 'training' | 'supplements'>,
  reference: Date,
  dueAt: number,
  language: string,
): CorelineNotificationItem {
  const isTraining = kind === 'training';
  return {
    id: `daily:${kind}:${dateKey(reference)}`,
    kind,
    title: isTraining
      ? localCopy('Charakter-Quest verfügbar', 'Character quest available', language)
      : localCopy('Routine-Check', 'Routine check', language),
    body: isTraining
      ? localCopy('Dein ausgerüsteter Trainingspfad wartet. Öffne Training und starte die nächste Einheit, wenn Erholung und Alltag passen.', 'Your equipped training path is waiting. Open Training and start the next session when recovery and your day allow it.', language)
      : localCopy('Prüfe nur Produkte, die du bereits bewusst trackst, und halte dich an Produktetikett sowie fachliche Beratung.', 'Check only products you deliberately track, and follow the product label and qualified guidance.', language),
    dueAt,
    createdAt: reference.getTime(),
  };
}

export function loadNotificationPreferences(): CorelineNotificationPreferences {
  return sanitizePreferences(S.get<unknown>(NOTIFICATION_PREFERENCES_KEY));
}

export function saveNotificationPreferences(
  value: Partial<CorelineNotificationPreferences>,
): CorelineNotificationPreferences {
  const next = sanitizePreferences({ ...loadNotificationPreferences(), ...value });
  S.set(NOTIFICATION_PREFERENCES_KEY, next);
  emitUpdate();
  return next;
}

export function loadNotifications(now = Date.now()): CorelineNotificationItem[] {
  return sanitizeItems(S.get<unknown>(NOTIFICATION_ITEMS_KEY), now);
}

export function getUnreadNotificationCount(now = Date.now()): number {
  return loadNotifications(now).filter(item => item.deliveredAt && !item.readAt).length;
}

export function getSystemNotificationPermission(): CorelineNotificationPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function requestSystemNotificationPermission(): Promise<CorelineNotificationPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function showSystemNotification(item: CorelineNotificationItem): Promise<boolean> {
  if (getSystemNotificationPermission() !== 'granted') return false;
  const options: NotificationOptions = {
    body: item.body,
    tag: item.id,
    icon: './icons/coreline.svg',
    badge: './icons/coreline.svg',
    data: { url: './' },
  };
  try {
    const registration = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration()
      : undefined;
    if (registration) {
      await registration.showNotification(item.title, options);
      return true;
    }
    new Notification(item.title, options);
    return true;
  } catch {
    return false;
  }
}

export function syncScheduledNotifications(
  now = Date.now(),
  language = lang,
): CorelineNotificationItem[] {
  const preferences = loadNotificationPreferences();
  const current = loadNotifications(now);
  if (!preferences.enabled) return current;
  const reference = new Date(now);
  const currentDate = dateKey(reference);
  const retained = current.filter(item => item.deliveredAt || (
    item.id !== `daily:training:${currentDate}`
    && item.id !== `daily:supplements:${currentDate}`
  ));
  const deliveredIds = new Set(current.filter(item => item.deliveredAt).map(item => item.id));
  const additions: CorelineNotificationItem[] = [];

  if (preferences.training && preferences.trainingDays.includes(reference.getDay())) {
    const reminder = dailyReminder('training', reference, dateAtClock(reference, preferences.trainingTime), language);
    if (!deliveredIds.has(reminder.id)) additions.push(reminder);
  }
  if (preferences.supplements) {
    const trackedRoutine = S.get<unknown[]>('protocol');
    if (Array.isArray(trackedRoutine) && trackedRoutine.length) {
      const reminder = dailyReminder('supplements', reference, dateAtClock(reference, preferences.supplementTime), language);
      if (!deliveredIds.has(reminder.id)) additions.push(reminder);
    }
  }

  const next = [...additions, ...retained].sort((a, b) => b.dueAt - a.dueAt);
  const changed = next.length !== current.length || next.some((item, index) => (
    item.id !== current[index]?.id || item.dueAt !== current[index]?.dueAt
  ));
  return changed ? storeItems(next) : current;
}

export function enqueueNotification(
  item: Omit<CorelineNotificationItem, 'createdAt'> & { createdAt?: number },
): CorelineNotificationItem {
  const next: CorelineNotificationItem = { ...item, createdAt: item.createdAt ?? Date.now() };
  const withoutDuplicate = loadNotifications().filter(existing => existing.id !== next.id);
  storeItems([next, ...withoutDuplicate]);
  return next;
}

export function scheduleRecoveryReminder(
  workoutName: string,
  completedAt = Date.now(),
  language = lang,
): CorelineNotificationItem | null {
  const preferences = loadNotificationPreferences();
  if (!preferences.enabled || !preferences.recovery) return null;
  return enqueueNotification({
    id: `recovery:${completedAt}:${workoutName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
    kind: 'recovery',
    title: localCopy('Regenerations-Check', 'Recovery check', language),
    body: localCopy(
      `${workoutName} liegt etwa 20 Stunden zurück. Prüfe Schlaf, Muskelgefühl und die Heatmap, bevor du dieselben Bereiche erneut hart belastest.`,
      `${workoutName} was about 20 hours ago. Check sleep, muscle feel, and the heatmap before loading the same areas hard again.`,
      language,
    ),
    dueAt: completedAt + 20 * 60 * 60 * 1000,
  });
}

export function createActivationNotice(now = Date.now(), language = lang): CorelineNotificationItem {
  return enqueueNotification({
    id: `system:notifications-equipped:${now}`,
    kind: 'system',
    title: localCopy('Systemhinweise ausgerüstet', 'System notices equipped', language),
    body: localCopy(
      'Training, Regeneration und deine bewusst gewählte Routine können dich jetzt erinnern. Zeiten lassen sich in den Einstellungen ändern.',
      'Training, recovery, and your deliberately selected routine can now remind you. Times can be changed in Settings.',
      language,
    ),
    dueAt: now,
  });
}

export async function processDueNotifications(
  now = Date.now(),
  language = lang,
): Promise<CorelineNotificationItem[]> {
  const scheduled = syncScheduledNotifications(now, language);
  const preferences = loadNotificationPreferences();
  if (!preferences.enabled) return scheduled;
  const isEnabled = (item: CorelineNotificationItem) => (
    item.kind === 'system'
    || (item.kind === 'training' && preferences.training)
    || (item.kind === 'recovery' && preferences.recovery)
    || (item.kind === 'supplements' && preferences.supplements)
  );
  const newlyDue = scheduled.filter(item => !item.deliveredAt && item.dueAt <= now && isEnabled(item));
  if (!newlyDue.length) return scheduled;

  let next = scheduled.map(item => newlyDue.some(due => due.id === item.id)
    ? { ...item, deliveredAt: now }
    : item);
  next = storeItems(next);

  for (const due of newlyDue) {
    const shown = await showSystemNotification(due);
    if (shown) {
      next = next.map(item => item.id === due.id ? { ...item, systemShownAt: now } : item);
    }
  }
  if (next.some(item => item.systemShownAt === now)) next = storeItems(next);
  return next;
}

export function markNotificationRead(id: string, now = Date.now()): CorelineNotificationItem[] {
  return storeItems(loadNotifications(now).map(item => item.id === id ? { ...item, readAt: now } : item));
}

export function markAllNotificationsRead(now = Date.now()): CorelineNotificationItem[] {
  return storeItems(loadNotifications(now).map(item => item.deliveredAt && !item.readAt ? { ...item, readAt: now } : item));
}
