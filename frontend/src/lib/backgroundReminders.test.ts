import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  backgroundRemindersSupported,
  buildBackgroundSchedule,
} from './backgroundReminders';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notifications';
import { dateKey } from './storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

// A Wednesday at 09:00 local time.
const NOW = new Date(2026, 7, 19, 9, 0, 0).getTime();
const DAY = dateKey(new Date(NOW));

const preferences = (patch: Partial<typeof DEFAULT_NOTIFICATION_PREFERENCES> = {}) => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  enabled: true,
  ...patch,
});

describe('background reminder schedule', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', undefined);
  });

  it('stays empty while notifications are switched off', () => {
    const schedule = buildBackgroundSchedule(preferences({ enabled: false }), NOW);
    expect(schedule.reminders).toEqual([]);
  });

  it('carries the training reminder with its own days and time', () => {
    const schedule = buildBackgroundSchedule(preferences({ trainingTime: '17:30', trainingDays: [2, 4] }), NOW, 'en');
    const training = schedule.reminders.find(reminder => reminder.id === 'training');
    expect(training).toMatchObject({ time: '17:30', days: [2, 4], url: './?screen=training' });
    expect(training?.suppressedOn).toBeUndefined();
    expect(training?.title).toBe('Character quest available');
    expect(schedule.quietStart).toBe(DEFAULT_NOTIFICATION_PREFERENCES.quietStart);
  });

  it('suppresses a reminder the app already saw as satisfied today', () => {
    localStorage.setItem('sg_train_sessions', JSON.stringify([{ completedAt: NOW - 3_600_000 }]));
    localStorage.setItem(`sg_food_${DAY}`, JSON.stringify([{ id: 1, name: 'Oats', kcal: 400 }]));
    localStorage.setItem(`sg_mana_${DAY}`, JSON.stringify(3));

    const schedule = buildBackgroundSchedule(preferences({ meals: true, hydration: true }), NOW);
    const byId = Object.fromEntries(schedule.reminders.map(reminder => [reminder.id, reminder]));
    expect(byId.training.suppressedOn).toBe(DAY);
    expect(byId.meals.suppressedOn).toBe(DAY);
    expect(byId.hydration.suppressedOn).toBe(DAY);
  });

  it('adds the routine reminder only when something is actually tracked', () => {
    expect(buildBackgroundSchedule(preferences({ supplements: true }), NOW).reminders
      .some(reminder => reminder.id === 'supplements')).toBe(false);

    localStorage.setItem('sg_protocol', JSON.stringify([{ id: 'protein', phase: 'beta' }]));
    const schedule = buildBackgroundSchedule(preferences({ supplements: true, supplementTime: '08:15' }), NOW);
    const routine = schedule.reminders.find(reminder => reminder.id === 'supplements');
    expect(routine).toMatchObject({ time: '08:15', days: [], url: './?screen=ki' });

    localStorage.setItem(`sg_day_${DAY}`, JSON.stringify(['protein']));
    expect(buildBackgroundSchedule(preferences({ supplements: true }), NOW).reminders
      .find(reminder => reminder.id === 'supplements')?.suppressedOn).toBe(DAY);
  });

  it('passes quiet hours and snooze through to the worker', () => {
    const schedule = buildBackgroundSchedule(
      preferences({ quietStart: '23:00', quietEnd: '06:30', snoozedUntil: NOW + 60_000 }),
      NOW,
    );
    expect(schedule.quietStart).toBe('23:00');
    expect(schedule.quietEnd).toBe('06:30');
    expect(schedule.snoozedUntil).toBe(NOW + 60_000);
  });

  it('reports no support without the browser APIs', () => {
    expect(backgroundRemindersSupported()).toBe(false);
  });
});
