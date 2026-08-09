// ═══════════════════════════════════════════════════════════════════
//  ◈ AGENT TRAINING PROTOCOLS & MATERIA FUEL — Frontend-Datenschicht
//  Offline-first: presets, user recipes, sessions and logs stay local.
//  Account-backed sync is intentionally deferred until real authentication
//  and explicit sync consent exist.
// ═══════════════════════════════════════════════════════════════════
import { S } from './storage';
import { PRESET_DISHES } from './dishesData';
import { getFoodLog, saveFoodLog, type FoodEntry } from './engine';
import { lang } from './i18n';
import { clampNutritionNumber, NUTRITION_LIMITS } from './nutritionBounds';
import { CURATED_RECIPES, recipeToDish } from './recipes';

export interface DishLoc { name: string; ingredients: string[]; steps: string[]; }
export interface Dish {
  id: number | string; name: string; category: string;
  ingredients: string[]; steps?: string[]; prep_min: number;
  kcal: number; prot: number; carb: number; fat: number; sug?: number;
  equipment: string[]; icon: string; image?: string; is_preset?: boolean; owner_uid?: string;
  i18n?: Record<string, DishLoc>;
}
export interface Nutrition { kcal: number; prot: number; carb: number; fat: number; sug: number; }
export type NutritionInput = Partial<Nutrition>;
export interface NutritionIssue { field: keyof Nutrition; code: 'not-finite' | 'negative' | 'above-maximum' | 'sugar-exceeds-carbs' | 'zero-calories'; }

/** Lokalisierte Sicht auf ein Gericht je nach aktiver Sprache (de = Basis). */
export function locDish(d: Dish): Dish {
  const loc = d.i18n?.[lang];
  if (!loc) return d;
  return {
    ...d,
    name: loc.name || d.name,
    ingredients: loc.ingredients?.length ? loc.ingredients : d.ingredients,
    steps: loc.steps?.length ? loc.steps : d.steps,
  };
}
export interface Exercise { name: string; sets: number; reps: string; weight: string; rest: number; }
export interface Workout {
  id: number | string; name: string; kind: string; focus: string;
  exercises: Exercise[]; icon: string; is_preset?: boolean;
  source?: 'preset' | 'manual' | 'generated' | 'daily';
}
export interface Buff { label: string; icon: string; desc: string; boosts: Record<string, number>; expires_at: number; source?: string; }
export interface WorkoutLogInput {
  name: string;
  kind: string;
  sessionId?: string;
  completedSets?: number;
  totalSets?: number;
}
export type CompletedSetMap = Record<number, boolean[]>;
export interface WorkoutDraft {
  sessionId: string;
  workoutId: string;
  startedAt: number;
  updatedAt: number;
  completedSets: CompletedSetMap;
}
export interface WorkoutSession {
  id: string;
  workoutId: string;
  name: string;
  kind: string;
  startedAt: number;
  completedAt: number;
  completedSets: number;
  totalSets: number;
  setState: CompletedSetMap;
}
export interface WorkoutCompletion {
  status: 'completed' | 'incomplete' | 'invalid' | 'already-completed';
  buff: Buff | null;
  session?: WorkoutSession;
}

// ── Preset-Daten (Spiegel des Backends → funktioniert ohne Server) ───
//   Der vollständige Katalog (100+ Gerichte mit Bild & Zubereitung) liegt in
//   dishesData.ts und wird aus derselben Quelle wie das Backend generiert.
export { PRESET_DISHES };
export const CURATED_DISHES: Dish[] = CURATED_RECIPES.map(recipe => recipeToDish(recipe));

const ex = (name: string, sets: number, reps: string, weight: string, rest: number): Exercise => ({ name, sets, reps, weight, rest });
export const PRESET_WORKOUTS: Workout[] = [
  { id: 'w-push', name: 'Push Day', kind: 'push', focus: 'Brust · Schultern · Trizeps', icon: '◇', is_preset: true, exercises: [
    ex('Bankdrücken', 4, '6-8', '80 kg', 120), ex('Schrägbank-Kurzhantel', 3, '10', '24 kg', 90),
    ex('Schulterdrücken', 3, '10', '18 kg', 90), ex('Seitheben', 3, '15', '10 kg', 60), ex('Trizeps-Pushdown', 3, '12', '25 kg', 60)] },
  { id: 'w-pull', name: 'Pull Day', kind: 'pull', focus: 'Rücken · Bizeps', icon: '◇', is_preset: true, exercises: [
    ex('Klimmzüge', 4, '8', 'BW', 120), ex('Langhantelrudern', 4, '8', '70 kg', 100),
    ex('Latzug', 3, '12', '55 kg', 90), ex('Face Pulls', 3, '15', '20 kg', 60), ex('Bizeps-Curls', 3, '12', '14 kg', 60)] },
  { id: 'w-legs', name: 'Leg Day', kind: 'legs', focus: 'Quads · Hamstrings · Waden', icon: '◇', is_preset: true, exercises: [
    ex('Kniebeugen', 4, '6-8', '100 kg', 150), ex('Rumänisches Kreuzheben', 3, '10', '80 kg', 120),
    ex('Beinpresse', 3, '12', '160 kg', 90), ex('Beinbeuger', 3, '12', '40 kg', 75), ex('Wadenheben', 4, '15', '60 kg', 45)] },
  { id: 'w-full', name: 'Ganzkörper Basis', kind: 'fullbody', focus: 'Kraft-Grundlagen für Einsteiger', icon: '◇', is_preset: true, exercises: [
    ex('Kniebeugen', 3, '10', '50 kg', 90), ex('Bankdrücken', 3, '10', '50 kg', 90),
    ex('Langhantelrudern', 3, '10', '45 kg', 90), ex('Schulterdrücken', 3, '12', '14 kg', 75), ex('Plank', 3, '45s', 'BW', 45)] },
];

const ENGLISH_PRESET_WORKOUTS: Record<string, { name: string; focus: string; exercises: string[] }> = {
  'w-push': { name: 'Push day', focus: 'Chest · shoulders · triceps', exercises: ['Bench press', 'Incline dumbbell press', 'Shoulder press', 'Lateral raise', 'Triceps pushdown'] },
  'w-pull': { name: 'Pull day', focus: 'Back · biceps', exercises: ['Pull-ups', 'Barbell row', 'Lat pulldown', 'Face pulls', 'Biceps curls'] },
  'w-legs': { name: 'Leg day', focus: 'Quads · hamstrings · calves', exercises: ['Squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Calf raise'] },
  'w-full': { name: 'Full-body foundation', focus: 'Strength foundations for beginners', exercises: ['Squat', 'Bench press', 'Barbell row', 'Shoulder press', 'Plank'] },
};

function localizeWorkout(workout: Workout): Workout {
  if (lang !== 'en' || !workout.is_preset) return workout;
  const localized = ENGLISH_PRESET_WORKOUTS[String(workout.id)];
  if (!localized) return workout;
  return {
    ...workout,
    name: localized.name,
    focus: localized.focus,
    exercises: workout.exercises.map((exercise, index) => ({ ...exercise, name: localized.exercises[index] ?? exercise.name })),
  };
}

// ── Gerichte ─────────────────────────────────────────────────────────
const NUTRIENT_KEYS: (keyof Nutrition)[] = ['kcal', 'prot', 'carb', 'fat', 'sug'];

const rounded = (value: number): number => Math.round(value * 10) / 10;

export function estimateCaloriesFromMacros(input: Pick<Nutrition, 'prot' | 'carb' | 'fat' | 'sug'>): number {
  // Sugar is already part of total carbohydrate and must not be counted twice.
  return Math.round(input.prot * 4 + input.carb * 4 + input.fat * 9);
}

export function normalizeNutrition(input: NutritionInput): Nutrition {
  const value = (key: keyof Nutrition) => {
    const parsed = Number(input[key] ?? 0);
    return Number.isFinite(parsed) ? clampNutritionNumber(key, rounded(parsed)) : 0;
  };
  const normalized: Nutrition = {
    kcal: value('kcal'),
    prot: value('prot'),
    carb: value('carb'),
    fat: value('fat'),
    sug: value('sug'),
  };
  if (normalized.kcal === 0) normalized.kcal = clampNutritionNumber('kcal', estimateCaloriesFromMacros(normalized));
  return normalized;
}

export function validateNutrition(input: NutritionInput): NutritionIssue[] {
  const issues: NutritionIssue[] = [];
  for (const field of NUTRIENT_KEYS) {
    const value = Number(input[field] ?? 0);
    if (!Number.isFinite(value)) issues.push({ field, code: 'not-finite' });
    else if (value < 0) issues.push({ field, code: 'negative' });
    else if (value > NUTRITION_LIMITS[field]) issues.push({ field, code: 'above-maximum' });
  }
  const carb = Number(input.carb ?? 0);
  const sugar = Number(input.sug ?? 0);
  if (Number.isFinite(carb) && Number.isFinite(sugar) && sugar > carb) {
    issues.push({ field: 'sug', code: 'sugar-exceeds-carbs' });
  }
  if (normalizeNutrition(input).kcal <= 0) issues.push({ field: 'kcal', code: 'zero-calories' });
  return issues;
}

export function nutritionFromDish(dish: Dish): Nutrition {
  return normalizeNutrition(dish);
}

function localDishes(): Dish[] {
  const userDishes = [...(S.get<Dish[]>('fuel_user_dishes') || [])].reverse();
  const dishes = [...userDishes, ...CURATED_DISHES, ...PRESET_DISHES];
  return [...new Map(dishes.map(dish => [String(dish.id), dish])).values()];
}

export async function fetchDishes(category?: string, equipment?: string): Promise<Dish[]> {
  let list = localDishes();
  if (category) list = list.filter(d => d.category === category);
  if (equipment) list = list.filter(d => d.equipment.includes(equipment));
  return list;
}

export async function createDish(input: Omit<Dish, 'id' | 'is_preset'>): Promise<Dish> {
  const issues = validateNutrition(input);
  if (issues.length) throw new Error(`Invalid nutrition: ${issues.map(issue => issue.code).join(', ')}`);
  const nutrition = normalizeNutrition(input);
  const normalizedInput = { ...input, ...nutrition };
  const local: Dish = { ...normalizedInput, id: 'u-' + Date.now(), is_preset: false };
  S.set('fuel_user_dishes', [...(S.get<Dish[]>('fuel_user_dishes') || []), local]);
  return local;
}

// ── Trainingspläne ───────────────────────────────────────────────────
function localWorkouts(): Workout[] { return [...PRESET_WORKOUTS, ...(S.get<Workout[]>('train_user_plans') || [])]; }

export async function fetchWorkouts(): Promise<Workout[]> {
  return localWorkouts().map(localizeWorkout);
}

export async function createWorkout(input: Omit<Workout, 'id' | 'is_preset'>): Promise<Workout> {
  const local: Workout = { ...input, id: 'u-' + Date.now(), is_preset: false };
  S.set('train_user_plans', [...(S.get<Workout[]>('train_user_plans') || []), local]);
  return local;
}

const DRAFTS_KEY = 'train_session_drafts';
const SESSIONS_KEY = 'train_sessions';

function workoutKey(workout: Workout): string { return String(workout.id); }

function dateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function newSessionId(workout: Workout, now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `session-${workoutKey(workout)}-${now}-${random}`;
}

export function normalizeCompletedSets(workout: Workout, input: CompletedSetMap = {}): CompletedSetMap {
  return Object.fromEntries(workout.exercises.map((exercise, index) => {
    const saved = Array.isArray(input[index]) ? input[index] : [];
    const setCount = Math.max(0, Math.floor(Number(exercise.sets) || 0));
    return [index, Array.from({ length: setCount }, (_, setIndex) => saved[setIndex] === true)];
  }));
}

function workoutSetCounts(workout: Workout, completedSets: CompletedSetMap): { total: number; completed: number } {
  const normalized = normalizeCompletedSets(workout, completedSets);
  const total = workout.exercises.reduce((sum, exercise) => sum + Math.max(0, Math.floor(Number(exercise.sets) || 0)), 0);
  const completed = Object.values(normalized).reduce((sum, sets) => sum + sets.filter(Boolean).length, 0);
  return { total, completed };
}

export function loadWorkoutDraft(workout: Workout): WorkoutDraft {
  const drafts = S.get<Record<string, WorkoutDraft>>(DRAFTS_KEY) || {};
  const key = workoutKey(workout);
  const saved = drafts[key];
  const now = Date.now();
  const draft: WorkoutDraft = saved
    ? { ...saved, workoutId: key, completedSets: normalizeCompletedSets(workout, saved.completedSets) }
    : {
      sessionId: newSessionId(workout, now),
      workoutId: key,
      startedAt: now,
      updatedAt: now,
      completedSets: normalizeCompletedSets(workout),
    };
  drafts[key] = draft;
  S.set(DRAFTS_KEY, drafts);
  return draft;
}

export function saveWorkoutProgress(
  workout: Workout,
  sessionId: string,
  completedSets: CompletedSetMap,
  startedAt = Date.now(),
): WorkoutDraft {
  const drafts = S.get<Record<string, WorkoutDraft>>(DRAFTS_KEY) || {};
  const key = workoutKey(workout);
  const draft: WorkoutDraft = {
    sessionId,
    workoutId: key,
    startedAt,
    updatedAt: Date.now(),
    completedSets: normalizeCompletedSets(workout, completedSets),
  };
  drafts[key] = draft;
  S.set(DRAFTS_KEY, drafts);
  return draft;
}

export function getWorkoutSessions(): WorkoutSession[] {
  return (S.get<WorkoutSession[]>(SESSIONS_KEY) || [])
    .filter(session => session && typeof session.id === 'string')
    .sort((a, b) => b.completedAt - a.completedAt);
}

function clearWorkoutDraft(workout: Workout, sessionId: string): void {
  const drafts = S.get<Record<string, WorkoutDraft>>(DRAFTS_KEY) || {};
  const key = workoutKey(workout);
  if (drafts[key]?.sessionId === sessionId) {
    delete drafts[key];
    S.set(DRAFTS_KEY, drafts);
  }
}

export async function completeWorkoutSession(workout: Workout, draft: WorkoutDraft): Promise<WorkoutCompletion> {
  const completedSets = normalizeCompletedSets(workout, draft.completedSets);
  const counts = workoutSetCounts(workout, completedSets);
  if (counts.total <= 0) return { status: 'invalid', buff: null };
  if (counts.completed < counts.total) return { status: 'incomplete', buff: null };

  const sessions = getWorkoutSessions();
  if (sessions.some(session => session.id === draft.sessionId)) return { status: 'already-completed', buff: null };
  const buff = await logWorkout({
    name: workout.name,
    kind: workout.kind,
    sessionId: draft.sessionId,
    completedSets: counts.completed,
    totalSets: counts.total,
  });
  if (!buff) return { status: 'already-completed', buff: null };

  const session: WorkoutSession = {
    id: draft.sessionId,
    workoutId: workoutKey(workout),
    name: workout.name,
    kind: workout.kind,
    startedAt: draft.startedAt,
    completedAt: Date.now(),
    completedSets: counts.completed,
    totalSets: counts.total,
    setState: completedSets,
  };
  S.set(SESSIONS_KEY, [session, ...sessions].slice(0, 100));
  clearWorkoutDraft(workout, draft.sessionId);
  return { status: 'completed', buff, session };
}

export function createDailyWorkout(
  input: Omit<Workout, 'id' | 'is_preset' | 'source'>,
  now = new Date(),
): Workout {
  return {
    ...input,
    id: `daily-${dateStamp(now)}-${now.getTime()}`,
    exercises: input.exercises.map(exercise => ({ ...exercise })),
    is_preset: false,
    source: 'daily',
  };
}

// ── Local completion receipts (legacy Buff shape kept for compatibility) ──
const BUFF_TTL = 6 * 3600 * 1000;

function computeMealBuff(prot: number, kcal: number): Buff {
  const exp = Date.now() + BUFF_TTL;
  return {
    label: 'Mahlzeit protokolliert',
    icon: '◇',
    desc: `${Math.round(prot)} g Protein · ${Math.round(kcal)} kcal erfasst`,
    boosts: {},
    expires_at: exp,
    source: 'meal',
  };
}
function computeWorkoutBuff(kind: string): Buff {
  const exp = Date.now() + BUFF_TTL;
  return {
    label: 'Training protokolliert',
    icon: '◇',
    desc: `${kind || 'Training'} · vollständig abgehakte Sätze gespeichert`,
    boosts: {},
    expires_at: exp,
    source: 'workout',
  };
}

function pushLocalBuff(b: Buff): void {
  const list = (S.get<Buff[]>('stat_buffs') || []).filter(x => x.expires_at > Date.now());
  list.push(b);
  S.set('stat_buffs', list);
}

export function getActiveBuffs(): Buff[] {
  const list = (S.get<Buff[]>('stat_buffs') || []).filter(b => b.expires_at > Date.now());
  S.set('stat_buffs', list);   // gepruned zurückschreiben
  return list.sort((a, b) => b.expires_at - a.expires_at);
}

export function buffTotals(buffs: Buff[] = getActiveBuffs()): Record<string, number> {
  const tot: Record<string, number> = {};
  for (const b of buffs) for (const [k, v] of Object.entries(b.boosts || {})) tot[k] = (tot[k] || 0) + v;
  return tot;
}

export async function logMeal(d: { name: string } & NutritionInput): Promise<Buff> {
  const issues = validateNutrition(d);
  if (issues.length) throw new Error(`Invalid nutrition: ${issues.map(issue => issue.code).join(', ')}`);
  const nutrition = normalizeNutrition(d);
  const now = Date.now();
  const entry: FoodEntry = { id: now, name: d.name, ts: now, ...nutrition };
  saveFoodLog([...getFoodLog(), entry]);

  const buff = computeMealBuff(nutrition.prot, nutrition.kcal);
  pushLocalBuff(buff);   // sofort lokal → Dashboard reagiert direkt
  return buff;
}

export async function logWorkout(w: WorkoutLogInput): Promise<Buff | null> {
  if (w.totalSets != null || w.completedSets != null) {
    const total = Number(w.totalSets);
    const completed = Number(w.completedSets);
    if (!Number.isFinite(total) || !Number.isFinite(completed) || total <= 0 || completed < total) return null;
  }

  if (w.sessionId) {
    const rewarded = S.get<Record<string, number>>('train_rewarded_sessions') || {};
    if (rewarded[w.sessionId]) return null;
    rewarded[w.sessionId] = Date.now();
    const recent = Object.entries(rewarded)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200);
    S.set('train_rewarded_sessions', Object.fromEntries(recent));
  }

  const buff = computeWorkoutBuff(w.kind);
  pushLocalBuff(buff);
  return buff;
}

export function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Rezept-Sharing → Community-Chat ──────────────────────────────────
export async function shareRecipeToChat(_dish: Dish, _room = 'global'): Promise<boolean> {
  return false;
}

// ── AI PROTOCOL BUILDER — dynamischer Trainingsplan-Generator ────────
export type PlanLevel = 'beginner' | 'advanced' | 'elite';
export type PlanGoal = 'muscle' | 'strength' | 'endurance' | 'definition';
export type PlanFocus = 'push' | 'pull' | 'legs' | 'fullbody';
export interface PlanParams { level: PlanLevel; goal: PlanGoal; focus: PlanFocus; days: number; }

const EX_POOL: Record<PlanFocus, string[]> = {
  push: ['Bankdrücken', 'Schrägbankdrücken', 'Schulterdrücken', 'Butterfly', 'Seitheben', 'Trizeps-Pushdown', 'Dips'],
  pull: ['Klimmzüge', 'Langhantelrudern', 'Latzug', 'Kreuzheben', 'Face Pulls', 'Bizeps-Curls', 'Hammer-Curls'],
  legs: ['Kniebeugen', 'Beinpresse', 'Rumänisches Kreuzheben', 'Ausfallschritte', 'Beinbeuger', 'Beinstrecker', 'Wadenheben'],
  fullbody: ['Kniebeugen', 'Bankdrücken', 'Langhantelrudern', 'Schulterdrücken', 'Kreuzheben', 'Ausfallschritte', 'Plank'],
};
const GOAL_SCHEME: Record<PlanGoal, { reps: string; rest: number; setBias: number; de: string }> = {
  strength:   { reps: '4-6',   rest: 150, setBias: 1,  de: 'Kraftaufbau' },
  muscle:     { reps: '8-12',  rest: 90,  setBias: 0,  de: 'Muskelaufbau' },
  definition: { reps: '12-15', rest: 60,  setBias: 0,  de: 'Definition' },
  endurance:  { reps: '15-20', rest: 45,  setBias: -1, de: 'Ausdauer' },
};
const LEVEL_META: Record<PlanLevel, { count: number; sets: number; de: string }> = {
  beginner: { count: 4, sets: 3, de: 'Anfänger' },
  advanced: { count: 5, sets: 4, de: 'Fortgeschritten' },
  elite:    { count: 6, sets: 4, de: 'Elite' },
};
const FOCUS_META: Record<PlanFocus, { icon: string; de: string; muscles: string }> = {
  push:     { icon: '◇', de: 'Push', muscles: 'Brust · Schultern · Trizeps' },
  pull:     { icon: '◇', de: 'Pull', muscles: 'Rücken · Bizeps' },
  legs:     { icon: '◇', de: 'Legs', muscles: 'Quads · Hamstrings · Waden' },
  fullbody: { icon: '◇', de: 'Ganzkörper', muscles: 'Kraft-Grundlagen' },
};

export function generatePlan(p: PlanParams): Omit<Workout, 'id' | 'is_preset'> {
  const lvl = LEVEL_META[p.level] || LEVEL_META.beginner;
  const gs = GOAL_SCHEME[p.goal] || GOAL_SCHEME.muscle;
  const fm = FOCUS_META[p.focus] || FOCUS_META.fullbody;
  const sets = Math.max(2, Math.min(6, lvl.sets + gs.setBias));
  // mehr Tage/Woche → etwas weniger Volumen pro Einheit (sinnvolle Erholung)
  const count = Math.max(3, Math.min(EX_POOL[p.focus].length, lvl.count - (p.days >= 5 ? 1 : 0)));
  const names = EX_POOL[p.focus].slice(0, count);
  const exercises: Exercise[] = names.map((name, i) => ({
    name,
    // Grundübung (erste) bei Kraft schwerer & wenige Reps, Isolation etwas höher
    sets: i === 0 && p.goal === 'strength' ? sets + 1 : sets,
    reps: name === 'Plank' ? '45s' : i >= count - 1 && p.goal !== 'strength' ? '12-15' : gs.reps,
    weight: '—',
    rest: name === 'Plank' ? 45 : i === 0 ? gs.rest + 30 : gs.rest,
  }));
  return {
    name: `Local · ${fm.de} · ${gs.de}`,
    kind: p.focus,
    focus: `${fm.muscles} · ${lvl.de} · ${p.days}×/Woche`,
    icon: fm.icon,
    exercises,
  };
}
