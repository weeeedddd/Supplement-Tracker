import { describe, expect, it } from 'vitest';

import { buildNativeReminderSchedule } from './nativeNotifications';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notifications';

describe('native Android reminder schedule', () => {
  const mondayMorning = new Date(2026, 7, 17, 8, 0).getTime();

  it('keeps all native alarms disabled until the user opts in', () => {
    expect(buildNativeReminderSchedule(DEFAULT_NOTIFICATION_PREFERENCES, 'de', {
      now: mondayMorning,
    })).toEqual([]);
  });

  it('schedules selected character training days without requiring an account or API', () => {
    const result = buildNativeReminderSchedule({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: true,
      trainingDays: [1, 3],
    }, 'de', { now: mondayMorning, horizonDays: 7 });

    expect(result.map(item => item.title)).toEqual([
      'Charakter-Quest verfügbar',
      'Charakter-Quest verfügbar',
    ]);
    expect(result.every(item => item.isExactNotification === false)).toBe(true);
    expect(result.map(item => item.schedule?.at?.getDay())).toEqual([1, 3]);
  });

  it('honors quiet hours and snooze when materializing Android alarms', () => {
    const result = buildNativeReminderSchedule({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: true,
      trainingTime: '23:00',
      meals: true,
      hydration: true,
      snoozedUntil: new Date(2026, 7, 17, 13, 45).getTime(),
    }, 'en', { now: mondayMorning, horizonDays: 1 });

    expect(result.map(item => item.title)).toEqual(['Hydration check']);
    expect(result[0].schedule?.at?.getHours()).toBe(14);
  });

  it('only schedules supplement reminders for an intentionally tracked routine', () => {
    const preferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: true,
      training: false,
      supplements: true,
    };

    expect(buildNativeReminderSchedule(preferences, 'de', {
      now: mondayMorning,
      horizonDays: 1,
      hasTrackedRoutine: false,
    })).toEqual([]);

    expect(buildNativeReminderSchedule(preferences, 'de', {
      now: mondayMorning,
      horizonDays: 1,
      hasTrackedRoutine: true,
    }).map(item => item.title)).toEqual(['Routine-Check']);
  });

  it('preserves real recovery and unfinished-set notices as one-time device alarms', () => {
    const result = buildNativeReminderSchedule({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: true,
      training: false,
      recovery: true,
      unfinishedSets: true,
    }, 'en', {
      now: mondayMorning,
      horizonDays: 1,
      pendingItems: [{
        id: 'recovery:toji:1',
        kind: 'recovery',
        title: 'Recovery check',
        body: 'Check the heatmap before the next session.',
        createdAt: mondayMorning,
        dueAt: new Date(2026, 7, 17, 19, 0).getTime(),
      }, {
        id: 'daily:unfinished:2026-08-17',
        kind: 'training',
        title: 'Open sets found',
        body: 'Confirm the sets you actually completed.',
        createdAt: mondayMorning,
        dueAt: new Date(2026, 7, 17, 20, 15).getTime(),
      }],
    });

    expect(result.map(item => item.title)).toEqual(['Recovery check', 'Open sets found']);
    expect(new Set(result.map(item => item.id)).size).toBe(result.length);
  });
});
