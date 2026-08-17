import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSystemNotificationPermission,
  getUnreadNotificationCount,
  loadNotificationPreferences,
  loadNotifications,
  markAllNotificationsRead,
  processDueNotifications,
  saveNotificationPreferences,
  scheduleRecoveryReminder,
  syncScheduledNotifications,
} from './notifications';
import { S } from './storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('local notification engine', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('Notification', undefined);
  });

  it('starts disabled with conservative reminder defaults', () => {
    expect(loadNotificationPreferences()).toMatchObject({
      enabled: false,
      training: true,
      recovery: true,
      supplements: false,
      trainingDays: [1, 3, 5],
    });
    expect(getSystemNotificationPermission()).toBe('unsupported');
  });

  it('materializes and delivers one deterministic training reminder per selected day', async () => {
    const mondayBefore = new Date(2026, 7, 17, 17, 0).getTime();
    const mondayAfter = new Date(2026, 7, 17, 19, 0).getTime();
    saveNotificationPreferences({ enabled: true, trainingDays: [1], trainingTime: '18:00' });

    const scheduled = syncScheduledNotifications(mondayBefore, 'de');
    expect(scheduled.filter(item => item.kind === 'training')).toHaveLength(1);
    expect(scheduled[0].deliveredAt).toBeUndefined();

    await processDueNotifications(mondayAfter, 'de');
    const delivered = loadNotifications(mondayAfter).filter(item => item.kind === 'training');
    expect(delivered).toHaveLength(1);
    expect(delivered[0].deliveredAt).toBe(mondayAfter);
    expect(getUnreadNotificationCount(mondayAfter)).toBe(1);

    await processDueNotifications(mondayAfter + 60_000, 'de');
    expect(loadNotifications(mondayAfter).filter(item => item.kind === 'training')).toHaveLength(1);
    markAllNotificationsRead(mondayAfter + 120_000);
    expect(getUnreadNotificationCount(mondayAfter + 120_000)).toBe(0);
  });

  it('only creates routine reminders when the user tracks a routine', () => {
    const now = new Date(2026, 7, 17, 8, 0).getTime();
    saveNotificationPreferences({ enabled: true, training: false, supplements: true, supplementTime: '09:00' });
    expect(syncScheduledNotifications(now).some(item => item.kind === 'supplements')).toBe(false);

    S.set('protocol', [{ id: 'protein' }]);
    expect(syncScheduledNotifications(now).some(item => item.kind === 'supplements')).toBe(true);
  });

  it('queues a recovery check only when recovery reminders are equipped', () => {
    const completedAt = new Date(2026, 7, 17, 20, 0).getTime();
    expect(scheduleRecoveryReminder('Sanji / Legs', completedAt)).toBeNull();

    saveNotificationPreferences({ enabled: true, recovery: true });
    const reminder = scheduleRecoveryReminder('Sanji / Legs', completedAt, 'de');
    expect(reminder?.kind).toBe('recovery');
    expect(reminder?.dueAt).toBe(completedAt + 20 * 60 * 60 * 1000);
  });

  it('reschedules pending prompts and does not deliver while reminders are paused', async () => {
    const mondayBefore = new Date(2026, 7, 17, 17, 0).getTime();
    const mondayAfter = new Date(2026, 7, 17, 20, 0).getTime();
    saveNotificationPreferences({ enabled: true, trainingDays: [1], trainingTime: '18:00' });
    const first = syncScheduledNotifications(mondayBefore, 'en').find(item => item.kind === 'training');

    saveNotificationPreferences({ trainingTime: '19:30' });
    const moved = syncScheduledNotifications(mondayBefore, 'en').find(item => item.kind === 'training');
    expect(moved?.dueAt).not.toBe(first?.dueAt);

    saveNotificationPreferences({ enabled: false });
    await processDueNotifications(mondayAfter, 'en');
    expect(loadNotifications(mondayAfter).find(item => item.kind === 'training')?.deliveredAt).toBeUndefined();
  });
});
