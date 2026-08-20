import type { ExerciseMuscleTarget, MuscleId } from './muscleLoad';

export type PlanMode = 'own' | 'inspiration' | 'guided';
export type InspirationProfileId = 'toji' | 'goku' | 'tanjiro' | 'kaneki' | 'sanji' | 'baki' | 'mikasa';
export type PlanDifficulty = 'light' | 'medium' | 'hard';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type EquipmentOption = 'bodyweight' | 'dumbbells' | 'resistance_bands' | 'full_gym';
export type DietPreference = 'flexible' | 'omnivore' | 'vegetarian' | 'vegan';
export type TrainingGoal = 'general_fitness' | 'build_muscle' | 'get_stronger' | 'fat_loss';
export type PlanLanguage = 'de' | 'en';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';

export interface NutritionCalculationContext {
  gender?: 'm' | 'f' | 'x';
  activityLevel?: ActivityLevel;
  activityContext?: string;
}

export interface InspirationProfile {
  id: InspirationProfileId;
  name: string;
  tagline: string;
  description: string;
  emphasis: string;
}

export const INSPIRATION_PROFILES: InspirationProfile[] = [
  {
    id: 'toji',
    name: 'Toji',
    tagline: 'Direct strength',
    description: 'A text-only strength archetype built around simple compound movement patterns and generous recovery.',
    emphasis: 'strength and power',
  },
  {
    id: 'goku',
    name: 'Goku',
    tagline: 'Athletic variety',
    description: 'A text-only conditioning archetype that alternates full-body strength, movement quality, and easy intervals.',
    emphasis: 'conditioning and athletic variety',
  },
  {
    id: 'tanjiro',
    name: 'Tanjiro',
    tagline: 'Steady balance',
    description: 'A text-only balanced archetype that prioritizes repeatable practice, mobility, and controlled effort.',
    emphasis: 'balanced strength, conditioning, and mobility',
  },
  {
    id: 'kaneki',
    name: 'Ken Kaneki',
    tagline: 'Adaptive control',
    description: 'A pull-and-core archetype built around controlled tension, grip, movement quality, and repeatable conditioning.',
    emphasis: 'pulling strength, trunk control, and adaptation',
  },
  {
    id: 'sanji',
    name: 'Sanji',
    tagline: 'Leg precision',
    description: 'A lower-body archetype built around unilateral strength, balance, footwork, calf capacity, and athletic conditioning.',
    emphasis: 'leg power, balance, and footwork',
  },
  {
    id: 'baki',
    name: 'Baki Hanma',
    tagline: 'Total-body combat strength',
    description: 'A full-body archetype that combines controlled strength, carries, mobility, and short conditioning blocks.',
    emphasis: 'full-body strength, bracing, and mobility',
  },
  {
    id: 'mikasa',
    name: 'Mikasa Ackerman',
    tagline: 'Tactical endurance',
    description: 'A pull, carry, and core archetype built around efficient movement, unilateral control, and repeatable work capacity.',
    emphasis: 'pulling strength, core stability, and endurance',
  },
];

export const PLAN_MODE_OPTIONS: Array<{ id: PlanMode; label: string; description: string }> = [
  { id: 'own', label: 'Own Path', description: 'Use only the goals and constraints you choose.' },
  { id: 'inspiration', label: 'Inspiration Profiles', description: 'Borrow a training emphasis from a text-only character profile.' },
  { id: 'guided', label: 'Guided plan', description: 'Build an on-device plan from transparent rules. No remote AI is contacted.' },
];

export const EQUIPMENT_OPTIONS: Array<{ id: EquipmentOption; label: string }> = [
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'resistance_bands', label: 'Resistance bands' },
  { id: 'full_gym', label: 'Full gym' },
];

export interface PlanInput {
  mode: PlanMode;
  inspirationProfile?: InspirationProfileId;
  displayName: string;
  age: number;
  heightCm: number;
  weightKg: number;
  experience: ExperienceLevel;
  daysPerWeek: number;
  equipment: EquipmentOption[];
  diet: DietPreference;
  goal: TrainingGoal;
  difficulty: PlanDifficulty;
}

export type PlanInputField = keyof PlanInput;

export interface PlanValidationResult {
  valid: boolean;
  errors: Partial<Record<PlanInputField, string>>;
}

export interface PlanExercise {
  id: string;
  name: string;
  movement: MovementPattern;
  equipment: EquipmentOption;
  sets: number;
  reps: string;
  effort: string;
  muscleTargets?: ExerciseMuscleTarget[];
}

export interface PlanSession {
  day: number;
  title: string;
  focus: string;
  durationMinutes: number;
  warmup: string;
  exercises: PlanExercise[];
  cooldown: string;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  maintenanceCalories?: number;
  goalAdjustmentCalories?: number;
  goalAdjustmentPercent?: number;
  proteinPerKg?: number;
  activityLevel?: ActivityLevel;
  activityFactor?: number;
  method: 'neutral-mifflin-estimate-v1' | 'mifflin-st-jeor-profile-v2' | 'openai-estimate-v1';
  note: string;
}

export interface InitialPlan {
  schemaVersion: 1;
  generator: 'local-rules-v1' | 'openai-plan-v1';
  createdAt: string | null;
  sourceLabel: string;
  emphasis: string;
  difficulty: PlanDifficulty;
  experience: ExperienceLevel;
  daysPerWeek: number;
  sessions: PlanSession[];
  nutritionTargets: NutritionTargets;
  recoveryGuidance: string;
  foodGuidance: string;
  safetyNotes: string[];
}

const PLAN_MODES = new Set<PlanMode>(['own', 'inspiration', 'guided']);
const PROFILE_IDS = new Set<InspirationProfileId>(INSPIRATION_PROFILES.map(profile => profile.id));
const DIFFICULTIES = new Set<PlanDifficulty>(['light', 'medium', 'hard']);
const EXPERIENCE = new Set<ExperienceLevel>(['beginner', 'intermediate', 'advanced']);
const EQUIPMENT = new Set<EquipmentOption>(['bodyweight', 'dumbbells', 'resistance_bands', 'full_gym']);
const DIETS = new Set<DietPreference>(['flexible', 'omnivore', 'vegetarian', 'vegan']);
const GOALS = new Set<TrainingGoal>(['general_fitness', 'build_muscle', 'get_stronger', 'fat_loss']);

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.35,
  moderate: 1.5,
  high: 1.65,
  very_high: 1.8,
};

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

export function resolveActivityLevel(
  explicit: ActivityLevel | undefined,
  context = '',
  daysPerWeek = 3,
): ActivityLevel {
  if (explicit && explicit in ACTIVITY_FACTORS) return explicit;
  const value = context.toLowerCase();
  if (/very[ -]?active|athlete|two workouts|15k|15000|schwer körperlich|leistungssport|zweimal täglich/.test(value)) return 'very_high';
  if (/high|active|physical|manual|10k|10000|viel beweg|körperlich|fahrrad|cycling/.test(value)) return 'high';
  if (/light|walk|6k|6000|stehend|spazier|leicht aktiv/.test(value)) return 'light';
  if (/low|sedentary|seated|desk|office|wenig beweg|sitz|büro/.test(value)) return 'sedentary';
  if (daysPerWeek >= 5) return 'high';
  if (daysPerWeek <= 2) return 'light';
  return 'moderate';
}

function goalAdjustmentPercent(input: PlanInput, bmi: number): number {
  if (input.age < 18) return 0;
  if (input.goal === 'build_muscle') {
    return input.experience === 'advanced' ? .05 : input.experience === 'intermediate' ? .06 : .08;
  }
  if (input.goal === 'get_stronger') return .03;
  if (input.goal !== 'fat_loss') return 0;
  if (bmi < 18.5) return 0;
  if (bmi < 22) return -.1;
  if (bmi >= 30) return -.18;
  return -.15;
}

export function calculateNutritionTargets(
  input: PlanInput,
  language: PlanLanguage = 'en',
  context: NutritionCalculationContext = {},
): NutritionTargets {
  const validation = validatePlanInput(input);
  if (!validation.valid) throw new Error(`Invalid nutrition input: ${Object.keys(validation.errors).join(', ')}`);

  // Mifflin-St Jeor remains an estimate. The neutral option uses the midpoint
  // between the published male and female constants instead of guessing sex.
  const sexConstant = context.gender === 'f' ? -161 : context.gender === 'm' ? 5 : -78;
  const restingEstimate = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + sexConstant;
  const activityLevel = resolveActivityLevel(context.activityLevel, context.activityContext, input.daysPerWeek);
  const trainingAdjustment = clamp((input.daysPerWeek - 3) * .025, -.025, .075);
  const activityFactor = clamp(ACTIVITY_FACTORS[activityLevel] + trainingAdjustment, 1.2, 1.9);
  const maintenanceCalories = clamp(roundTo(restingEstimate * activityFactor, 10), 1_200, 4_500);
  const bmi = input.weightKg / Math.pow(input.heightCm / 100, 2);
  const requestedAdjustment = goalAdjustmentPercent(input, bmi);
  const plannedCalories = clamp(
    roundTo(maintenanceCalories * (1 + requestedAdjustment), 10),
    Math.max(1_200, roundTo(restingEstimate * 1.1, 10)),
    4_500,
  );
  const proteinFactor: Record<TrainingGoal, number> = {
    general_fitness: 1.6,
    build_muscle: 1.8,
    get_stronger: 1.7,
    fat_loss: 2,
  };
  const effectiveProteinFactor = input.age < 18
    ? Math.min(1.6, proteinFactor[input.goal])
    : proteinFactor[input.goal];
  const protein = Math.min(240, roundTo(input.weightKg * effectiveProteinFactor, 5));
  const fatEnergyShare = input.goal === 'fat_loss' ? .25 : .27;
  const fat = Math.min(140, Math.max(40, roundTo(Math.max(input.weightKg * .7, plannedCalories * fatEnergyShare / 9), 5)));
  const carbs = Math.max(80, roundTo((plannedCalories - protein * 4 - fat * 9) / 4, 5));
  const calories = protein * 4 + carbs * 4 + fat * 9;
  const actualAdjustmentCalories = calories - maintenanceCalories;
  const actualAdjustmentPercent = maintenanceCalories > 0 ? actualAdjustmentCalories / maintenanceCalories : 0;

  const adjustmentCopy = actualAdjustmentCalories > 0
    ? language === 'de' ? `kontrollierter Überschuss von ${actualAdjustmentCalories} kcal/Tag` : `controlled surplus of ${actualAdjustmentCalories} kcal/day`
    : actualAdjustmentCalories < 0
      ? language === 'de' ? `moderates Defizit von ${Math.abs(actualAdjustmentCalories)} kcal/Tag` : `moderate deficit of ${Math.abs(actualAdjustmentCalories)} kcal/day`
      : language === 'de' ? 'Erhaltungsniveau ohne geplanten Überschuss oder Defizit' : 'maintenance level with no planned surplus or deficit';

  return {
    calories,
    protein,
    carbs,
    fat,
    // This is a free-sugar planning ceiling. Product databases often expose
    // total sugar, so the UI explains that the two values are not identical.
    sugar: Math.min(carbs, roundTo(calories * .1 / 4, 5)),
    maintenanceCalories,
    goalAdjustmentCalories: actualAdjustmentCalories,
    goalAdjustmentPercent: Math.round(actualAdjustmentPercent * 1_000) / 10,
    proteinPerKg: Math.round(protein / input.weightKg * 10) / 10,
    activityLevel,
    activityFactor: Math.round(activityFactor * 1_000) / 1_000,
    method: 'mifflin-st-jeor-profile-v2',
    note: language === 'de'
      ? `Startschätzung nach Mifflin-St. Jeor mit Gewicht, Größe, Alter, Körpermodell, Aktivität, ${input.daysPerWeek} Trainingstagen und Ziel: ${adjustmentCopy}. Nach 2–3 Wochen anhand des echten Gewichtsverlaufs prüfen.`
      : `Mifflin-St Jeor starting estimate using weight, height, age, body model, activity, ${input.daysPerWeek} training days, and goal: ${adjustmentCopy}. Review against the real 2–3 week weight trend.`,
  };
}

export function validatePlanInput(input: PlanInput): PlanValidationResult {
  const errors: PlanValidationResult['errors'] = {};
  if (!PLAN_MODES.has(input.mode)) errors.mode = 'Choose a plan mode.';
  if (input.mode === 'inspiration' && (!input.inspirationProfile || !PROFILE_IDS.has(input.inspirationProfile))) {
    errors.inspirationProfile = 'Choose an inspiration profile.';
  }
  if (!input.displayName?.trim() || input.displayName.trim().length > 40) {
    errors.displayName = 'Enter a name between 1 and 40 characters.';
  }
  if (!Number.isFinite(input.age) || input.age < 16 || input.age > 85) {
    errors.age = 'Age must be between 16 and 85.';
  }
  if (!Number.isFinite(input.heightCm) || input.heightCm < 120 || input.heightCm > 230) {
    errors.heightCm = 'Height must be between 120 and 230 cm.';
  }
  if (!Number.isFinite(input.weightKg) || input.weightKg < 35 || input.weightKg > 250) {
    errors.weightKg = 'Weight must be between 35 and 250 kg.';
  }
  if (!EXPERIENCE.has(input.experience)) errors.experience = 'Choose your experience level.';
  if (!Number.isInteger(input.daysPerWeek) || input.daysPerWeek < 2 || input.daysPerWeek > 6) {
    errors.daysPerWeek = 'Choose 2 to 6 training days.';
  }
  if (!Array.isArray(input.equipment) || input.equipment.length === 0 || input.equipment.some((item) => !EQUIPMENT.has(item))) {
    errors.equipment = 'Choose at least one available equipment option.';
  }
  if (!DIETS.has(input.diet)) errors.diet = 'Choose a diet preference.';
  if (!GOALS.has(input.goal)) errors.goal = 'Choose a training goal.';
  if (!DIFFICULTIES.has(input.difficulty)) errors.difficulty = 'Choose a plan difficulty.';
  return { valid: Object.keys(errors).length === 0, errors };
}

type MovementPattern = 'squat' | 'hinge' | 'push' | 'pull' | 'core' | 'carry' | 'conditioning' | 'mobility';

interface ExerciseTemplate {
  id: string;
  name: string;
  movement: MovementPattern;
  equipment: EquipmentOption;
  character?: InspirationProfileId;
  muscleTargets?: ExerciseMuscleTarget[];
}

const muscleTargets = (
  ...items: Array<[MuscleId, ExerciseMuscleTarget['role'], number]>
): ExerciseMuscleTarget[] => items.map(([muscleId, role, share]) => ({ muscleId, role, share }));

const EXERCISES: ExerciseTemplate[] = [
  { id: 'chair-squat', name: 'Chair squat', movement: 'squat', equipment: 'bodyweight' },
  { id: 'split-squat', name: 'Supported split squat', movement: 'squat', equipment: 'bodyweight' },
  { id: 'glute-bridge', name: 'Glute bridge', movement: 'hinge', equipment: 'bodyweight' },
  { id: 'incline-pushup', name: 'Incline push-up', movement: 'push', equipment: 'bodyweight' },
  { id: 'wall-slide', name: 'Wall slide', movement: 'pull', equipment: 'bodyweight' },
  { id: 'dead-bug', name: 'Dead bug', movement: 'core', equipment: 'bodyweight' },
  { id: 'side-plank', name: 'Side plank', movement: 'core', equipment: 'bodyweight' },
  { id: 'march', name: 'Easy marching intervals', movement: 'conditioning', equipment: 'bodyweight' },
  { id: 'mobility-flow', name: 'Hip and shoulder mobility flow', movement: 'mobility', equipment: 'bodyweight' },
  { id: 'step-up', name: 'Low step-up', movement: 'conditioning', equipment: 'bodyweight' },
  { id: 'db-goblet-squat', name: 'Dumbbell goblet squat', movement: 'squat', equipment: 'dumbbells' },
  { id: 'db-rdl', name: 'Dumbbell Romanian deadlift', movement: 'hinge', equipment: 'dumbbells' },
  { id: 'db-floor-press', name: 'Dumbbell floor press', movement: 'push', equipment: 'dumbbells' },
  { id: 'db-row', name: 'Supported dumbbell row', movement: 'pull', equipment: 'dumbbells' },
  { id: 'db-carry', name: 'Dumbbell suitcase carry', movement: 'carry', equipment: 'dumbbells' },
  { id: 'band-squat', name: 'Band squat', movement: 'squat', equipment: 'resistance_bands' },
  { id: 'band-hinge', name: 'Band hip hinge', movement: 'hinge', equipment: 'resistance_bands' },
  { id: 'band-press', name: 'Band chest press', movement: 'push', equipment: 'resistance_bands' },
  { id: 'band-row', name: 'Band row', movement: 'pull', equipment: 'resistance_bands' },
  { id: 'gym-leg-press', name: 'Leg press', movement: 'squat', equipment: 'full_gym' },
  { id: 'gym-cable-pull', name: 'Cable pull-through', movement: 'hinge', equipment: 'full_gym' },
  { id: 'gym-chest-press', name: 'Machine chest press', movement: 'push', equipment: 'full_gym' },
  { id: 'gym-pulldown', name: 'Lat pulldown', movement: 'pull', equipment: 'full_gym' },
  { id: 'gym-bike', name: 'Easy stationary bike intervals', movement: 'conditioning', equipment: 'full_gym' },
  { id: 'toji-split-squat', name: 'Explosive supported split squat', movement: 'squat', equipment: 'bodyweight', character: 'toji' },
  { id: 'toji-tempo-pushup', name: 'Power tempo push-up', movement: 'push', equipment: 'bodyweight', character: 'toji' },
  { id: 'toji-broad-jump', name: 'Controlled broad-jump practice', movement: 'conditioning', equipment: 'bodyweight', character: 'toji' },
  { id: 'toji-plank', name: 'Hard-style plank', movement: 'core', equipment: 'bodyweight', character: 'toji' },
  { id: 'toji-db-rdl', name: 'Athletic dumbbell Romanian deadlift', movement: 'hinge', equipment: 'dumbbells', character: 'toji' },
  { id: 'toji-db-carry', name: 'Heavy suitcase carry', movement: 'carry', equipment: 'dumbbells', character: 'toji' },
  { id: 'toji-band-row', name: 'Explosive band row', movement: 'pull', equipment: 'resistance_bands', character: 'toji' },
  { id: 'toji-cable-chop', name: 'Cable rotational chop', movement: 'core', equipment: 'full_gym', character: 'toji' },
  { id: 'goku-volume-squat', name: 'High-volume bodyweight squat', movement: 'squat', equipment: 'bodyweight', character: 'goku' },
  { id: 'goku-volume-pushup', name: 'High-volume push-up', movement: 'push', equipment: 'bodyweight', character: 'goku' },
  { id: 'goku-burpee', name: 'Repeatable burpee intervals', movement: 'conditioning', equipment: 'bodyweight', character: 'goku' },
  { id: 'goku-hollow', name: 'Hollow-body hold', movement: 'core', equipment: 'bodyweight', character: 'goku' },
  { id: 'goku-db-thruster', name: 'Dumbbell thruster', movement: 'push', equipment: 'dumbbells', character: 'goku' },
  { id: 'goku-db-row', name: 'Volume dumbbell row', movement: 'pull', equipment: 'dumbbells', character: 'goku' },
  { id: 'goku-band-squat', name: 'Band-resisted squat', movement: 'squat', equipment: 'resistance_bands', character: 'goku' },
  { id: 'goku-leg-press', name: 'Volume leg press', movement: 'squat', equipment: 'full_gym', character: 'goku' },
  { id: 'tanjiro-flow', name: 'Controlled hip and shoulder flow', movement: 'mobility', equipment: 'bodyweight', character: 'tanjiro' },
  { id: 'tanjiro-single-leg', name: 'Balanced split-squat practice', movement: 'squat', equipment: 'bodyweight', character: 'tanjiro' },
  { id: 'tanjiro-pushup', name: 'Controlled incline push-up', movement: 'push', equipment: 'bodyweight', character: 'tanjiro' },
  { id: 'tanjiro-side-plank', name: 'Breathing side plank', movement: 'core', equipment: 'bodyweight', character: 'tanjiro' },
  { id: 'tanjiro-db-lunge', name: 'Controlled dumbbell reverse lunge', movement: 'squat', equipment: 'dumbbells', character: 'tanjiro' },
  { id: 'tanjiro-db-row', name: 'Paused dumbbell row', movement: 'pull', equipment: 'dumbbells', character: 'tanjiro' },
  { id: 'tanjiro-pallof', name: 'Band Pallof press', movement: 'core', equipment: 'resistance_bands', character: 'tanjiro' },
  { id: 'tanjiro-bike', name: 'Steady bike breathing intervals', movement: 'conditioning', equipment: 'full_gym', character: 'tanjiro' },
  { id: 'kaneki-lat-sweep', name: 'Prone lat sweep', movement: 'pull', equipment: 'bodyweight', character: 'kaneki', muscleTargets: muscleTargets(['back', 'primary', .62], ['shoulders', 'secondary', .23], ['biceps', 'secondary', .15]) },
  { id: 'kaneki-crawl', name: 'Controlled bear crawl', movement: 'conditioning', equipment: 'bodyweight', character: 'kaneki', muscleTargets: muscleTargets(['core', 'primary', .4], ['shoulders', 'secondary', .3], ['quads', 'secondary', .2], ['calves', 'secondary', .1]) },
  { id: 'kaneki-hollow-twist', name: 'Hollow-body twist', movement: 'core', equipment: 'bodyweight', character: 'kaneki', muscleTargets: muscleTargets(['core', 'primary', .75], ['glutes', 'secondary', .15], ['shoulders', 'secondary', .1]) },
  { id: 'kaneki-split-squat', name: 'Slow-eccentric split squat', movement: 'squat', equipment: 'bodyweight', character: 'kaneki', muscleTargets: muscleTargets(['quads', 'primary', .55], ['glutes', 'secondary', .25], ['core', 'secondary', .2]) },
  { id: 'kaneki-renegade-row', name: 'Controlled renegade row', movement: 'pull', equipment: 'dumbbells', character: 'kaneki', muscleTargets: muscleTargets(['back', 'primary', .5], ['core', 'secondary', .3], ['biceps', 'secondary', .2]) },
  { id: 'kaneki-db-carry', name: 'Offset dumbbell carry', movement: 'carry', equipment: 'dumbbells', character: 'kaneki', muscleTargets: muscleTargets(['core', 'primary', .45], ['shoulders', 'secondary', .25], ['back', 'secondary', .2], ['biceps', 'secondary', .1]) },
  { id: 'kaneki-band-row', name: 'High band row', movement: 'pull', equipment: 'resistance_bands', character: 'kaneki', muscleTargets: muscleTargets(['back', 'primary', .55], ['shoulders', 'secondary', .3], ['biceps', 'secondary', .15]) },
  { id: 'kaneki-cable-row', name: 'Paused cable row', movement: 'pull', equipment: 'full_gym', character: 'kaneki', muscleTargets: muscleTargets(['back', 'primary', .7], ['biceps', 'secondary', .2], ['core', 'secondary', .1]) },
  { id: 'sanji-skater-squat', name: 'Supported skater squat', movement: 'squat', equipment: 'bodyweight', character: 'sanji', muscleTargets: muscleTargets(['quads', 'primary', .5], ['glutes', 'secondary', .25], ['calves', 'secondary', .15], ['core', 'secondary', .1]) },
  { id: 'sanji-reverse-lunge', name: 'Precision reverse lunge', movement: 'squat', equipment: 'bodyweight', character: 'sanji', muscleTargets: muscleTargets(['quads', 'primary', .55], ['glutes', 'secondary', .3], ['core', 'secondary', .15]) },
  { id: 'sanji-calf-raise', name: 'Single-leg calf raise', movement: 'conditioning', equipment: 'bodyweight', character: 'sanji', muscleTargets: muscleTargets(['calves', 'primary', .85], ['quads', 'secondary', .15]) },
  { id: 'sanji-lateral-bound', name: 'Controlled lateral bound', movement: 'conditioning', equipment: 'bodyweight', character: 'sanji', muscleTargets: muscleTargets(['quads', 'primary', .4], ['calves', 'secondary', .25], ['glutes', 'secondary', .25], ['core', 'secondary', .1]) },
  { id: 'sanji-db-step-up', name: 'Dumbbell step-up drive', movement: 'squat', equipment: 'dumbbells', character: 'sanji', muscleTargets: muscleTargets(['quads', 'primary', .55], ['glutes', 'secondary', .25], ['calves', 'secondary', .1], ['core', 'secondary', .1]) },
  { id: 'sanji-db-rdl', name: 'Single-leg dumbbell Romanian deadlift', movement: 'hinge', equipment: 'dumbbells', character: 'sanji', muscleTargets: muscleTargets(['hamstrings', 'primary', .55], ['glutes', 'secondary', .25], ['core', 'secondary', .1], ['back', 'secondary', .1]) },
  { id: 'sanji-band-step', name: 'Banded lateral step', movement: 'squat', equipment: 'resistance_bands', character: 'sanji', muscleTargets: muscleTargets(['glutes', 'primary', .55], ['quads', 'secondary', .25], ['core', 'secondary', .2]) },
  { id: 'sanji-leg-press', name: 'Controlled unilateral leg press', movement: 'squat', equipment: 'full_gym', character: 'sanji', muscleTargets: muscleTargets(['quads', 'primary', .65], ['glutes', 'secondary', .2], ['calves', 'secondary', .15]) },
  { id: 'baki-tempo-pushup', name: 'Paused tempo push-up', movement: 'push', equipment: 'bodyweight', character: 'baki', muscleTargets: muscleTargets(['chest', 'primary', .55], ['shoulders', 'secondary', .2], ['triceps', 'secondary', .15], ['core', 'secondary', .1]) },
  { id: 'baki-cossack-squat', name: 'Controlled Cossack squat', movement: 'mobility', equipment: 'bodyweight', character: 'baki', muscleTargets: muscleTargets(['quads', 'primary', .45], ['hamstrings', 'secondary', .25], ['glutes', 'secondary', .2], ['core', 'secondary', .1]) },
  { id: 'baki-bear-crawl', name: 'Heavy-tension bear crawl', movement: 'conditioning', equipment: 'bodyweight', character: 'baki', muscleTargets: muscleTargets(['core', 'primary', .35], ['shoulders', 'secondary', .25], ['quads', 'secondary', .2], ['back', 'secondary', .1], ['calves', 'secondary', .1]) },
  { id: 'baki-bridge-march', name: 'Glute-bridge march', movement: 'hinge', equipment: 'bodyweight', character: 'baki', muscleTargets: muscleTargets(['glutes', 'primary', .45], ['hamstrings', 'secondary', .35], ['core', 'secondary', .2]) },
  { id: 'baki-db-push-press', name: 'Controlled dumbbell push press', movement: 'push', equipment: 'dumbbells', character: 'baki', muscleTargets: muscleTargets(['shoulders', 'primary', .5], ['triceps', 'secondary', .2], ['quads', 'secondary', .15], ['core', 'secondary', .15]) },
  { id: 'baki-db-carry', name: 'Heavy dumbbell farmer carry', movement: 'carry', equipment: 'dumbbells', character: 'baki', muscleTargets: muscleTargets(['core', 'primary', .4], ['back', 'secondary', .25], ['shoulders', 'secondary', .2], ['biceps', 'secondary', .15]) },
  { id: 'baki-band-row', name: 'Braced band row', movement: 'pull', equipment: 'resistance_bands', character: 'baki', muscleTargets: muscleTargets(['back', 'primary', .6], ['biceps', 'secondary', .2], ['core', 'secondary', .2]) },
  { id: 'baki-cable-press', name: 'Split-stance cable press', movement: 'push', equipment: 'full_gym', character: 'baki', muscleTargets: muscleTargets(['chest', 'primary', .55], ['shoulders', 'secondary', .2], ['triceps', 'secondary', .2], ['core', 'secondary', .05]) },
  { id: 'mikasa-snow-angel', name: 'Prone reverse snow angel', movement: 'pull', equipment: 'bodyweight', character: 'mikasa', muscleTargets: muscleTargets(['back', 'primary', .55], ['shoulders', 'secondary', .35], ['core', 'secondary', .1]) },
  { id: 'mikasa-step-up', name: 'Fast controlled step-up', movement: 'conditioning', equipment: 'bodyweight', character: 'mikasa', muscleTargets: muscleTargets(['quads', 'primary', .45], ['glutes', 'secondary', .25], ['calves', 'secondary', .15], ['core', 'secondary', .15]) },
  { id: 'mikasa-side-plank', name: 'Side-plank reach', movement: 'core', equipment: 'bodyweight', character: 'mikasa', muscleTargets: muscleTargets(['core', 'primary', .65], ['shoulders', 'secondary', .2], ['glutes', 'secondary', .15]) },
  { id: 'mikasa-split-squat', name: 'Stable split squat', movement: 'squat', equipment: 'bodyweight', character: 'mikasa', muscleTargets: muscleTargets(['quads', 'primary', .5], ['glutes', 'secondary', .25], ['core', 'secondary', .15], ['calves', 'secondary', .1]) },
  { id: 'mikasa-db-carry', name: 'Tactical suitcase carry', movement: 'carry', equipment: 'dumbbells', character: 'mikasa', muscleTargets: muscleTargets(['core', 'primary', .4], ['shoulders', 'secondary', .25], ['back', 'secondary', .25], ['biceps', 'secondary', .1]) },
  { id: 'mikasa-db-row', name: 'Tripod dumbbell row', movement: 'pull', equipment: 'dumbbells', character: 'mikasa', muscleTargets: muscleTargets(['back', 'primary', .6], ['biceps', 'secondary', .2], ['core', 'secondary', .2]) },
  { id: 'mikasa-band-row', name: 'Half-kneeling band row', movement: 'pull', equipment: 'resistance_bands', character: 'mikasa', muscleTargets: muscleTargets(['back', 'primary', .6], ['core', 'secondary', .25], ['biceps', 'secondary', .15]) },
  { id: 'mikasa-ski-erg', name: 'Repeatable ski-erg intervals', movement: 'conditioning', equipment: 'full_gym', character: 'mikasa', muscleTargets: muscleTargets(['back', 'primary', .35], ['shoulders', 'secondary', .2], ['core', 'secondary', .2], ['quads', 'secondary', .15], ['calves', 'secondary', .1]) },
];

const EXERCISE_NAMES_DE: Record<string, string> = {
  'chair-squat': 'Kniebeuge zum Stuhl',
  'split-squat': 'Gestützte Split-Kniebeuge',
  'glute-bridge': 'Glute Bridge',
  'incline-pushup': 'Erhöhte Liegestütze',
  'wall-slide': 'Wall Slide',
  'dead-bug': 'Dead Bug',
  'side-plank': 'Seitstütz',
  march: 'Lockere Marsch-Intervalle',
  'mobility-flow': 'Hüft- und Schulter-Mobilität',
  'step-up': 'Niedriger Step-up',
  'db-goblet-squat': 'Goblet Squat mit Kurzhantel',
  'db-rdl': 'Rumänisches Kreuzheben mit Kurzhanteln',
  'db-floor-press': 'Floor Press mit Kurzhanteln',
  'db-row': 'Gestütztes Kurzhantelrudern',
  'db-carry': 'Suitcase Carry mit Kurzhantel',
  'band-squat': 'Kniebeuge mit Band',
  'band-hinge': 'Hip Hinge mit Band',
  'band-press': 'Brustdrücken mit Band',
  'band-row': 'Rudern mit Band',
  'gym-leg-press': 'Beinpresse',
  'gym-cable-pull': 'Cable Pull-through',
  'gym-chest-press': 'Brustpresse',
  'gym-pulldown': 'Latzug',
  'gym-bike': 'Lockere Fahrrad-Intervalle',
  'toji-split-squat': 'Explosive gestützte Split-Kniebeuge',
  'toji-tempo-pushup': 'Power-Liegestütze mit Tempo',
  'toji-broad-jump': 'Kontrollierte Standweitsprünge',
  'toji-plank': 'Hard-Style Plank',
  'toji-db-rdl': 'Athletisches rumänisches Kreuzheben mit Kurzhanteln',
  'toji-db-carry': 'Schwerer Suitcase Carry',
  'toji-band-row': 'Explosives Rudern mit Band',
  'toji-cable-chop': 'Rotations-Chop am Kabel',
  'goku-volume-squat': 'Volumen-Kniebeugen mit Körpergewicht',
  'goku-volume-pushup': 'Volumen-Liegestütze',
  'goku-burpee': 'Wiederholbare Burpee-Intervalle',
  'goku-hollow': 'Hollow-Body Hold',
  'goku-db-thruster': 'Kurzhantel-Thruster',
  'goku-db-row': 'Volumen-Kurzhantelrudern',
  'goku-band-squat': 'Kniebeuge mit Bandwiderstand',
  'goku-leg-press': 'Volumen-Beinpresse',
  'tanjiro-flow': 'Kontrollierter Hüft- und Schulter-Flow',
  'tanjiro-single-leg': 'Balance-Split-Kniebeuge',
  'tanjiro-pushup': 'Kontrollierte erhöhte Liegestütze',
  'tanjiro-side-plank': 'Seitstütz mit ruhiger Atmung',
  'tanjiro-db-lunge': 'Kontrollierter Reverse Lunge mit Kurzhanteln',
  'tanjiro-db-row': 'Kurzhantelrudern mit Pause',
  'tanjiro-pallof': 'Pallof Press mit Band',
  'tanjiro-bike': 'Ruhige Fahrrad-Atemintervalle',
  'kaneki-lat-sweep': 'Lat Sweep in Bauchlage',
  'kaneki-crawl': 'Kontrollierter Bear Crawl',
  'kaneki-hollow-twist': 'Hollow-Body Twist',
  'kaneki-split-squat': 'Split-Kniebeuge mit langsamer Abwärtsphase',
  'kaneki-renegade-row': 'Kontrolliertes Renegade Row',
  'kaneki-db-carry': 'Versetzter Kurzhantel-Carry',
  'kaneki-band-row': 'Hohes Rudern mit Band',
  'kaneki-cable-row': 'Kabelrudern mit Pause',
  'sanji-skater-squat': 'Gestützte Skater-Kniebeuge',
  'sanji-reverse-lunge': 'Präziser Reverse Lunge',
  'sanji-calf-raise': 'Einbeiniges Wadenheben',
  'sanji-lateral-bound': 'Kontrollierter Seitwärtssprung',
  'sanji-db-step-up': 'Kurzhantel-Step-up mit Kniehub',
  'sanji-db-rdl': 'Einbeiniges rumänisches Kreuzheben mit Kurzhantel',
  'sanji-band-step': 'Seitwärtsschritte mit Band',
  'sanji-leg-press': 'Kontrollierte einbeinige Beinpresse',
  'baki-tempo-pushup': 'Liegestütze mit Pause und Tempo',
  'baki-cossack-squat': 'Kontrollierte Cossack-Kniebeuge',
  'baki-bear-crawl': 'Bear Crawl mit Ganzkörperspannung',
  'baki-bridge-march': 'Glute-Bridge March',
  'baki-db-push-press': 'Kontrollierter Kurzhantel Push Press',
  'baki-db-carry': 'Schwerer Farmer Carry mit Kurzhanteln',
  'baki-band-row': 'Rudern mit Band und Rumpfspannung',
  'baki-cable-press': 'Kabeldrücken im Split-Stand',
  'mikasa-snow-angel': 'Reverse Snow Angel in Bauchlage',
  'mikasa-step-up': 'Schneller kontrollierter Step-up',
  'mikasa-side-plank': 'Seitstütz mit Reichbewegung',
  'mikasa-split-squat': 'Stabile Split-Kniebeuge',
  'mikasa-db-carry': 'Taktischer Suitcase Carry',
  'mikasa-db-row': 'Kurzhantelrudern im Dreipunktstand',
  'mikasa-band-row': 'Halbkniendes Rudern mit Band',
  'mikasa-ski-erg': 'Wiederholbare Ski-Erg-Intervalle',
};

const GOAL_EMPHASIS: Record<TrainingGoal, Record<PlanLanguage, string>> = {
  general_fitness: { de: 'ausgewogene Kraft und alltagstaugliche Kondition', en: 'balanced strength and everyday conditioning' },
  build_muscle: { de: 'kontrolliertes Krafttraining und Erholung', en: 'controlled resistance training and recovery' },
  get_stronger: { de: 'wiederholbare Kraftpraxis mit konservativer Steigerung', en: 'repeatable strength practice with conservative progression' },
  fat_loss: { de: 'konsequentes Ganzkörpertraining und nachhaltige Aktivität', en: 'consistent full-body training and sustainable activity' },
};

const DIET_GUIDANCE: Record<DietPreference, Record<PlanLanguage, string>> = {
  flexible: { de: 'Baue regelmäßige Mahlzeiten aus einer Proteinquelle, Obst oder Gemüse, einer Kohlenhydratquelle und ausreichend Flüssigkeit auf.', en: 'Build regular meals around a protein food, produce, a carbohydrate source, and enough fluids.' },
  omnivore: { de: 'Nutze abwechslungsreiche Proteinquellen, Obst und Gemüse, vollwertige Kohlenhydrate und ausreichend Flüssigkeit.', en: 'Use varied food protein sources, produce, whole-food carbohydrates, and enough fluids.' },
  vegetarian: { de: 'Kombiniere – falls genutzt – Milchprodukte oder Eier mit Bohnen, Linsen, Tofu, Tempeh, Getreide, Obst und Gemüse.', en: 'Rotate dairy or eggs if used with beans, lentils, tofu, tempeh, grains, produce, and enough fluids.' },
  vegan: { de: 'Wechsle zwischen Bohnen, Linsen, Tofu, Tempeh, Sojaprodukten, Getreide, Obst und Gemüse; kläre individuelle Nährstofffragen fachlich ab.', en: 'Rotate beans, lentils, tofu, tempeh, soy foods, grains, produce, and enough fluids; seek qualified advice for individual nutrient needs.' },
};

function profileFor(id?: InspirationProfileId): InspirationProfile | undefined {
  return INSPIRATION_PROFILES.find((profile) => profile.id === id);
}

function desiredPatterns(input: PlanInput, sessionIndex: number): MovementPattern[] {
  const base: MovementPattern[] = ['squat', 'push', 'pull', 'hinge', 'core', 'conditioning', 'mobility', 'carry'];
  if (input.goal === 'get_stronger' || input.goal === 'build_muscle') {
    base.unshift('hinge', 'squat', 'pull', 'push');
  }
  if (input.goal === 'fat_loss') base.unshift('conditioning', 'squat', 'carry');
  if (input.inspirationProfile === 'goku') base.unshift('conditioning', 'mobility');
  if (input.inspirationProfile === 'toji') base.unshift('hinge', 'squat', 'carry');
  if (input.inspirationProfile === 'tanjiro') base.unshift('mobility', 'core', 'conditioning');
  if (input.inspirationProfile === 'kaneki') base.unshift('pull', 'core', 'carry', 'conditioning');
  if (input.inspirationProfile === 'sanji') base.unshift('squat', 'conditioning', 'hinge', 'mobility');
  if (input.inspirationProfile === 'baki') base.unshift('push', 'hinge', 'carry', 'mobility');
  if (input.inspirationProfile === 'mikasa') base.unshift('pull', 'carry', 'core', 'conditioning');
  return [...base.slice(sessionIndex % 4), ...base.slice(0, sessionIndex % 4)];
}

function exerciseCount(input: PlanInput): number {
  const byDifficulty: Record<PlanDifficulty, number> = { light: 3, medium: 4, hard: 5 };
  const base = byDifficulty[input.difficulty];
  return input.experience === 'beginner' ? Math.min(4, base) : base;
}

function setCount(input: PlanInput): number {
  const byDifficulty: Record<PlanDifficulty, number> = { light: 2, medium: 3, hard: 4 };
  const base = byDifficulty[input.difficulty];
  if (input.experience === 'beginner') return Math.min(3, base);
  if (input.age >= 65) return Math.min(3, base);
  return base;
}

function effortCue(input: PlanInput, language: PlanLanguage): string {
  if (input.experience === 'beginner' || input.age < 18 || input.age >= 65) return language === 'de' ? '2–3 Wiederholungen im Tank lassen' : 'leave 2-3 reps in reserve';
  if (input.difficulty === 'hard' && input.experience === 'advanced') return language === 'de' ? '1–2 Wiederholungen im Tank lassen' : 'leave 1-2 reps in reserve';
  return language === 'de' ? '2 Wiederholungen im Tank lassen' : 'leave 2 reps in reserve';
}

function repCue(input: PlanInput, movement: MovementPattern, language: PlanLanguage): string {
  if (movement === 'conditioning') return input.difficulty === 'light'
    ? language === 'de' ? '4 × 30 Sekunden locker' : '4 x 30 seconds easy'
    : language === 'de' ? '6 × 30 Sekunden locker bis moderat' : '6 x 30 seconds easy-moderate';
  if (movement === 'mobility') return language === 'de' ? '5 ruhige Atemzüge je Seite' : '5 slow breaths per side';
  if (movement === 'core' || movement === 'carry') return language === 'de' ? '20–40 Sekunden kontrolliert' : '20-40 seconds, controlled';
  if (input.goal === 'get_stronger') return language === 'de' ? '6–10 kontrollierte Wiederholungen' : '6-10 controlled reps';
  if (input.goal === 'fat_loss') return language === 'de' ? '10–15 kontrollierte Wiederholungen' : '10-15 controlled reps';
  return language === 'de' ? '8–12 kontrollierte Wiederholungen' : '8-12 controlled reps';
}

function selectExercises(input: PlanInput, sessionIndex: number): ExerciseTemplate[] {
  const allowed = new Set(input.equipment);
  const pool = EXERCISES.filter((exercise) => (
    (allowed.has(exercise.equipment) || (input.mode === 'inspiration' && exercise.equipment === 'bodyweight'))
    && (input.mode === 'inspiration'
      ? exercise.character === input.inspirationProfile
      : exercise.character === undefined)
  ));
  const patterns = desiredPatterns(input, sessionIndex);
  const selected: ExerciseTemplate[] = [];

  for (const pattern of patterns) {
    const matches = pool.filter((exercise) => exercise.movement === pattern && !selected.some((item) => item.id === exercise.id));
    if (matches.length) selected.push(matches[sessionIndex % matches.length]);
    if (selected.length >= exerciseCount(input)) break;
  }
  for (const exercise of pool) {
    if (selected.length >= exerciseCount(input)) break;
    if (!selected.some((item) => item.id === exercise.id)) selected.push(exercise);
  }
  return selected;
}

function sessionFocus(input: PlanInput, index: number, language: PlanLanguage): string {
  const labels = language === 'de'
    ? ['Ganzkörper-Basis', 'Bewegungsqualität', 'Kraft und Kontrolle', 'Lockere Kondition', 'Ganzkörper-Variation', 'Technik-Fokus']
    : ['Full body foundation', 'Movement quality', 'Strength and control', 'Easy conditioning', 'Full body variation', 'Technique reset'];
  if (input.inspirationProfile === 'goku' && index % 2 === 1) return language === 'de' ? 'Athletische Kondition' : 'Athletic conditioning';
  if (input.inspirationProfile === 'tanjiro' && index % 2 === 1) return language === 'de' ? 'Balance und Mobilität' : 'Balance and mobility';
  if (input.inspirationProfile === 'toji' && index % 2 === 0) return language === 'de' ? 'Direkte Kraftpraxis' : 'Simple strength practice';
  if (input.inspirationProfile === 'kaneki') return index % 2 === 0 ? language === 'de' ? 'Zugkraft und Rumpfkontrolle' : 'Pull strength and trunk control' : language === 'de' ? 'Adaptive Kondition' : 'Adaptive conditioning';
  if (input.inspirationProfile === 'sanji') return index % 2 === 0 ? language === 'de' ? 'Beinpräzision und Balance' : 'Leg precision and balance' : language === 'de' ? 'Athletische Beinkondition' : 'Athletic leg conditioning';
  if (input.inspirationProfile === 'baki') return index % 2 === 0 ? language === 'de' ? 'Ganzkörperkraft und Spannung' : 'Total-body strength and tension' : language === 'de' ? 'Mobilität unter Kontrolle' : 'Controlled mobility';
  if (input.inspirationProfile === 'mikasa') return index % 2 === 0 ? language === 'de' ? 'Zugkraft und Carry-Kontrolle' : 'Pull and carry control' : language === 'de' ? 'Taktische Ausdauer' : 'Tactical endurance';
  return labels[index % labels.length];
}

export function generateInitialPlan(
  input: PlanInput,
  language: PlanLanguage = 'en',
  nutritionContext: NutritionCalculationContext = {},
): InitialPlan {
  const validation = validatePlanInput(input);
  if (!validation.valid) throw new Error(`Invalid plan input: ${Object.keys(validation.errors).join(', ')}`);

  const inspiration = input.mode === 'inspiration' ? profileFor(input.inspirationProfile) : undefined;
  const inspirationEmphasis: Partial<Record<InspirationProfileId, Record<PlanLanguage, string>>> = {
    toji: { de: 'Kraft und Explosivität', en: 'strength and power' },
    goku: { de: 'Kondition und athletische Vielfalt', en: 'conditioning and athletic variety' },
    tanjiro: { de: 'ausgewogene Kraft, Kondition und Mobilität', en: 'balanced strength, conditioning, and mobility' },
    kaneki: { de: 'Zugkraft, Rumpfkontrolle und Anpassungsfähigkeit', en: 'pulling strength, trunk control, and adaptation' },
    sanji: { de: 'Beinkraft, Balance und präzise Fußarbeit', en: 'leg power, balance, and precise footwork' },
    baki: { de: 'Ganzkörperkraft, Spannung und Mobilität', en: 'full-body strength, bracing, and mobility' },
    mikasa: { de: 'Zugkraft, Rumpfstabilität und Ausdauer', en: 'pulling strength, core stability, and endurance' },
  };
  const emphasis = inspiration
    ? inspirationEmphasis[inspiration.id]?.[language] ?? inspiration.emphasis
    : GOAL_EMPHASIS[input.goal][language];
  const sets = setCount(input);
  const effort = effortCue(input, language);
  const sessions = Array.from({ length: input.daysPerWeek }, (_, index): PlanSession => {
    const exercises = selectExercises(input, index).map((exercise): PlanExercise => ({
      ...exercise,
      name: language === 'de' ? EXERCISE_NAMES_DE[exercise.id] ?? exercise.name : exercise.name,
      sets,
      reps: repCue(input, exercise.movement, language),
      effort,
      muscleTargets: exercise.muscleTargets?.map(target => ({ ...target })),
    }));
    return {
      day: index + 1,
      title: language === 'de' ? `Einheit ${index + 1}` : `Session ${index + 1}`,
      focus: sessionFocus(input, index, language),
      durationMinutes: 25 + exercises.length * 5,
      warmup: language === 'de' ? 'Beginne mit 5–8 Minuten lockerer Bewegung und einem entspannten Aufwärmsatz.' : 'Begin with 5-8 minutes of easy movement and one comfortable practice set.',
      exercises,
      cooldown: language === 'de' ? 'Beende die Einheit mit 3–5 Minuten lockerer Bewegung. Erholung soll sich angenehm und nicht erzwungen anfühlen.' : 'Finish with 3-5 minutes of easy movement. Recovery work should feel comfortable, not forced.',
    };
  });

  const safetyNotes = language === 'de' ? [
    'Starte konservativ und stoppe bei stechendem Schmerz, Brustschmerz, Ohnmacht oder ungewöhnlicher Atemnot.',
    'Nutze stabile Technik und erhöhe erst dann jeweils eine Variable, wenn sich die Einheiten verlässlich beherrschbar anfühlen.',
    'Dieser Startplan ist allgemeine Orientierung, keine medizinische Versorgung und kein Ersatz für eine qualifizierte Untersuchung.',
  ] : [
    'Start conservatively and stop for sharp pain, chest pain, faintness, or unusual shortness of breath.',
    'Use stable technique and increase only one variable at a time after sessions feel consistently manageable.',
    'This starter plan is general guidance, not medical care or a substitute for an assessment by a qualified professional.',
  ];
  if (input.age < 18) {
    safetyNotes.push(language === 'de'
      ? 'Prüfe Trainingsentscheidungen mit einer erziehungsberechtigten Person und qualifizierter Jugend-Trainerbegleitung, bevor du die Schwierigkeit erhöhst.'
      : 'Review training choices with a parent or guardian and a qualified youth coach before increasing difficulty.');
  }

  return {
    schemaVersion: 1,
    generator: 'local-rules-v1',
    createdAt: null,
    sourceLabel: inspiration
      ? language === 'de' ? `${inspiration.name} Inspirationsprofil` : `${inspiration.name} inspiration profile`
      : input.mode === 'guided' ? language === 'de' ? 'Geführter lokaler Plan' : 'Guided local plan'
        : language === 'de' ? 'Eigener Weg' : 'Own Path',
    emphasis,
    difficulty: input.difficulty,
    experience: input.experience,
    daysPerWeek: input.daysPerWeek,
    sessions,
    nutritionTargets: calculateNutritionTargets(input, language, nutritionContext),
    recoveryGuidance: language === 'de'
      ? `Plane nach der forderndsten Einheit mindestens einen leichteren oder freien Tag ein. Die Intensität „${input.difficulty}“ verändert das Volumen, nicht ein versprochenes Ergebnis.`
      : `Place at least one easier or rest day after your most demanding session. The ${input.difficulty} setting changes volume, not a promised outcome.`,
    foodGuidance: DIET_GUIDANCE[input.diet][language],
    safetyNotes,
  };
}
