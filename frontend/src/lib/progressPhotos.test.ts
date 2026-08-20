import { describe, expect, it } from 'vitest';
import {
  calculateProgressPhotoReminder,
  DEFAULT_PROGRESS_PHOTO_REMINDER_WEEKS,
  MAX_PROGRESS_PHOTO_FILE_BYTES,
  MAX_PROGRESS_PHOTO_SET_BYTES,
  ProgressPhotoValidationError,
  validateProgressPhotoSelection,
} from './progressPhotos';

function imageBlob(type: string, size = 1): Blob {
  const blob = new Blob(['x'], { type });
  Object.defineProperty(blob, 'size', { value: size });
  return blob;
}

describe('progress photo validation', () => {
  it('accepts a complete set in stable slot order', () => {
    const result = validateProgressPhotoSelection({
      legs: imageBlob('image/webp', 400),
      head: imageBlob('image/jpeg', 100),
      'full-body': imageBlob('image/png', 500),
      torso: imageBlob('image/jpeg', 200),
    });

    expect(result.slots).toEqual(['head', 'torso', 'legs', 'full-body']);
    expect(result.totalBytes).toBe(1_200);
    expect(result.isComplete).toBe(true);
  });

  it('accepts partial check-ins and marks them incomplete', () => {
    const result = validateProgressPhotoSelection({ torso: imageBlob('image/png', 250) });

    expect(result.slots).toEqual(['torso']);
    expect(result.isComplete).toBe(false);
  });

  it.each([
    [{}, 'empty_selection'],
    [{ head: imageBlob('image/gif') }, 'unsupported_mime_type'],
    [{ head: imageBlob('image/jpeg', 0) }, 'empty_file'],
    [{ head: imageBlob('image/jpeg', MAX_PROGRESS_PHOTO_FILE_BYTES + 1) }, 'file_too_large'],
  ] as const)('rejects invalid input with %s', (photos, expectedCode) => {
    try {
      validateProgressPhotoSelection(photos);
      throw new Error('Expected validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ProgressPhotoValidationError);
      expect((error as ProgressPhotoValidationError).code).toBe(expectedCode);
    }
  });

  it('enforces the total check-in size even when every file is within its limit', () => {
    const perPhotoSize = Math.floor(MAX_PROGRESS_PHOTO_SET_BYTES / 4) + 1;

    expect(() => validateProgressPhotoSelection({
      head: imageBlob('image/jpeg', perPhotoSize),
      torso: imageBlob('image/jpeg', perPhotoSize),
      legs: imageBlob('image/jpeg', perPhotoSize),
      'full-body': imageBlob('image/jpeg', perPhotoSize),
    })).toThrowError(expect.objectContaining({ code: 'set_too_large' }));
  });

  it('rejects runtime slot values outside the four-slot contract', () => {
    expect(() => validateProgressPhotoSelection({
      face: imageBlob('image/jpeg'),
    } as never)).toThrowError(expect.objectContaining({ code: 'invalid_slot' }));
  });
});

describe('progress photo reminder calculation', () => {
  it('does not schedule a periodic reminder without a baseline', () => {
    expect(calculateProgressPhotoReminder(null, undefined, new Date(2026, 7, 12))).toEqual({
      cadenceWeeks: DEFAULT_PROGRESS_PHOTO_REMINDER_WEEKS,
      hasBaseline: false,
      latestCompletedOn: null,
      dueOn: null,
      daysUntilDue: null,
      due: false,
    });
  });

  it('uses 12 weeks by default and compares local calendar dates', () => {
    const latest = new Date(2026, 0, 5, 23, 55);
    const dueMorning = new Date(2026, 2, 30, 0, 1);
    const result = calculateProgressPhotoReminder(latest, undefined, dueMorning);

    expect(result.latestCompletedOn).toBe('2026-01-05');
    expect(result.dueOn).toBe('2026-03-30');
    expect(result.daysUntilDue).toBe(0);
    expect(result.due).toBe(true);
  });

  it.each([
    [8, '2026-02-26'],
    [10, '2026-03-12'],
    [12, '2026-03-26'],
  ] as const)('supports a %i-week cadence', (cadenceWeeks, dueOn) => {
    const result = calculateProgressPhotoReminder(
      new Date(2026, 0, 1, 12),
      cadenceWeeks,
      new Date(2026, 1, 1, 12),
    );

    expect(result.dueOn).toBe(dueOn);
    expect(result.due).toBe(false);
    expect(result.daysUntilDue).toBeGreaterThan(0);
  });

  it('reports overdue days using calendar days rather than elapsed milliseconds', () => {
    const result = calculateProgressPhotoReminder(
      new Date(2026, 0, 1, 23, 59),
      8,
      new Date(2026, 2, 1, 0, 1),
    );

    expect(result.dueOn).toBe('2026-02-26');
    expect(result.daysUntilDue).toBe(-3);
    expect(result.due).toBe(true);
  });

  it('rejects unsupported reminder intervals', () => {
    expect(() => calculateProgressPhotoReminder(
      new Date(2026, 0, 1),
      9 as never,
      new Date(2026, 0, 2),
    )).toThrowError(expect.objectContaining({ code: 'invalid_reminder_cadence' }));
  });
});
