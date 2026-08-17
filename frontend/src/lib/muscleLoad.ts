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

export interface MuscleLoadEntry {
  id: string;
  muscleId: MuscleId;
  sets: number;
  reps: number;
  durationMinutes: number;
  createdAt: number;
  source: MuscleLoadSource;
}

export interface MuscleLoadInput {
  sets: number;
  reps: number;
  durationMinutes: number;
}

export const MUSCLE_LOAD_WINDOW_MS = 48 * 60 * 60 * 1000;

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
  const score = sets * 3 + sets * reps * 0.35 + durationMinutes * 0.55;
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
    return [{
      id: entry.id,
      muscleId: entry.muscleId as MuscleId,
      sets: clamp(Math.floor(finite(entry.sets)), 1, 30),
      reps: clamp(Math.floor(finite(entry.reps)), 0, 200),
      durationMinutes: clamp(finite(entry.durationMinutes), 0, 360),
      createdAt: finite(entry.createdAt),
      source,
    }];
  }).slice(0, 500);
}
