import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isNativeApp, nativePlatform, planNativeNotifications } from './nativeApp';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notifications';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const preferences = (patch: Partial<typeof DEFAULT_NOTIFICATION_PREFERENCES> = {}) => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  enabled: true,
  ...patch,
});

describe('native shell notification plan', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('reports the web platform outside a native shell', () => {
    expect(isNativeApp()).toBe(false);
    expect(nativePlatform()).toBe('web');
  });

  it('plans nothing while notifications are switched off', () => {
    expect(planNativeNotifications(preferences({ enabled: false }))).toEqual([]);
  });

  it('creates one alarm per selected training weekday with unique ids', () => {
    const planned = planNativeNotifications(preferences({ trainingTime: '17:45', trainingDays: [1, 3, 5] }), 'en');
    expect(planned).toHaveLength(3);
    // Capacitor counts weekdays from 1 = Sunday, so Monday/Wednesday/Friday are 2/4/6.
    expect(planned.map(item => item.weekday)).toEqual([2, 4, 6]);
    expect(planned.every(item => item.hour === 17 && item.minute === 45)).toBe(true);
    expect(new Set(planned.map(item => item.id)).size).toBe(3);
    expect(planned[0].screen).toBe('training');
  });

  it('treats an empty weekday list as every day', () => {
    expect(planNativeNotifications(preferences({ trainingDays: [] }))).toHaveLength(7);
  });

  it('adds the routine alarm only when something is tracked', () => {
    expect(planNativeNotifications(preferences({ supplements: true, training: false }))).toEqual([]);
    localStorage.setItem('sg_protocol', JSON.stringify([{ id: 'protein', phase: 'beta' }]));
    const planned = planNativeNotifications(preferences({ supplements: true, training: false, supplementTime: '08:05' }));
    expect(planned).toEqual([expect.objectContaining({ hour: 8, minute: 5, screen: 'ki' })]);
  });

  it('falls back to a safe time when a stored clock value is malformed', () => {
    const planned = planNativeNotifications(preferences({ trainingTime: '25:99', trainingDays: [0] }));
    expect(planned[0]).toMatchObject({ hour: 18, minute: 0 });
  });

  it('keeps hydration and meal alarms on their fixed daily times', () => {
    const planned = planNativeNotifications(preferences({ training: false, hydration: true, meals: true }));
    expect(planned.map(item => [item.hour, item.minute, item.screen])).toEqual([
      [14, 0, 'dashboard'],
      [13, 30, 'fuel'],
    ]);
  });
});
