// ═══════════════════════════════════════════════════════════════════
//  ◈ NATIVE-SHELL-BRÜCKE (Capacitor)
//  Im installierten App-Build übernimmt das Betriebssystem die
//  Erinnerungen: echte geplante Local Notifications, die auch bei
//  vollständig geschlossener App zuverlässig ausgelöst werden.
//  Im Browser bleibt alles unverändert — jede Funktion ist ein No-op.
// ═══════════════════════════════════════════════════════════════════
import { Capacitor } from '@capacitor/core';

import { lang } from './i18n';
import type { CorelineNotificationPreferences } from './notifications';
import { S } from './storage';

/** Stable integer ids so a reschedule replaces instead of duplicating. */
const NOTIFICATION_ID = {
  training: 1_000,
  supplements: 2_000,
  hydration: 3_000,
  meals: 4_000,
} as const;

export type NativeNotificationPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

const localCopy = (de: string, en: string, language = lang): string => language === 'de' ? de : en;

interface PlannedNativeNotification {
  id: number;
  title: string;
  body: string;
  hour: number;
  minute: number;
  /** Capacitor weekdays are 1 = Sunday … 7 = Saturday. */
  weekday?: number;
  screen: string;
}

function clockParts(value: string, fallback: [number, number]): [number, number] {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  return match ? [Number(match[1]), Number(match[2])] : fallback;
}

/**
 * Translate the notification preferences into repeating OS alarms. Only the
 * fixed daily reminders are scheduled: state-dependent ones (open sets, streak
 * rescue) cannot be evaluated while the app is not running.
 */
export function planNativeNotifications(
  preferences: CorelineNotificationPreferences,
  language = lang,
): PlannedNativeNotification[] {
  if (!preferences.enabled) return [];
  const planned: PlannedNativeNotification[] = [];

  if (preferences.training) {
    const [hour, minute] = clockParts(preferences.trainingTime, [18, 0]);
    const title = localCopy('Charakter-Quest verfügbar', 'Character quest available', language);
    const body = localCopy(
      'Dein ausgerüsteter Trainingspfad wartet. Öffne CORELINE, wenn Erholung und Alltag passen.',
      'Your equipped training path is waiting. Open CORELINE when recovery and your day allow it.',
      language,
    );
    const days = preferences.trainingDays.length ? preferences.trainingDays : [0, 1, 2, 3, 4, 5, 6];
    for (const day of days) {
      planned.push({
        id: NOTIFICATION_ID.training + day,
        title,
        body,
        hour,
        minute,
        weekday: day + 1,
        screen: 'training',
      });
    }
  }

  const routine = S.get<unknown[]>('protocol');
  if (preferences.supplements && Array.isArray(routine) && routine.length) {
    const [hour, minute] = clockParts(preferences.supplementTime, [9, 0]);
    planned.push({
      id: NOTIFICATION_ID.supplements,
      title: localCopy('Routine-Check', 'Routine check', language),
      body: localCopy(
        'Prüfe nur Produkte, die du bewusst trackst, und halte dich an Produktetikett sowie fachliche Beratung.',
        'Check only products you deliberately track, and follow the product label and qualified guidance.',
        language,
      ),
      hour,
      minute,
      screen: 'ki',
    });
  }

  if (preferences.hydration) {
    planned.push({
      id: NOTIFICATION_ID.hydration,
      title: localCopy('Trink-Check', 'Hydration check', language),
      body: localCopy(
        'Trage nur ein, was du tatsächlich getrunken hast; dies ist kein medizinisches Trinkziel.',
        'Log only what you actually drank; this is not a medical hydration target.',
        language,
      ),
      hour: 14,
      minute: 0,
      screen: 'dashboard',
    });
  }

  if (preferences.meals) {
    planned.push({
      id: NOTIFICATION_ID.meals,
      title: localCopy('Mahlzeiten-Check', 'Meal check', language),
      body: localCopy(
        'Heute ist noch keine Mahlzeit erfasst. Wenn du bereits gegessen hast, kannst du sie nachtragen.',
        'No meal is logged today. If you already ate, you can add it now.',
        language,
      ),
      hour: 13,
      minute: 30,
      screen: 'fuel',
    });
  }

  return planned;
}

async function localNotifications() {
  const module = await import('@capacitor/local-notifications');
  return module.LocalNotifications;
}

export async function getNativeNotificationPermission(): Promise<NativeNotificationPermission> {
  if (!isNativeApp()) return 'unavailable';
  try {
    const plugin = await localNotifications();
    const status = await plugin.checkPermissions();
    return status.display === 'granted' ? 'granted' : status.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unavailable';
  }
}

export async function requestNativeNotificationPermission(): Promise<NativeNotificationPermission> {
  if (!isNativeApp()) return 'unavailable';
  try {
    const plugin = await localNotifications();
    const status = await plugin.requestPermissions();
    return status.display === 'granted' ? 'granted' : status.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * Replace the scheduled OS reminders with the current preferences. Returns the
 * number of alarms now registered, or -1 when the shell is not native.
 */
export async function syncNativeNotifications(
  preferences: CorelineNotificationPreferences,
  language = lang,
): Promise<number> {
  if (!isNativeApp()) return -1;
  try {
    const plugin = await localNotifications();
    const pending = await plugin.getPending();
    if (pending.notifications.length) {
      await plugin.cancel({ notifications: pending.notifications.map(item => ({ id: item.id })) });
    }
    if (preferences.snoozedUntil > Date.now()) return 0;

    const planned = planNativeNotifications(preferences, language);
    if (!planned.length) return 0;
    if ((await getNativeNotificationPermission()) !== 'granted') return 0;

    await plugin.schedule({
      notifications: planned.map(item => ({
        id: item.id,
        title: item.title,
        body: item.body,
        smallIcon: 'ic_stat_coreline',
        extra: { screen: item.screen },
        schedule: {
          on: item.weekday === undefined
            ? { hour: item.hour, minute: item.minute }
            : { weekday: item.weekday, hour: item.hour, minute: item.minute },
          allowWhileIdle: true,
        },
      })),
    });
    return planned.length;
  } catch {
    return 0;
  }
}

export async function cancelNativeNotifications(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const plugin = await localNotifications();
    const pending = await plugin.getPending();
    if (pending.notifications.length) {
      await plugin.cancel({ notifications: pending.notifications.map(item => ({ id: item.id })) });
    }
  } catch {
    // Nothing scheduled, or the plugin is unavailable in this shell.
  }
}

/**
 * Native shell start-up: dark status bar, tapped-notification routing, and a
 * reschedule whenever the app returns to the foreground so a changed day,
 * timezone, or routine is reflected.
 */
export async function initNativeShell(
  onOpenScreen: (screen: string) => void,
  onResume: () => void,
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#080b0b' });
  } catch {
    // Status bar styling is cosmetic; a failure must not stop start-up.
  }
  try {
    const plugin = await localNotifications();
    await plugin.addListener('localNotificationActionPerformed', event => {
      const screen = event.notification.extra?.screen;
      if (typeof screen === 'string') onOpenScreen(screen);
    });
  } catch {
    // Without the listener a tap simply opens the app on its last screen.
  }
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) onResume();
    });
  } catch {
    // Resume handling is an optimisation, not a requirement.
  }
}
