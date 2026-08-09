import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeWorkoutSession,
  createDailyWorkout,
  getActiveBuffs,
  getWorkoutSessions,
  loadWorkoutDraft,
  logWorkout,
  saveWorkoutProgress,
  type Workout,
} from './fitness';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('workout completion rewards', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.setSystemTime(new Date('2026-08-05T08:00:00Z'));
  });

  it('does not grant a reward when zero sets were completed', async () => {
    const reward = await logWorkout({
      name: 'Push Day',
      kind: 'push',
      sessionId: 'session-zero',
      completedSets: 0,
      totalSets: 4,
    });

    expect(reward).toBeNull();
    expect(getActiveBuffs()).toEqual([]);
  });

  it('grants at most one reward for the same completed session', async () => {
    const completion = {
      name: 'Push Day',
      kind: 'push',
      sessionId: 'session-complete',
      completedSets: 4,
      totalSets: 4,
    };

    const first = await logWorkout(completion);
    const repeated = await logWorkout(completion);

    expect(first).not.toBeNull();
    expect(first?.boosts).toEqual({});
    expect(`${first?.label} ${first?.desc}`).not.toMatch(/\+\d|STR|VIT|INT|AGI|MAG/);
    expect(repeated).toBeNull();
    expect(getActiveBuffs()).toHaveLength(1);
  });

  it('restores completed sets and records one finished session', async () => {
    const workout: Workout = {
      id: 'test-push',
      name: 'Test Push',
      kind: 'push',
      focus: 'Regression',
      icon: 'T',
      exercises: [
        { name: 'Press', sets: 2, reps: '8', weight: '20 kg', rest: 60 },
        { name: 'Raise', sets: 1, reps: '12', weight: '5 kg', rest: 45 },
      ],
    };
    const draft = loadWorkoutDraft(workout);

    saveWorkoutProgress(workout, draft.sessionId, {
      0: [true, false],
      1: [false],
    }, draft.startedAt);

    const restored = loadWorkoutDraft(workout);
    expect(restored.completedSets).toEqual({ 0: [true, false], 1: [false] });

    const incomplete = await completeWorkoutSession(workout, restored);
    expect(incomplete.status).toBe('incomplete');
    expect(getWorkoutSessions()).toEqual([]);

    const completeDraft = saveWorkoutProgress(workout, draft.sessionId, {
      0: [true, true],
      1: [true],
    }, draft.startedAt);
    const completed = await completeWorkoutSession(workout, completeDraft);
    const repeated = await completeWorkoutSession(workout, completeDraft);

    expect(completed.status).toBe('completed');
    expect(repeated.status).toBe('already-completed');
    expect(getWorkoutSessions()).toHaveLength(1);
    expect(getWorkoutSessions()[0]).toMatchObject({
      workoutId: 'test-push',
      completedSets: 3,
      totalSets: 3,
    });
  });

  it('creates a distinct manual daily workout without saving a reusable plan', () => {
    const workout = createDailyWorkout({
      name: 'Lunch break session',
      kind: 'fullbody',
      focus: 'Today',
      icon: 'T',
      exercises: [{ name: 'Squat', sets: 3, reps: '10', weight: 'bodyweight', rest: 60 }],
    }, new Date('2026-08-05T12:00:00Z'));

    expect(workout.id).toMatch(/^daily-2026-08-05-/);
    expect(workout.source).toBe('daily');
    expect(workout.exercises).toHaveLength(1);
  });
});
