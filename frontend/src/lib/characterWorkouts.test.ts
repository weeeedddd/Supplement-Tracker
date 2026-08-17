import { beforeEach, describe, expect, it, vi } from 'vitest';

import { replaceStarterWorkouts, starterWorkoutsFromPlan } from './characterWorkouts';
import type { Workout } from './fitness';
import { generateInitialPlan, type PlanInput } from './plans';
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

const input: PlanInput = {
  mode: 'inspiration',
  inspirationProfile: 'sanji',
  displayName: 'Mira',
  age: 28,
  heightCm: 170,
  weightKg: 68,
  experience: 'intermediate',
  daysPerWeek: 3,
  equipment: ['bodyweight'],
  diet: 'flexible',
  goal: 'general_fitness',
  difficulty: 'medium',
};

describe('character starter workout replacement', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

  it('turns a generated path into heatmap-ready starter workouts', () => {
    const plan = generateInitialPlan(input, 'de');
    const workouts = starterWorkoutsFromPlan(plan, 'sanji', 'de');
    const calfRaise = workouts.flatMap(workout => workout.exercises)
      .find(exercise => exercise.name === 'Einbeiniges Wadenheben');

    expect(workouts.every(workout => workout.inspirationProfile === 'sanji')).toBe(true);
    expect(calfRaise?.muscleTargets?.[0]).toEqual({ muscleId: 'calves', role: 'primary', share: .85 });
  });

  it('replaces generated starters while preserving personal plans', () => {
    const manual: Workout = {
      id: 'manual-1',
      name: 'My plan',
      kind: 'fullbody',
      focus: 'Custom',
      icon: '',
      source: 'manual',
      exercises: [{ name: 'Squat', sets: 3, reps: '8', weight: 'bodyweight', rest: 60 }],
    };
    S.set('train_user_plans', [manual, { ...manual, id: 'starter-toji-1', source: 'generated', inspirationProfile: 'toji' }]);

    const next = replaceStarterWorkouts(generateInitialPlan(input), 'sanji', 'en');
    expect(next.some(workout => workout.id === 'manual-1')).toBe(true);
    expect(next.some(workout => workout.id === 'starter-toji-1')).toBe(false);
    expect(next.filter(workout => String(workout.id).startsWith('starter-')).every(workout => workout.inspirationProfile === 'sanji')).toBe(true);
  });
});
