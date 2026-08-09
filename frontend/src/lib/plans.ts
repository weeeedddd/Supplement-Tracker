export type PlanMode = 'own' | 'inspiration' | 'guided';
export type InspirationProfileId = 'toji' | 'goku' | 'tanjiro';
export type PlanDifficulty = 'light' | 'medium' | 'hard';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type EquipmentOption = 'bodyweight' | 'dumbbells' | 'resistance_bands' | 'full_gym';
export type DietPreference = 'flexible' | 'omnivore' | 'vegetarian' | 'vegan';
export type TrainingGoal = 'general_fitness' | 'build_muscle' | 'get_stronger' | 'fat_loss';
export type PlanLanguage = 'de' | 'en';

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
  method: 'neutral-mifflin-estimate-v1' | 'openai-estimate-v1';
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
const PROFILE_IDS = new Set<InspirationProfileId>(['toji', 'goku', 'tanjiro']);
const DIFFICULTIES = new Set<PlanDifficulty>(['light', 'medium', 'hard']);
const EXPERIENCE = new Set<ExperienceLevel>(['beginner', 'intermediate', 'advanced']);
const EQUIPMENT = new Set<EquipmentOption>(['bodyweight', 'dumbbells', 'resistance_bands', 'full_gym']);
const DIETS = new Set<DietPreference>(['flexible', 'omnivore', 'vegetarian', 'vegan']);
const GOALS = new Set<TrainingGoal>(['general_fitness', 'build_muscle', 'get_stronger', 'fat_loss']);

export function calculateNutritionTargets(input: PlanInput, language: PlanLanguage = 'en'): NutritionTargets {
  const validation = validatePlanInput(input);
  if (!validation.valid) throw new Error(`Invalid nutrition input: ${Object.keys(validation.errors).join(', ')}`);

  // Sex is intentionally not requested. The midpoint of the two Mifflin-St Jeor
  // constants is used as a neutral planning estimate, then adjusted conservatively
  // for scheduled training days and goal. It is a starting point, not a diagnosis.
  const restingEstimate = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age - 78;
  const activityFactor = ({ 2: 1.4, 3: 1.48, 4: 1.55, 5: 1.62, 6: 1.68 } as Record<number, number>)[input.daysPerWeek];
  const goalFactor: Record<TrainingGoal, number> = {
    general_fitness: 1,
    build_muscle: 1.08,
    get_stronger: 1.03,
    fat_loss: .9,
  };
  const rawCalories = restingEstimate * activityFactor * goalFactor[input.goal];
  const targetCalories = Math.max(1_200, Math.min(4_500, Math.round(rawCalories / 10) * 10));
  const proteinFactor: Record<TrainingGoal, number> = {
    general_fitness: 1.6,
    build_muscle: 1.8,
    get_stronger: 1.7,
    fat_loss: 1.9,
  };
  const protein = Math.min(250, Math.round(input.weightKg * proteinFactor[input.goal]));
  const fat = Math.min(140, Math.max(40, Math.round(Math.max(input.weightKg * .7, targetCalories * .22 / 9))));
  const carbs = Math.max(80, Math.round((targetCalories - protein * 4 - fat * 9) / 4));
  const calories = protein * 4 + carbs * 4 + fat * 9;

  return {
    calories,
    protein,
    carbs,
    fat,
    sugar: Math.min(carbs, Math.round(carbs * .2)),
    method: 'neutral-mifflin-estimate-v1',
    note: language === 'de'
      ? 'Ein neutraler Startwert auf Basis von Alter, Größe, Gewicht, Trainingstagen und Ziel. Prüfe ihn anhand echter Gewichts-, Hunger-, Energie- und Trainingsverläufe.'
      : 'A neutral starting estimate based on age, height, weight, training days, and goal. Review it against real weight, hunger, energy, and training trends.',
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
}

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
  const pool = EXERCISES.filter((exercise) => allowed.has(exercise.equipment));
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
  return labels[index % labels.length];
}

export function generateInitialPlan(input: PlanInput, language: PlanLanguage = 'en'): InitialPlan {
  const validation = validatePlanInput(input);
  if (!validation.valid) throw new Error(`Invalid plan input: ${Object.keys(validation.errors).join(', ')}`);

  const inspiration = input.mode === 'inspiration' ? profileFor(input.inspirationProfile) : undefined;
  const inspirationEmphasis: Partial<Record<InspirationProfileId, Record<PlanLanguage, string>>> = {
    toji: { de: 'Kraft und Explosivität', en: 'strength and power' },
    goku: { de: 'Kondition und athletische Vielfalt', en: 'conditioning and athletic variety' },
    tanjiro: { de: 'ausgewogene Kraft, Kondition und Mobilität', en: 'balanced strength, conditioning, and mobility' },
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
    nutritionTargets: calculateNutritionTargets(input, language),
    recoveryGuidance: language === 'de'
      ? `Plane nach der forderndsten Einheit mindestens einen leichteren oder freien Tag ein. Die Intensität „${input.difficulty}“ verändert das Volumen, nicht ein versprochenes Ergebnis.`
      : `Place at least one easier or rest day after your most demanding session. The ${input.difficulty} setting changes volume, not a promised outcome.`,
    foodGuidance: DIET_GUIDANCE[input.diet][language],
    safetyNotes,
  };
}
