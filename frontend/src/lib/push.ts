import { getBackendUrl } from './backend';
import { authedGet, authedPost, getAccount } from './guild';
import type { CorelineNotificationPreferences } from './notifications';
import { timeoutSignal } from './storage';

export type ClosedAppPushState =
  | 'unsupported'
  | 'needs-backend'
  | 'needs-account'
  | 'not-configured'
  | 'permission-denied'
  | 'ready'
  | 'subscribed';

export interface ClosedAppPushStatus {
  state: ClosedAppPushState;
  configured: boolean;
  subscribed: boolean;
}

function supported(): boolean {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function applicationServerKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const decoded = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return buffer;
}

async function publicPushConfig(): Promise<{ configured: boolean; publicKey: string }> {
  const base = getBackendUrl();
  if (!base) return { configured: false, publicKey: '' };
  const response = await fetch(`${base}/api/v1/push/public-key`, { signal: timeoutSignal(8_000) });
  if (!response.ok) throw new Error(`push_config_${response.status}`);
  return response.json();
}

export async function getClosedAppPushStatus(): Promise<ClosedAppPushStatus> {
  if (!supported()) return { state: 'unsupported', configured: false, subscribed: false };
  if (!getBackendUrl()) return { state: 'needs-backend', configured: false, subscribed: false };
  if (!getAccount()) return { state: 'needs-account', configured: false, subscribed: false };
  const config = await publicPushConfig();
  if (!config.configured || !config.publicKey) return { state: 'not-configured', configured: false, subscribed: false };
  if (Notification.permission === 'denied') return { state: 'permission-denied', configured: true, subscribed: false };
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return { state: subscription ? 'subscribed' : 'ready', configured: true, subscribed: Boolean(subscription) };
}

export async function syncClosedAppPushPreferences(preferences: CorelineNotificationPreferences): Promise<void> {
  if (!getBackendUrl() || !getAccount()) return;
  await authedPost('/api/v1/push/preferences', {
    enabled: preferences.enabled,
    training: preferences.training,
    recovery: preferences.recovery,
    supplements: preferences.supplements,
    hydration: preferences.hydration,
    meals: preferences.meals,
    unfinishedSets: preferences.unfinishedSets,
    streakRescue: preferences.streakRescue,
    trainingTime: preferences.trainingTime,
    supplementTime: preferences.supplementTime,
    quietStart: preferences.quietStart,
    quietEnd: preferences.quietEnd,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
}

export async function enableClosedAppPush(preferences: CorelineNotificationPreferences): Promise<ClosedAppPushStatus> {
  const status = await getClosedAppPushStatus();
  if (!['ready', 'subscribed'].includes(status.state)) return status;
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return { ...status, state: 'permission-denied', subscribed: false };
  const config = await publicPushConfig();
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(config.publicKey),
    });
  }
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
    throw new Error('invalid_push_subscription');
  }
  await authedPost('/api/v1/push/subscribe', {
    endpoint: serialized.endpoint,
    keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
  });
  await syncClosedAppPushPreferences(preferences);
  return { state: 'subscribed', configured: true, subscribed: true };
}

export async function disableClosedAppPush(): Promise<void> {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  if (getBackendUrl() && getAccount()) {
    await authedPost('/api/v1/push/unsubscribe', { endpoint: subscription.endpoint });
  }
  await subscription.unsubscribe();
}

export async function snoozeClosedAppPush(minutes: number): Promise<number> {
  const result = await authedPost<{ ok: boolean; snoozedUntil: number }>('/api/v1/push/snooze', { minutes });
  return result.snoozedUntil;
}

export async function fetchClosedAppPushPreferences(): Promise<{ subscribed: boolean; configured: boolean }> {
  const response = await authedGet<{ subscribed: boolean; configured: boolean }>('/api/v1/push/preferences');
  return { subscribed: response.subscribed, configured: response.configured };
}
