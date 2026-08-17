import type { Exercise } from './fitness';
import {
  MUSCLE_LOAD_STORAGE_KEY,
  MUSCLE_LOAD_UPDATED_EVENT,
  calculateMuscleLoads,
  sanitizeMuscleLoadEntries,
  type ExerciseMuscleTarget,
  type MuscleId,
  type MuscleLoadEntry,
} from './muscleLoad';
import { S } from './storage';

const target = (
  muscleId: MuscleId,
  role: ExerciseMuscleTarget['role'],
  share: number,
): ExerciseMuscleTarget => ({ muscleId, role, share });

const MOVEMENT_TARGETS: Record<string, ExerciseMuscleTarget[]> = {
  squat: [target('quads', 'primary', 0.7), target('glutes', 'secondary', 0.2), target('core', 'secondary', 0.1)],
  hinge: [target('hamstrings', 'primary', 0.6), target('glutes', 'secondary', 0.25), target('back', 'secondary', 0.15)],
  push: [target('chest', 'primary', 0.7), target('triceps', 'secondary', 0.18), target('shoulders', 'secondary', 0.12)],
  pull: [target('back', 'primary', 0.7), target('biceps', 'secondary', 0.2), target('core', 'secondary', 0.1)],
  core: [target('core', 'primary', 0.7), target('shoulders', 'secondary', 0.2), target('glutes', 'secondary', 0.1)],
  conditioning: [target('quads', 'primary', 0.4), target('calves', 'secondary', 0.3), target('core', 'secondary', 0.3)],
  mobility: [target('core', 'primary', 0.4), target('hamstrings', 'secondary', 0.3), target('shoulders', 'secondary', 0.3)],
  carry: [target('core', 'primary', 0.5), target('shoulders', 'secondary', 0.3), target('back', 'secondary', 0.2)],
};

const NAME_TARGETS: Array<{ terms: string[]; targets: ExerciseMuscleTarget[] }> = [
  {
    terms: ['calf', 'waden'],
    targets: [target('calves', 'primary', 0.8), target('quads', 'secondary', 0.2)],
  },
  {
    terms: ['curl', 'bizeps'],
    targets: [target('biceps', 'primary', 0.7), target('back', 'secondary', 0.3)],
  },
  {
    terms: ['triceps', 'pushdown', 'dip'],
    targets: [target('triceps', 'primary', 0.7), target('chest', 'secondary', 0.3)],
  },
  {
    terms: ['shoulder press', 'schulterdruck', 'schulterdr', 'lateral raise', 'seitheben'],
    targets: [target('shoulders', 'primary', 0.7), target('triceps', 'secondary', 0.2), target('core', 'secondary', 0.1)],
  },
  {
    terms: ['bench', 'bankdr', 'chest press', 'brustpress', 'floor press', 'push-up', 'pushup', 'liegest'],
    targets: MOVEMENT_TARGETS.push,
  },
  {
    terms: ['row', 'rudern', 'pull-up', 'pullup', 'klimm', 'pulldown', 'latzug', 'face pull'],
    targets: MOVEMENT_TARGETS.pull,
  },
  {
    terms: ['deadlift', 'kreuzheben', 'rdl', 'hinge', 'pull-through', 'beinbeuger', 'leg curl'],
    targets: MOVEMENT_TARGETS.hinge,
  },
  {
    terms: ['lunge', 'ausfallschritt', 'split squat', 'step-up'],
    targets: [target('quads', 'primary', 0.6), target('glutes', 'secondary', 0.3), target('core', 'secondary', 0.1)],
  },
  {
    terms: ['squat', 'kniebeuge', 'leg press', 'beinpresse', 'beinstrecker'],
    targets: MOVEMENT_TARGETS.squat,
  },
  {
    terms: ['plank', 'dead bug', 'core', 'hollow', 'anti-rotation'],
    targets: MOVEMENT_TARGETS.core,
  },
  {
    terms: ['carry', 'farmer', 'suitcase'],
    targets: MOVEMENT_TARGETS.carry,
  },
  {
    terms: ['bike', 'fahrrad', 'sprint', 'interval', 'conditioning', 'jump', 'sprung'],
    targets: MOVEMENT_TARGETS.conditioning,
  },
];

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeTargets(input: ExerciseMuscleTarget[]): ExerciseMuscleTarget[] {
  const safe = input.filter(item => item && item.share > 0 && item.share <= 1);
  const total = safe.reduce((sum, item) => sum + item.share, 0);
  if (!safe.length || total <= 0) return MOVEMENT_TARGETS.core.map(item => ({ ...item }));
  return safe.map(item => ({ ...item, share: Math.round((item.share / total) * 100) / 100 }));
}

export function targetsForMovement(movement?: string): ExerciseMuscleTarget[] {
  return normalizeTargets(MOVEMENT_TARGETS[movement || ''] || MOVEMENT_TARGETS.core);
}

export function inferExerciseMuscleTargets(exercise: Pick<Exercise, 'name' | 'movement' | 'muscleTargets'>): ExerciseMuscleTarget[] {
  if (exercise.muscleTargets?.length) return normalizeTargets(exercise.muscleTargets);
  const normalized = normalizeName(exercise.name);
  const named = NAME_TARGETS.find(item => item.terms.some(term => normalized.includes(term)));
  if (named) return normalizeTargets(named.targets);
  return targetsForMovement(exercise.movement);
}

export function parsePlannedReps(value: string): number {
  if (/\b\d+\s*(?:s|sec(?:onds?)?|sek(?:unden?)?)\b/i.test(value)) return 0;
  const values = value.match(/\d+(?:[.,]\d+)?/g)?.map(item => Number(item.replace(',', '.'))) || [];
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, item) => sum + item, 0) / values.length);
}

export function parsePlannedWeightKg(value: string): number {
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return match ? Math.max(0, Number(match[1].replace(',', '.'))) : 0;
}

export function parsePlannedDurationSeconds(value: string): number {
  const secondRange = value.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(?:s|sec(?:onds?)?|sek(?:unden?)?)\b/i);
  if (secondRange) return Math.round((Number(secondRange[1].replace(',', '.')) + Number(secondRange[2].replace(',', '.'))) / 2);
  const seconds = value.match(/(\d+(?:[.,]\d+)?)\s*(?:s|sec(?:onds?)?|sek(?:unden?)?)\b/i);
  if (seconds) return Math.round(Number(seconds[1].replace(',', '.')));
  const minutes = value.match(/(\d+(?:[.,]\d+)?)\s*(?:m|min)\b/i);
  return minutes ? Math.round(Number(minutes[1].replace(',', '.')) * 60) : 0;
}

export interface LoggedSetPerformance {
  reps: number;
  weightKg: number;
  durationSeconds: number;
}

export interface WorkoutSetLoadInput {
  exercise: Exercise;
  sessionId: string;
  exerciseIndex: number;
  setIndex: number;
  completed: boolean;
  performance: LoggedSetPerformance;
  now?: number;
}

export interface WorkoutSetLoadResult {
  entries: MuscleLoadEntry[];
  loads: Record<MuscleId, number>;
  targets: ExerciseMuscleTarget[];
}

export function workoutSetSourceId(sessionId: string, exerciseIndex: number, setIndex: number): string {
  return `workout-set:${sessionId}:${exerciseIndex}:${setIndex}`;
}

export function syncWorkoutSetMuscleLoad(input: WorkoutSetLoadInput): WorkoutSetLoadResult {
  const now = input.now ?? Date.now();
  const sourceId = workoutSetSourceId(input.sessionId, input.exerciseIndex, input.setIndex);
  const targets = inferExerciseMuscleTargets(input.exercise);
  const previous = sanitizeMuscleLoadEntries(S.get<unknown>(MUSCLE_LOAD_STORAGE_KEY));
  const withoutSet = previous.filter(entry => entry.sourceId !== sourceId);
  const entries = input.completed
    ? [
      ...targets.map<MuscleLoadEntry>(muscleTarget => ({
        id: `${sourceId}:${muscleTarget.muscleId}`,
        muscleId: muscleTarget.muscleId,
        sets: 1,
        reps: Math.max(0, Math.min(200, Math.floor(Number(input.performance.reps) || 0))),
        durationMinutes: Math.max(0, Math.min(360, Number(input.performance.durationSeconds) || 0)) / 60,
        weightKg: Math.max(0, Math.min(500, Number(input.performance.weightKg) || 0)),
        targetShare: muscleTarget.share,
        role: muscleTarget.role,
        exerciseName: input.exercise.name,
        sourceId,
        sessionId: input.sessionId,
        createdAt: now,
        source: 'set',
      })),
      ...withoutSet,
    ].slice(0, 500)
    : withoutSet;

  S.set(MUSCLE_LOAD_STORAGE_KEY, entries);
  const loads = calculateMuscleLoads(entries, now);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MUSCLE_LOAD_UPDATED_EVENT, {
      detail: {
        muscleIds: targets.map(item => item.muscleId),
        primaryMuscleId: targets.find(item => item.role === 'primary')?.muscleId,
        exerciseName: input.exercise.name,
        targets,
        loads,
      },
    }));
  }

  return { entries, loads, targets };
}

export function loadCurrentMuscleLoads(now = Date.now()): Record<MuscleId, number> {
  return calculateMuscleLoads(
    sanitizeMuscleLoadEntries(S.get<unknown>(MUSCLE_LOAD_STORAGE_KEY)),
    now,
  );
}

export function loadSessionMuscleLoads(sessionId: string, now = Date.now()): Record<MuscleId, number> {
  const entries = sanitizeMuscleLoadEntries(S.get<unknown>(MUSCLE_LOAD_STORAGE_KEY))
    .filter(entry => entry.sessionId === sessionId);
  return calculateMuscleLoads(entries, now);
}
