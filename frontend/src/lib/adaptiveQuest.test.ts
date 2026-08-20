import { describe, expect, it } from 'vitest';

import { buildAdaptiveCharacterQuest } from './adaptiveQuest';
import type { Workout } from './fitness';
import type { MuscleLoadEntry } from './muscleLoad';

const NOW = Date.UTC(2026, 7, 20, 12);
const workouts: Workout[] = [
  {
    id: 'starter-toji-1', name: 'Toji 1', kind: 'fullbody', focus: 'Power', icon: '◇',
    source: 'generated', inspirationProfile: 'toji', exercises: [
      { name: 'Split squat', sets: 4, reps: '8-12 controlled reps', weight: 'as available', rest: 90, movement: 'squat' },
      { name: 'Suitcase carry', sets: 3, reps: '30 seconds', weight: 'as available', rest: 60, movement: 'carry' },
    ],
  },
  {
    id: 'starter-toji-2', name: 'Toji 2', kind: 'fullbody', focus: 'Pull', icon: '◇',
    source: 'generated', inspirationProfile: 'toji', exercises: [
      { name: 'Band row', sets: 3, reps: '10', weight: 'band', rest: 75, movement: 'pull' },
    ],
  },
];

function entry(muscleId: MuscleLoadEntry['muscleId'], daysAgo: number, sets = 4): MuscleLoadEntry {
  return {
    id: `${muscleId}-${daysAgo}`, muscleId, sets, reps: 12, durationMinutes: 0,
    createdAt: NOW - daysAgo * 86_400_000, source: 'session',
  };
}

describe('adaptive character quest', () => {
  it('keeps a fresh character session unchanged', () => {
    const quest = buildAdaptiveCharacterQuest(workouts, [], [], 'toji', NOW)!;
    expect(quest.level).toBe('standard');
    expect(quest.workout.inspirationProfile).toBe('toji');
    expect(quest.changedExercises).toBe(0);
  });

  it('turns persistent character-path strain into a real lighter workout', () => {
    const entries = [0, 1, 2, 3].flatMap(day => [entry('quads', day), entry('core', day)]);
    const quest = buildAdaptiveCharacterQuest(workouts, [], entries, 'toji', NOW)!;
    expect(quest.level).toBe('deload');
    expect(quest.workout.exercises[0].sets).toBeLessThan(workouts[0].exercises[0].sets);
    expect(quest.workout.adaptation?.strainedMuscles).toContain('quads');
    expect(quest.workout.source).toBe('adaptive');
  });

  it('advances the character sequence from the last base workout', () => {
    const quest = buildAdaptiveCharacterQuest(workouts, [{
      id: 's', workoutId: 'adaptive', baseWorkoutId: 'starter-toji-1', name: 'done', kind: 'fullbody',
      startedAt: NOW - 2, completedAt: NOW - 1, completedSets: 1, totalSets: 1, setState: {},
    }], [], 'toji', NOW)!;
    expect(quest.baseWorkout.id).toBe('starter-toji-2');
  });
});
