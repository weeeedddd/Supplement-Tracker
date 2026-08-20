import { detectDeload, type DeloadSignal } from './deload';
import { inferExerciseMuscleTargets } from './exerciseMuscles';
import type { Exercise, Workout, WorkoutSession } from './fitness';
import {
  MUSCLE_IDS,
  calculateMuscleLoads,
  type MuscleId,
  type MuscleLoadEntry,
} from './muscleLoad';
import type { InspirationProfileId } from './plans';

export type AdaptiveQuestLevel = 'standard' | 'adjusted' | 'deload';

export interface QuestMuscleForecast {
  muscleId: MuscleId;
  current: number;
  share: number;
}

export interface AdaptiveCharacterQuest {
  workout: Workout;
  baseWorkout: Workout;
  level: AdaptiveQuestLevel;
  fatigue: number;
  deload: DeloadSignal;
  forecast: QuestMuscleForecast[];
  changedExercises: number;
  reasonCodes: Array<'sequence' | 'fatigue' | 'persistent-strain' | 'volume-spike'>;
}

function exerciseFatigue(exercise: Exercise, loads: Record<MuscleId, number>): number {
  const targets = inferExerciseMuscleTargets(exercise);
  return Math.round(targets.reduce((sum, target) => sum + loads[target.muscleId] * target.share, 0));
}

function workoutFatigue(workout: Workout, loads: Record<MuscleId, number>): number {
  if (!workout.exercises.length) return 0;
  const values = workout.exercises.map(exercise => exerciseFatigue(exercise, loads));
  // The peak matters, but one tired support muscle should not erase the whole
  // character path. This blend keeps the recommendation conservative.
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average * .65 + Math.max(...values) * .35);
}

function nextSequenceIndex(workouts: Workout[], sessions: WorkoutSession[]): number {
  const ids = workouts.map(workout => String(workout.id));
  const latest = sessions.find(session => {
    const baseId = session.baseWorkoutId || session.workoutId;
    return ids.includes(String(baseId));
  });
  if (!latest) return 0;
  const index = ids.indexOf(String(latest.baseWorkoutId || latest.workoutId));
  return index < 0 ? 0 : (index + 1) % workouts.length;
}

function chooseBase(
  workouts: Workout[],
  sessions: WorkoutSession[],
  loads: Record<MuscleId, number>,
): Workout {
  const sequence = nextSequenceIndex(workouts, sessions);
  const sequenced = workoutFatigue(workouts[sequence], loads);
  if (sequenced < 65) return workouts[sequence];
  return [...workouts].sort((first, second) => workoutFatigue(first, loads) - workoutFatigue(second, loads))[0];
}

function scalePrescription(value: string, factor: number): string {
  if (factor >= .99) return value;
  const range = value.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) {
    const low = Math.max(1, Math.round(Number(range[1]) * factor));
    const high = Math.max(low, Math.round(Number(range[2]) * factor));
    return value.replace(range[0], `${low}–${high}`);
  }
  const single = value.match(/\d+/);
  if (!single) return value;
  return value.replace(single[0], String(Math.max(1, Math.round(Number(single[0]) * factor))));
}

function adaptExercise(
  exercise: Exercise,
  level: AdaptiveQuestLevel,
  loads: Record<MuscleId, number>,
): Exercise {
  const fatigue = exerciseFatigue(exercise, loads);
  const factor = level === 'deload'
    ? fatigue >= 65 ? .5 : .67
    : level === 'adjusted' && fatigue >= 45 ? .8 : 1;
  if (factor >= .99) return { ...exercise, muscleTargets: exercise.muscleTargets?.map(target => ({ ...target })) };
  return {
    ...exercise,
    sets: Math.max(1, Math.round(exercise.sets * factor)),
    reps: scalePrescription(exercise.reps, level === 'deload' ? .8 : .9),
    rest: Math.min(300, Math.round(exercise.rest * (level === 'deload' ? 1.25 : 1.1))),
    muscleTargets: exercise.muscleTargets?.map(target => ({ ...target })),
  };
}

function muscleForecast(workout: Workout, loads: Record<MuscleId, number>): QuestMuscleForecast[] {
  const shares = Object.fromEntries(MUSCLE_IDS.map(id => [id, 0])) as Record<MuscleId, number>;
  workout.exercises.forEach(exercise => inferExerciseMuscleTargets(exercise).forEach(target => {
    shares[target.muscleId] += target.share * exercise.sets;
  }));
  const total = Object.values(shares).reduce((sum, value) => sum + value, 0) || 1;
  return MUSCLE_IDS.map(muscleId => ({
    muscleId,
    current: loads[muscleId],
    share: Math.round((shares[muscleId] / total) * 100),
  })).filter(item => item.share > 0).sort((first, second) => second.share - first.share);
}

export function buildAdaptiveCharacterQuest(
  workouts: Workout[],
  sessions: WorkoutSession[],
  entries: MuscleLoadEntry[],
  characterPath: InspirationProfileId,
  now = Date.now(),
): AdaptiveCharacterQuest | null {
  const characterWorkouts = workouts.filter(workout => workout.inspirationProfile === characterPath);
  if (!characterWorkouts.length) return null;
  const loads = calculateMuscleLoads(entries, now);
  const deload = detectDeload(entries, now);
  const baseWorkout = chooseBase(characterWorkouts, sessions, loads);
  const fatigue = workoutFatigue(baseWorkout, loads);
  const peak = Math.max(...Object.values(loads));
  const level: AdaptiveQuestLevel = (
    deload.level === 'advised' || deload.level === 'urgent' || peak >= 80 || fatigue >= 68
  ) ? 'deload' : (
    deload.level === 'watch' || peak >= 50 || fatigue >= 45
  ) ? 'adjusted' : 'standard';
  const exercises = baseWorkout.exercises.map(exercise => adaptExercise(exercise, level, loads));
  const changedExercises = exercises.filter((exercise, index) => (
    exercise.sets !== baseWorkout.exercises[index].sets
    || exercise.reps !== baseWorkout.exercises[index].reps
    || exercise.rest !== baseWorkout.exercises[index].rest
  )).length;
  const strainedMuscles = MUSCLE_IDS.filter(id => loads[id] >= 65);
  const reasonCodes: AdaptiveCharacterQuest['reasonCodes'] = ['sequence'];
  if (level !== 'standard') reasonCodes.push('fatigue');
  if (deload.reasons.includes('persistent-strain')) reasonCodes.push('persistent-strain');
  if (deload.reasons.includes('volume-spike')) reasonCodes.push('volume-spike');
  const workout: Workout = {
    ...baseWorkout,
    id: `adaptive-${baseWorkout.id}-${new Date(now).toISOString().slice(0, 10)}`,
    name: `${baseWorkout.name} · Adaptive Quest`,
    focus: baseWorkout.focus,
    exercises,
    source: 'adaptive',
    is_preset: false,
    adaptation: {
      baseWorkoutId: String(baseWorkout.id),
      level,
      fatigue,
      changedExercises,
      strainedMuscles,
      generatedAt: now,
    },
  };
  return {
    workout,
    baseWorkout,
    level,
    fatigue,
    deload,
    forecast: muscleForecast(workout, loads),
    changedExercises,
    reasonCodes,
  };
}
