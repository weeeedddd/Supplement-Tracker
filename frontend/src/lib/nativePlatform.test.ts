import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isNativeAndroidApp,
  nativeNotificationPermissionSnapshot,
  readCurrentDevicePosition,
  requestNativeNotificationPermission,
} from './nativePlatform';

const geolocation = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}));

const localNotifications = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
}));

vi.mock('@capacitor/geolocation', () => ({ Geolocation: geolocation }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: localNotifications }));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

function nativeAndroidWindow() {
  return {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    },
  };
}

describe('Android platform bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('does not mistake the normal browser app for a native package', () => {
    vi.stubGlobal('window', {});
    expect(isNativeAndroidApp()).toBe(false);

    vi.stubGlobal('window', nativeAndroidWindow());
    expect(isNativeAndroidApp()).toBe(true);
  });

  it('keeps browser geolocation available without native plugins', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: (value: { coords: { latitude: number; longitude: number } }) => void) => {
          success({ coords: { latitude: 48.2082, longitude: 16.3738 } });
        },
      },
    });

    await expect(readCurrentDevicePosition()).resolves.toEqual({
      latitude: 48.2082,
      longitude: 16.3738,
    });
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('requests only approximate Android location for the shop radar', async () => {
    vi.stubGlobal('window', nativeAndroidWindow());
    geolocation.checkPermissions.mockResolvedValue({ coarseLocation: 'prompt' });
    geolocation.requestPermissions.mockResolvedValue({ coarseLocation: 'granted' });
    geolocation.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 52.52, longitude: 13.405 },
    });

    await expect(readCurrentDevicePosition()).resolves.toEqual({
      latitude: 52.52,
      longitude: 13.405,
    });
    expect(geolocation.requestPermissions).toHaveBeenCalledWith({
      permissions: ['coarseLocation'],
    });
    expect(geolocation.getCurrentPosition).toHaveBeenCalledWith(expect.objectContaining({
      enableHighAccuracy: false,
    }));
  });

  it('does not request coordinates after location access is denied', async () => {
    vi.stubGlobal('window', nativeAndroidWindow());
    geolocation.checkPermissions.mockResolvedValue({ coarseLocation: 'prompt' });
    geolocation.requestPermissions.mockResolvedValue({ coarseLocation: 'denied' });

    await expect(readCurrentDevicePosition()).rejects.toThrow('location_permission_denied');
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('remembers the Android notification decision for the existing system UI', async () => {
    vi.stubGlobal('window', nativeAndroidWindow());
    localNotifications.checkPermissions.mockResolvedValue({ display: 'prompt' });
    localNotifications.requestPermissions.mockResolvedValue({ display: 'granted' });

    expect(nativeNotificationPermissionSnapshot()).toBe('default');
    await expect(requestNativeNotificationPermission()).resolves.toBe('granted');
    expect(nativeNotificationPermissionSnapshot()).toBe('granted');
  });
});
