import { describe, expect, it } from 'vitest';

import {
  MUSCLE_LOAD_WINDOW_MS,
  calculateMuscleLoads,
  calculateTrainingLoad,
  getMuscleLoadBand,
  muscleLoadColor,
  sanitizeMuscleLoadEntries,
  type MuscleLoadEntry,
} from './muscleLoad';

describe('muscle training-load model', () => {
  it('scores sets, reps, and time with transparent bounds', () => {
    expect(calculateTrainingLoad({ sets: 3, reps: 10, durationMinutes: 30 })).toBe(81);
    expect(calculateTrainingLoad({ sets: 0, reps: 0, durationMinutes: 0 })).toBe(0);
    expect(calculateTrainingLoad({ sets: 30, reps: 200, durationMinutes: 360 })).toBe(100);
  });

  it('adds recent entries and linearly releases their display load over 48 hours', () => {
    const now = new Date('2026-08-17T08:00:00Z').getTime();
    const entry: MuscleLoadEntry = {
      id: 'entry-1',
      muscleId: 'chest',
      sets: 3,
      reps: 10,
      durationMinutes: 30,
      createdAt: now,
      source: 'session',
    };

    expect(calculateMuscleLoads([entry], now).chest).toBe(81);
    expect(calculateMuscleLoads([entry], now + MUSCLE_LOAD_WINDOW_MS / 2).chest).toBe(41);
    expect(calculateMuscleLoads([entry], now + MUSCLE_LOAD_WINDOW_MS).chest).toBe(0);
  });

  it('maps the relative score to readable state bands and a green-to-red scale', () => {
    expect(getMuscleLoadBand(0)).toBe('fresh');
    expect(getMuscleLoadBand(30)).toBe('loaded');
    expect(getMuscleLoadBand(65)).toBe('strained');
    expect(muscleLoadColor(0)).toBe('#83d8b2');
    expect(muscleLoadColor(100)).toBe('#ef6675');
  });

  it('drops malformed stored entries and bounds valid numeric values', () => {
    const entries = sanitizeMuscleLoadEntries([
      null,
      { id: 'bad-zone', muscleId: 'neck', createdAt: 1 },
      { id: 'ok', muscleId: 'quads', sets: 99, reps: -2, durationMinutes: 999, createdAt: 10, source: 'set' },
    ]);

    expect(entries).toEqual([{
      id: 'ok',
      muscleId: 'quads',
      sets: 30,
      reps: 0,
      durationMinutes: 360,
      createdAt: 10,
      source: 'set',
    }]);
  });
});
