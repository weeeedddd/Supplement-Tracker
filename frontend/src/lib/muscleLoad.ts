export const MUSCLE_IDS = [
  'shoulders',
  'chest',
  'biceps',
  'core',
  'quads',
  'back',
  'triceps',
  'glutes',
  'hamstrings',
  'calves',
] as const;

export type MuscleId = (typeof MUSCLE_IDS)[number];
export type MuscleLoadBand = 'fresh' | 'loaded' | 'strained';
export type MuscleLoadSource = 'set' | 'session';
export type MuscleTargetRole = 'primary' | 'secondary';

export interface ExerciseMuscleTarget {
  muscleId: MuscleId;
  role: MuscleTargetRole;
  /** Share of this exercise's training stimulus, expressed from 0 to 1. */
  share: number;
}

export interface MuscleLoadEntry {
  id: string;
  muscleId: MuscleId;
  sets: number;
  reps: number;
  durationMinutes: number;
  createdAt: number;
  source: MuscleLoadSource;
  targetShare?: number;
  weightKg?: number;
  exerciseName?: string;
  role?: MuscleTargetRole;
  sourceId?: string;
  sessionId?: string;
}

export interface MuscleLoadInput {
  sets: number;
  reps: number;
  durationMinutes: number;
  targetShare?: number;
  weightKg?: number;
}

export const MUSCLE_LOAD_WINDOW_MS = 48 * 60 * 60 * 1000;
export const MUSCLE_LOAD_STORAGE_KEY = 'train_muscle_load_v1';
export const MUSCLE_LOAD_UPDATED_EVENT = 'coreline:muscle-load-updated';

const MUSCLE_ID_SET = new Set<string>(MUSCLE_IDS);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculateTrainingLoad(input: MuscleLoadInput): number {
  const sets = clamp(Math.floor(finite(input.sets)), 0, 30);
  const reps = clamp(Math.floor(finite(input.reps)), 0, 200);
  const durationMinutes = clamp(finite(input.durationMinutes), 0, 360);

  // A transparent, deliberately conservative relative score. It is a UI
  // training-load estimate, not a readiness, recovery, or injury diagnosis.
  const targetShare = clamp(finite(input.targetShare, 1), 0.05, 1);
  const weightKg = clamp(finite(input.weightKg), 0, 500);
  // Weight contributes only a modest multiplier because we do not know the
  // user's 1RM or proximity to failure. The role/share remains the dominant
  // distribution signal for the visualizer.
  const weightFactor = weightKg > 0 ? 1 + Math.min(weightKg / 250, 0.5) : 1;
  // A completed working set should be visible immediately, while a full
  // three-set exercise should normally reach the moderate band on its primary
  // muscle. That keeps the console game-like without pretending to measure
  // physiological damage. Repeated sessions inside the 48-hour window are
  // what push a zone toward the high band.
  const score = (sets * 8 + sets * reps * 0.7 + durationMinutes * 1.2)
    * targetShare
    * weightFactor;
  return clamp(Math.round(score), 0, 100);
}

export function calculateMuscleLoads(
  entries: MuscleLoadEntry[],
  now = Date.now(),
): Record<MuscleId, number> {
  const totals = Object.fromEntries(MUSCLE_IDS.map(id => [id, 0])) as Record<MuscleId, number>;

  entries.forEach(entry => {
    if (!MUSCLE_ID_SET.has(entry.muscleId)) return;
    const age = Math.max(0, now - entry.createdAt);
    if (age >= MUSCLE_LOAD_WINDOW_MS) return;
    const remaining = 1 - age / MUSCLE_LOAD_WINDOW_MS;
    totals[entry.muscleId] += calculateTrainingLoad(entry) * remaining;
  });

  MUSCLE_IDS.forEach(id => {
    totals[id] = clamp(Math.round(totals[id]), 0, 100);
  });
  return totals;
}

export function getMuscleLoadBand(load: number): MuscleLoadBand {
  if (load >= 65) return 'strained';
  if (load >= 30) return 'loaded';
  return 'fresh';
}

function mixHex(from: string, to: string, amount: number): string {
  const start = from.slice(1).match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) || [0, 0, 0];
  const end = to.slice(1).match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) || [0, 0, 0];
  const mixed = start.map((value, index) => Math.round(value + (end[index] - value) * clamp(amount, 0, 1)));
  return `#${mixed.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

export function muscleLoadColor(load: number): string {
  const normalized = clamp(load, 0, 100);
  if (normalized <= 55) return mixHex('#83d8b2', '#e9c36a', normalized / 55);
  return mixHex('#e9c36a', '#ef6675', (normalized - 55) / 45);
}

export function sanitizeMuscleLoadEntries(value: unknown): MuscleLoadEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(candidate => {
    if (!candidate || typeof candidate !== 'object') return [];
    const entry = candidate as Partial<MuscleLoadEntry>;
    if (
      typeof entry.id !== 'string'
      || !MUSCLE_ID_SET.has(String(entry.muscleId))
      || !Number.isFinite(Number(entry.createdAt))
    ) return [];

    const source: MuscleLoadSource = entry.source === 'set' ? 'set' : 'session';
    const role: MuscleTargetRole | undefined = entry.role === 'primary' || entry.role === 'secondary'
      ? entry.role
      : undefined;
    const targetShare = entry.targetShare === undefined
      ? undefined
      : clamp(finite(entry.targetShare, 1), 0.05, 1);
    const weightKg = entry.weightKg === undefined
      ? undefined
      : clamp(finite(entry.weightKg), 0, 500);
    return [{
      id: entry.id,
      muscleId: entry.muscleId as MuscleId,
      sets: clamp(Math.floor(finite(entry.sets)), 1, 30),
      reps: clamp(Math.floor(finite(entry.reps)), 0, 200),
      durationMinutes: clamp(finite(entry.durationMinutes), 0, 360),
      createdAt: finite(entry.createdAt),
      source,
      ...(targetShare === undefined ? {} : { targetShare }),
      ...(weightKg === undefined ? {} : { weightKg }),
      ...(typeof entry.exerciseName === 'string' && entry.exerciseName.trim()
        ? { exerciseName: entry.exerciseName.trim().slice(0, 120) }
        : {}),
      ...(role ? { role } : {}),
      ...(typeof entry.sourceId === 'string' && entry.sourceId.trim()
        ? { sourceId: entry.sourceId.trim().slice(0, 220) }
        : {}),
      ...(typeof entry.sessionId === 'string' && entry.sessionId.trim()
        ? { sessionId: entry.sessionId.trim().slice(0, 180) }
        : {}),
    }];
  }).slice(0, 500);
}
