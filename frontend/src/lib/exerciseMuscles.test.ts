import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  inferExerciseMuscleTargets,
  parsePlannedDurationSeconds,
  parsePlannedReps,
  parsePlannedWeightKg,
  syncWorkoutSetMuscleLoad,
} from './exerciseMuscles';
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

describe('exercise muscle targeting', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

  it('maps a press to an exact primary and secondary distribution', () => {
    const targets = inferExerciseMuscleTargets({ name: 'Bench press' });
    expect(targets[0]).toEqual({ muscleId: 'chest', role: 'primary', share: 0.7 });
    expect(targets.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(1);
  });

  it('reads planned reps, weight, and timed sets', () => {
    expect(parsePlannedReps('8-12')).toBe(10);
    expect(parsePlannedWeightKg('62.5 kg')).toBe(62.5);
    expect(parsePlannedDurationSeconds('45s')).toBe(45);
  });

  it('adds and removes one deterministic set without double counting', () => {
    const exercise = { name: 'Goblet squat', sets: 3, reps: '10', weight: '24 kg', rest: 60 };
    const input = {
      exercise,
      sessionId: 'session-1',
      exerciseIndex: 0,
      setIndex: 0,
      performance: { reps: 10, weightKg: 24, durationSeconds: 0 },
    };
    const once = syncWorkoutSetMuscleLoad({ ...input, completed: true, now: 1_000 });
    const twice = syncWorkoutSetMuscleLoad({ ...input, completed: true, now: 1_000 });
    expect(once.entries).toHaveLength(3);
    expect(twice.entries).toHaveLength(3);
    expect(twice.loads.quads).toBeGreaterThan(twice.loads.glutes);

    const removed = syncWorkoutSetMuscleLoad({ ...input, completed: false, now: 1_000 });
    expect(removed.entries).toHaveLength(0);
    expect(S.get('train_muscle_load_v1')).toEqual([]);
  });
});
