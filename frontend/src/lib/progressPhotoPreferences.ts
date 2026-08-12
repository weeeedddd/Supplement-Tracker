import {
  DEFAULT_PROGRESS_PHOTO_REMINDER_WEEKS,
  PROGRESS_PHOTO_REMINDER_OPTIONS,
  type ProgressPhotoReminderWeeks,
} from './progressPhotos';
import { S } from './storage';

export const PROGRESS_PHOTO_PREFERENCES_KEY = 'progressPhotoPreferences';
export const PROGRESS_PHOTO_REMINDER_EVENT = 'coreline:progress-photo-change';

export interface ProgressPhotoPreferences {
  cadenceWeeks: ProgressPhotoReminderWeeks;
  reminderEnabled: boolean;
  snoozedUntil: string | null;
}

const DEFAULT_PREFERENCES: ProgressPhotoPreferences = {
  cadenceWeeks: DEFAULT_PROGRESS_PHOTO_REMINDER_WEEKS,
  reminderEnabled: true,
  snoozedUntil: null,
};

function isCadence(value: unknown): value is ProgressPhotoReminderWeeks {
  return typeof value === 'number'
    && PROGRESS_PHOTO_REMINDER_OPTIONS.includes(value as ProgressPhotoReminderWeeks);
}

function validSnooze(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function getProgressPhotoPreferences(): ProgressPhotoPreferences {
  const stored = S.get<Partial<ProgressPhotoPreferences>>(PROGRESS_PHOTO_PREFERENCES_KEY);
  return {
    cadenceWeeks: isCadence(stored?.cadenceWeeks)
      ? stored.cadenceWeeks
      : DEFAULT_PREFERENCES.cadenceWeeks,
    reminderEnabled: typeof stored?.reminderEnabled === 'boolean'
      ? stored.reminderEnabled
      : DEFAULT_PREFERENCES.reminderEnabled,
    snoozedUntil: validSnooze(stored?.snoozedUntil),
  };
}

export function notifyProgressPhotoChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PROGRESS_PHOTO_REMINDER_EVENT));
  }
}

function saveProgressPhotoPreferences(preferences: ProgressPhotoPreferences): void {
  S.set(PROGRESS_PHOTO_PREFERENCES_KEY, preferences);
  notifyProgressPhotoChange();
}

export function setProgressPhotoCadence(cadenceWeeks: ProgressPhotoReminderWeeks): void {
  if (!isCadence(cadenceWeeks)) return;
  saveProgressPhotoPreferences({
    ...getProgressPhotoPreferences(),
    cadenceWeeks,
    snoozedUntil: null,
  });
}

export function setProgressPhotoReminderEnabled(reminderEnabled: boolean): void {
  saveProgressPhotoPreferences({
    ...getProgressPhotoPreferences(),
    reminderEnabled,
    snoozedUntil: reminderEnabled ? getProgressPhotoPreferences().snoozedUntil : null,
  });
}

export function snoozeProgressPhotoReminder(days = 7, now = new Date()): void {
  const safeDays = Number.isFinite(days) ? Math.min(30, Math.max(1, Math.round(days))) : 7;
  const snoozedUntil = new Date(now.getTime());
  snoozedUntil.setDate(snoozedUntil.getDate() + safeDays);
  saveProgressPhotoPreferences({
    ...getProgressPhotoPreferences(),
    snoozedUntil: snoozedUntil.toISOString(),
  });
}

export function isProgressPhotoReminderSnoozed(
  preferences = getProgressPhotoPreferences(),
  now = new Date(),
): boolean {
  if (!preferences.snoozedUntil) return false;
  return new Date(preferences.snoozedUntil).getTime() > now.getTime();
}
