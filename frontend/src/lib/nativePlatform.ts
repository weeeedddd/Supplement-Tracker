import { S } from './storage';

const NATIVE_PERMISSION_KEY = 'native_notification_permission_v1';

interface CapacitorBridge {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
}

type NativeWindow = Window & { Capacitor?: CapacitorBridge };

export interface DeviceCoordinates {
  latitude: number;
  longitude: number;
}

export function isNativeAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as NativeWindow).Capacitor;
  return bridge?.isNativePlatform?.() === true && bridge.getPlatform?.() === 'android';
}

export function nativeNotificationPermissionSnapshot(): NotificationPermission {
  const saved = S.get<unknown>(NATIVE_PERMISSION_KEY);
  return saved === 'granted' || saved === 'denied' ? saved : 'default';
}

export function rememberNativeNotificationPermission(
  permission: string,
): NotificationPermission {
  const next = permission === 'granted'
    ? 'granted'
    : permission === 'denied'
      ? 'denied'
      : 'default';
  S.set(NATIVE_PERMISSION_KEY, next);
  return next;
}

export async function requestNativeNotificationPermission(): Promise<NotificationPermission> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const existing = await LocalNotifications.checkPermissions();
  const result = existing.display === 'granted'
    ? existing
    : await LocalNotifications.requestPermissions();
  return rememberNativeNotificationPermission(result.display);
}

export async function readCurrentDevicePosition(): Promise<DeviceCoordinates> {
  if (isNativeAndroidApp()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const current = await Geolocation.checkPermissions();
    const permission = current.coarseLocation === 'granted'
      ? current
      : await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
    if (permission.coarseLocation !== 'granted') {
      throw new Error('location_permission_denied');
    }
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 10_000,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  }

  if (!navigator.geolocation) throw new Error('location_unsupported');
  return new Promise<DeviceCoordinates>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      reject,
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  });
}

export async function syncNativeDeviceReminders(): Promise<number> {
  if (!isNativeAndroidApp()) return 0;
  const { syncNativeNotificationSchedule } = await import('./nativeNotifications');
  return syncNativeNotificationSchedule();
}

export async function showNativeDeviceNotice(
  title: string,
  body: string,
): Promise<boolean> {
  if (!isNativeAndroidApp()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [{
        id: 790_000_000 + Date.now() % 9_000_000,
        title,
        body,
        channelId: 'coreline-system',
        isExactNotification: false,
        schedule: { at: new Date(Date.now() + 1_000), allowWhileIdle: true },
        extra: { coreline: true, category: 'instant' },
      }],
    });
    return true;
  } catch {
    return false;
  }
}
